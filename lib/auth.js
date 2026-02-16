const fs = require('fs/promises');
const crypto = require('crypto');
const { createId, parseCookies, serializeCookie, isSecureRequest, sendJson, loginKey } = require('./http');
const { publicUser, userCapabilities, hasCapability, canInlineEdit, createAdminStore } = require('./admin-store');

const ADMIN_SESSION_COOKIE = 'portfolio_admin_session';
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = Math.max(1, Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS) || 5);
const LOGIN_RATE_LIMIT_WINDOW_MS = Math.max(60_000, Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000);
const LOGIN_RATE_LIMIT_LOCKOUT_MS = Math.max(60_000, Number(process.env.LOGIN_RATE_LIMIT_LOCKOUT_MS) || 15 * 60 * 1000);

function createPasswordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `v2:${salt}:${hash}`;
}

function parsePasswordHash(storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length === 3 && parts[0] === 'v2') {
    return { version: 'v2', salt: parts[1], hash: parts[2] };
  }
  // Fallback to legacy (salt:hash)
  if (parts.length === 2) {
    return { version: 'v1', salt: parts[0], hash: parts[1] };
  }
  return null;
}

function verifyPassword(password, storedHash) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;

  if (parsed.version === 'v2') {
    const candidate = crypto.scryptSync(String(password || ''), parsed.salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(parsed.hash, 'hex'));
  }

  // Legacy PBKDF2 verification
  const candidate = crypto.pbkdf2Sync(String(password || ''), parsed.salt, 120000, 64, 'sha512').toString('hex');
  if (candidate.length !== parsed.hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(parsed.hash, 'hex'));
}

function getRequestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return String(req.socket.remoteAddress || '');
}

function getRequestUserAgent(req) {
  return String(req.headers['user-agent'] || '');
}

function getRateLimitKeys(login, ip) {
  const keys = [];
  const loginValue = loginKey(login);
  if (loginValue) keys.push(`login:${loginValue}`);
  const ipValue = String(ip || '').trim();
  if (ipValue) keys.push(`ip:${ipValue}`);
  return Array.from(new Set(keys));
}

function parseTimeMs(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function ensureLoginAttempts(store) {
  if (!Array.isArray(store.loginAttempts)) {
    store.loginAttempts = [];
  }
  return store.loginAttempts;
}

function pruneLoginAttempts(store, nowMs) {
  const attempts = ensureLoginAttempts(store);
  const cutoff = nowMs - LOGIN_RATE_LIMIT_WINDOW_MS * 2;
  store.loginAttempts = attempts.filter(item => {
    const lockedUntilMs = parseTimeMs(item.lockedUntil);
    if (lockedUntilMs > nowMs) return true;
    const lastAttemptMs = parseTimeMs(item.lastAttemptAt);
    if (!lastAttemptMs) return false;
    return lastAttemptMs >= cutoff;
  });
}

function createAuthSystem(config) {
  const {
    adminAuthFile,
    adminStoreFile,
    defaultUsername,
    defaultEmail,
    defaultPassword,
    updatePosts,
  } = config;

  const adminSessions = new Map();
  let adminAuthCache = null;
  let adminStore = null;
  let adminStorePromise = null;
  let schedulerHandle = null;
  let ownerUsernameKey = loginKey(defaultUsername);

  async function writeAdminAuthRecord(record) {
    const tempPath = `${adminAuthFile}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, adminAuthFile);
    adminAuthCache = record;
  }

  async function loadAdminAuthRecord() {
    if (adminAuthCache) return adminAuthCache;
    try {
      const parsed = JSON.parse(await fs.readFile(adminAuthFile, 'utf8'));
      if (!parsePasswordHash(parsed.passwordHash)) throw new Error('Invalid auth format');
      const storedUsername = loginKey(parsed.username || defaultUsername) || defaultUsername;
      ownerUsernameKey = loginKey(storedUsername);
      adminAuthCache = {
        username: storedUsername,
        passwordHash: String(parsed.passwordHash),
        updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      };
      return adminAuthCache;
    } catch (err) {
      if (!err || err.code !== 'ENOENT') {
        throw new Error(`Could not load admin credentials: ${err.message || 'unknown error'}`);
      }
      const initialUsername = loginKey(defaultUsername) || defaultUsername;
      ownerUsernameKey = loginKey(initialUsername);
      const defaultRecord = {
        username: initialUsername,
        passwordHash: createPasswordHash(defaultPassword),
        updatedAt: new Date().toISOString(),
      };
      await writeAdminAuthRecord(defaultRecord);
      return defaultRecord;
    }
  }

  async function ensureAdminStore() {
    if (adminStore) return adminStore;
    if (!adminStorePromise) {
      adminStorePromise = (async () => {
        const auth = await loadAdminAuthRecord();
        adminStore = createAdminStore({
          filePath: adminStoreFile,
          ownerEmail: defaultEmail,
          ownerPasswordHash: auth.passwordHash,
        });
        return adminStore;
      })();
    }
    return adminStorePromise;
  }

  async function loadStore() {
    const store = await ensureAdminStore();
    return store.loadStore();
  }

  async function mutateStore(mutator) {
    const store = await ensureAdminStore();
    return store.mutateStore(mutator);
  }

  function evaluateLoginRateLimit(store, login, ip, nowMs = Date.now()) {
    const attempts = ensureLoginAttempts(store);
    const keys = getRateLimitKeys(login, ip);
    let retryAfterMs = 0;

    for (const key of keys) {
      const attempt = attempts.find(item => item.key === key);
      if (!attempt) continue;
      const lockedUntilMs = parseTimeMs(attempt.lockedUntil);
      if (lockedUntilMs > nowMs) {
        retryAfterMs = Math.max(retryAfterMs, lockedUntilMs - nowMs);
      }
    }

    return {
      limited: retryAfterMs > 0,
      retryAfterMs,
      keys,
    };
  }

  function clearLoginFailures(store, login, ip) {
    const keys = new Set(getRateLimitKeys(login, ip));
    if (!keys.size) return;
    const attempts = ensureLoginAttempts(store);
    store.loginAttempts = attempts.filter(item => !keys.has(item.key));
  }

  function registerLoginFailure(store, login, ip, nowMs = Date.now()) {
    const nowIso = new Date(nowMs).toISOString();
    const keys = getRateLimitKeys(login, ip);
    const attempts = ensureLoginAttempts(store);

    for (const key of keys) {
      let attempt = attempts.find(item => item.key === key);
      if (!attempt) {
        attempt = {
          key,
          attemptCount: 0,
          lockedUntil: null,
          lastAttemptAt: null,
        };
        attempts.push(attempt);
      }

      const lockedUntilMs = parseTimeMs(attempt.lockedUntil);
      if (lockedUntilMs > nowMs) {
        continue;
      }

      const lastAttemptMs = parseTimeMs(attempt.lastAttemptAt);
      const inWindow = lastAttemptMs > 0 && nowMs - lastAttemptMs <= LOGIN_RATE_LIMIT_WINDOW_MS;
      const nextCount = (inWindow ? Number(attempt.attemptCount) || 0 : 0) + 1;

      attempt.lastAttemptAt = nowIso;
      if (nextCount >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
        attempt.attemptCount = 0;
        attempt.lockedUntil = new Date(nowMs + LOGIN_RATE_LIMIT_LOCKOUT_MS).toISOString();
      } else {
        attempt.attemptCount = nextCount;
        attempt.lockedUntil = null;
      }
    }

    pruneLoginAttempts(store, nowMs);
    return evaluateLoginRateLimit(store, login, ip, nowMs);
  }

  async function recordFailedLogin(login, ip) {
    const nowMs = Date.now();
    const result = await mutateStore(store => registerLoginFailure(store, login, ip, nowMs));
    return result.result;
  }

  function addAudit(store, payload) {
    store.auditLogs.unshift({
      id: createId(),
      actorId: payload.actorId || null,
      action: String(payload.action || '').trim(),
      entityType: String(payload.entityType || '').trim(),
      entityId: payload.entityId ? String(payload.entityId) : null,
      beforeJson: payload.beforeJson || null,
      afterJson: payload.afterJson || null,
      ip: String(payload.ip || ''),
      userAgent: String(payload.userAgent || ''),
      createdAt: new Date().toISOString(),
    });
    if (store.auditLogs.length > 2000) store.auditLogs.length = 2000;
  }

  function addWorkflowEvent(store, payload) {
    store.workflowEvents.unshift({
      id: createId(),
      entityType: payload.entityType,
      entityId: String(payload.entityId),
      fromStatus: payload.fromStatus,
      toStatus: payload.toStatus,
      note: payload.note || '',
      changedBy: payload.changedBy || null,
      createdAt: new Date().toISOString(),
    });
    if (store.workflowEvents.length > 2000) store.workflowEvents.length = 2000;
  }

  function addRevision(store, payload) {
    const version = store.revisions
      .filter(item => item.entityType === payload.entityType && String(item.entityId) === String(payload.entityId))
      .reduce((max, item) => Math.max(max, Number(item.version) || 1), 0);
    store.revisions.unshift({
      id: createId(),
      entityType: payload.entityType,
      entityId: String(payload.entityId),
      version: version + 1,
      snapshotJson: payload.snapshotJson || null,
      changedBy: payload.changedBy || null,
      createdAt: new Date().toISOString(),
    });
    if (store.revisions.length > 4000) store.revisions.length = 4000;
  }

  function clearExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of adminSessions.entries()) {
      if (session.expiresAt <= now) adminSessions.delete(token);
    }
  }

  function createSession(user, req) {
    clearExpiredSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const session = {
      id: createId(),
      userId: user.id,
      csrfToken: crypto.randomBytes(24).toString('hex'),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      ip: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
    };
    adminSessions.set(token, session);
    return { token, session };
  }

  function getSession(req) {
    clearExpiredSessions();
    const token = parseCookies(req.headers.cookie || '')[ADMIN_SESSION_COOKIE];
    if (!token) return null;
    const session = adminSessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      adminSessions.delete(token);
      return null;
    }
    session.lastSeenAt = new Date().toISOString();
    return { token, ...session };
  }

  function loginMatchesUser(user, identifier) {
    const key = loginKey(identifier);
    if (!key) return false;
    if (user.email === key) return true;
    return user.roles.includes('owner') && key === ownerUsernameKey;
  }

  async function authContext(req) {
    const session = getSession(req);
    const store = await loadStore();
    if (!session) return { session: null, user: null, capabilities: [], store };
    const user = store.users.find(candidate => candidate.id === session.userId && candidate.status === 'active');
    if (!user) {
      adminSessions.delete(session.token);
      return { session: null, user: null, capabilities: [], store };
    }
    return { session, user, capabilities: userCapabilities(user), store };
  }

  async function requireAuth(req, res) {
    const context = await authContext(req);
    if (!context.user) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return null;
    }
    return context;
  }

  function requireCapability(context, capability, res) {
    if (hasCapability(context.capabilities, capability)) return true;
    sendJson(res, 403, { success: false, error: 'You do not have permission for this action.' });
    return false;
  }

  function sessionPayload(context) {
    return {
      authenticated: Boolean(context.user),
      defaultUsername: adminAuthCache && adminAuthCache.username ? adminAuthCache.username : defaultUsername,
      user: context.user ? publicUser(context.user) : null,
      roles: context.user ? context.user.roles : [],
      capabilities: context.capabilities || [],
      canInlineEdit: Boolean(context.user && canInlineEdit(context.user)),
      csrfToken: context.session ? context.session.csrfToken : null,
    };
  }

  async function schedulerTick() {
    const nowIso = new Date().toISOString();
    const result = await updatePosts(posts => {
      const published = [];
      posts.forEach((post, index) => {
        if (post.status !== 'scheduled' || !post.scheduledAt) return;
        if (new Date(post.scheduledAt).getTime() > Date.now()) return;
        posts[index] = {
          ...post,
          status: 'published',
          publishedAt: nowIso,
          updatedAt: nowIso,
          archivedAt: null,
        };
        published.push(post.id);
      });
      return { result: published };
    });
    if (!Array.isArray(result.result) || !result.result.length) return;
    await mutateStore(store => {
      result.result.forEach(postId => {
        addWorkflowEvent(store, {
          entityType: 'post',
          entityId: postId,
          fromStatus: 'scheduled',
          toStatus: 'published',
          note: 'Published by scheduler.',
          changedBy: 'system',
        });
      });
    });
  }

  function startScheduler() {
    if (schedulerHandle) return;
    schedulerTick().catch(() => { });
    schedulerHandle = setInterval(() => schedulerTick().catch(() => { }), 30_000);
  }

  function deleteSession(token) {
    adminSessions.delete(token);
  }

  return {
    loadAdminAuthRecord,
    ensureAdminStore,
    loadStore,
    mutateStore,
    addAudit,
    addWorkflowEvent,
    addRevision,
    createSession,
    getSession,
    deleteSession,
    loginMatchesUser,
    authContext,
    requireAuth,
    requireCapability,
    sessionPayload,
    evaluateLoginRateLimit,
    clearLoginFailures,
    recordFailedLogin,
    getRequestIp,
    getRequestUserAgent,
    verifyPassword,
    startScheduler,
    ADMIN_SESSION_COOKIE,
    ADMIN_SESSION_TTL_MS,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  };
}

module.exports = { createAuthSystem };
