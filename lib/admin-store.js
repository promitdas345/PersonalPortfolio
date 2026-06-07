const fs = require('fs/promises');
const crypto = require('crypto');

const ROLE_NAMES = ['owner', 'admin', 'editor', 'author'];

const ROLE_CAPABILITIES = {
  owner: ['*'],
  admin: [
    'admin.workspace',
    'inline.edit',
    'users.read',
    'users.invite',
    'users.roles.write',
    'users.status.write',
    'content.posts.read',
    'content.posts.create',
    'content.posts.edit.any',
    'content.posts.submit_review',
    'content.posts.approve',
    'content.posts.publish',
    'content.posts.schedule',
    'content.posts.archive',
    'content.projects.read',
    'content.projects.create',
    'content.projects.edit.any',
    'content.projects.archive',
    'workflow.read',
    'workflow.manage',
    'media.manage',
    'settings.manage',
    'previews.create',
    'audit.read',
  ],
  editor: [
    'admin.workspace',
    'inline.edit',
    'content.posts.read',
    'content.posts.create',
    'content.posts.edit.any',
    'content.posts.submit_review',
    'content.posts.approve',
    'content.posts.publish',
    'content.posts.schedule',
    'content.posts.archive',
    'content.projects.read',
    'content.projects.create',
    'content.projects.edit.any',
    'content.projects.archive',
    'workflow.read',
    'media.manage',
    'previews.create',
    'audit.read',
  ],
  author: [
    'admin.workspace',
    'content.posts.read',
    'content.posts.create',
    'content.posts.edit.own',
    'content.posts.submit_review',
    'content.projects.read',
    'content.projects.create',
    'content.projects.edit.own',
    'workflow.read',
    'previews.create',
  ],
};

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function toIso(value, fallback) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeRoleList(rawRoles) {
  const fallback = ['author'];
  if (!Array.isArray(rawRoles)) return fallback;
  const unique = Array.from(
    new Set(
      rawRoles
        .map(role => String(role || '').trim().toLowerCase())
        .filter(role => ROLE_NAMES.includes(role))
    )
  );
  return unique.length ? unique : fallback;
}

function normalizeUser(rawUser, nowIso, defaults = {}) {
  const raw = rawUser && typeof rawUser === 'object' ? rawUser : {};
  const createdAt = toIso(raw.createdAt, nowIso);
  const updatedAt = toIso(raw.updatedAt, createdAt);
  const status = ['active', 'locked', 'invited', 'disabled'].includes(String(raw.status || '').toLowerCase())
    ? String(raw.status).toLowerCase()
    : 'active';
  return {
    id: String(raw.id || '').trim() || createId(),
    email: String(raw.email || defaults.ownerEmail || '').trim().toLowerCase(),
    displayName: String(raw.displayName || '').trim(),
    passwordHash: String(raw.passwordHash || defaults.ownerPasswordHash || '').trim(),
    roles: sanitizeRoleList(raw.roles || defaults.ownerRoles),
    status,
    totpEnabled: Boolean(raw.totpEnabled),
    totpSecret: String(raw.totpSecret || '').trim(),
    totpTempSecret: String(raw.totpTempSecret || '').trim(),
    createdAt,
    updatedAt,
    lastLoginAt: raw.lastLoginAt ? toIso(raw.lastLoginAt, updatedAt) : null,
  };
}

function normalizeSiteSettings(rawSettings) {
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const seo = raw.seo && typeof raw.seo === 'object' ? raw.seo : {};
  const blog = raw.blog && typeof raw.blog === 'object' ? raw.blog : {};
  return {
    seo: {
      titleSuffix: String(seo.titleSuffix || " | Promit's Portfolio").trim(),
      description: String(seo.description || '').trim(),
    },
    blog: {
      defaultPreviewHours: Number.isFinite(Number(blog.defaultPreviewHours))
        ? Math.max(1, Math.min(168, Number(blog.defaultPreviewHours)))
        : 72,
      allowPublicReactions: blog.allowPublicReactions !== false,
      maxImagesPerPost: Number.isFinite(Number(blog.maxImagesPerPost))
        ? Math.max(1, Math.min(20, Number(blog.maxImagesPerPost)))
        : 8,
    },
  };
}

function normalizePreviewToken(rawToken, nowIso) {
  const raw = rawToken && typeof rawToken === 'object' ? rawToken : {};
  const createdAt = toIso(raw.createdAt, nowIso);
  return {
    id: String(raw.id || '').trim() || createId(),
    entityType: String(raw.entityType || '').trim().toLowerCase(),
    entityId: String(raw.entityId || '').trim(),
    tokenHash: String(raw.tokenHash || '').trim(),
    expiresAt: toIso(raw.expiresAt, createdAt),
    createdBy: raw.createdBy ? String(raw.createdBy) : null,
    createdAt,
  };
}

function normalizeAuditLog(rawLog, nowIso) {
  const raw = rawLog && typeof rawLog === 'object' ? rawLog : {};
  return {
    id: String(raw.id || '').trim() || createId(),
    actorId: raw.actorId ? String(raw.actorId) : null,
    action: String(raw.action || '').trim(),
    entityType: String(raw.entityType || '').trim(),
    entityId: raw.entityId ? String(raw.entityId) : null,
    beforeJson: raw.beforeJson || null,
    afterJson: raw.afterJson || null,
    ip: String(raw.ip || '').trim(),
    userAgent: String(raw.userAgent || '').trim(),
    createdAt: toIso(raw.createdAt, nowIso),
  };
}

function normalizeWorkflowEvent(rawEvent, nowIso) {
  const raw = rawEvent && typeof rawEvent === 'object' ? rawEvent : {};
  return {
    id: String(raw.id || '').trim() || createId(),
    entityType: String(raw.entityType || '').trim(),
    entityId: String(raw.entityId || '').trim(),
    fromStatus: String(raw.fromStatus || '').trim(),
    toStatus: String(raw.toStatus || '').trim(),
    note: String(raw.note || '').trim(),
    changedBy: raw.changedBy ? String(raw.changedBy) : null,
    createdAt: toIso(raw.createdAt, nowIso),
  };
}

function normalizeRevision(rawRevision, nowIso) {
  const raw = rawRevision && typeof rawRevision === 'object' ? rawRevision : {};
  return {
    id: String(raw.id || '').trim() || createId(),
    entityType: String(raw.entityType || '').trim(),
    entityId: String(raw.entityId || '').trim(),
    version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : 1,
    snapshotJson: raw.snapshotJson || null,
    changedBy: raw.changedBy ? String(raw.changedBy) : null,
    createdAt: toIso(raw.createdAt, nowIso),
  };
}

function normalizeSession(rawSession, nowIso) {
  const raw = rawSession && typeof rawSession === 'object' ? rawSession : {};
  return {
    tokenHash: String(raw.tokenHash || '').trim(),
    id: String(raw.id || '').trim(),
    userId: String(raw.userId || '').trim(),
    csrfToken: String(raw.csrfToken || '').trim(),
    createdAt: toIso(raw.createdAt, nowIso),
    lastSeenAt: toIso(raw.lastSeenAt, nowIso),
    ip: String(raw.ip || '').trim(),
    userAgent: String(raw.userAgent || '').trim(),
    expiresAt: Number.isFinite(Number(raw.expiresAt)) ? Number(raw.expiresAt) : Date.now(),
  };
}

function normalizeStore(rawStore, defaults = {}) {
  const raw = rawStore && typeof rawStore === 'object' ? rawStore : {};
  const nowIso = new Date().toISOString();
  const users = Array.isArray(raw.users) ? raw.users : [];
  const normalizedUsers = users
    .map(user => normalizeUser(user, nowIso, defaults))
    .filter(user => user.email && user.passwordHash);

  if (!normalizedUsers.length && defaults.ownerEmail && defaults.ownerPasswordHash) {
    normalizedUsers.push(
      normalizeUser(
        {
          email: defaults.ownerEmail,
          passwordHash: defaults.ownerPasswordHash,
          roles: ['owner'],
          status: 'active',
        },
        nowIso,
        defaults
      )
    );
  }

  return {
    users: normalizedUsers,
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).map(s => normalizeSession(s, nowIso)),
    invites: Array.isArray(raw.invites) ? raw.invites : [],
    mediaAssets: Array.isArray(raw.mediaAssets) ? raw.mediaAssets : [],
    siteSettings: normalizeSiteSettings(raw.siteSettings),
    previewTokens: (Array.isArray(raw.previewTokens) ? raw.previewTokens : []).map(token =>
      normalizePreviewToken(token, nowIso)
    ),
    auditLogs: (Array.isArray(raw.auditLogs) ? raw.auditLogs : []).map(log => normalizeAuditLog(log, nowIso)),
    workflowEvents: (Array.isArray(raw.workflowEvents) ? raw.workflowEvents : []).map(event =>
      normalizeWorkflowEvent(event, nowIso)
    ),
    revisions: (Array.isArray(raw.revisions) ? raw.revisions : []).map(revision =>
      normalizeRevision(revision, nowIso)
    ),
    loginAttempts: Array.isArray(raw.loginAttempts) ? raw.loginAttempts : [],
    scheduledJobs: Array.isArray(raw.scheduledJobs) ? raw.scheduledJobs : [],
  };
}

function buildCapabilities(roles) {
  const roleList = sanitizeRoleList(roles);
  if (roleList.includes('owner')) return ['*'];
  const capabilitySet = new Set();
  for (const role of roleList) {
    for (const capability of ROLE_CAPABILITIES[role] || []) {
      capabilitySet.add(capability);
    }
  }
  return Array.from(capabilitySet);
}

function hasCapability(capabilities, capability) {
  if (!Array.isArray(capabilities)) return false;
  if (capabilities.includes('*')) return true;
  return capabilities.includes(capability);
}

function userCapabilities(user) {
  if (!user) return [];
  return buildCapabilities(user.roles);
}

function canInlineEdit(user) {
  return hasCapability(userCapabilities(user), 'inline.edit');
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: sanitizeRoleList(user.roles),
    status: user.status,
    totpEnabled: Boolean(user.totpEnabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function sanitizeStoreForWrite(store) {
  return {
    users: store.users || [],
    sessions: store.sessions || [],
    invites: store.invites || [],
    mediaAssets: store.mediaAssets || [],
    siteSettings: store.siteSettings || {},
    previewTokens: store.previewTokens || [],
    auditLogs: store.auditLogs || [],
    workflowEvents: store.workflowEvents || [],
    revisions: store.revisions || [],
    loginAttempts: store.loginAttempts || [],
    scheduledJobs: store.scheduledJobs || [],
  };
}

function createAdminStore({ filePath, ownerEmail, ownerPasswordHash }) {
  let cache = null;
  let writeChain = Promise.resolve();

  async function writeStore(nextStore) {
    const payload = `${JSON.stringify(sanitizeStoreForWrite(nextStore), null, 2)}\n`;
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, filePath);
  }

  async function ensureLoaded() {
    if (cache) {
      return cache;
    }
    let parsed = null;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (err) {
      parsed = null;
    }
    const normalized = normalizeStore(parsed, {
      ownerEmail,
      ownerPasswordHash,
      ownerRoles: ['owner'],
    });
    cache = normalized;
    if (!parsed || JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await writeStore(normalized);
    }
    return cache;
  }

  function queue(task) {
    const run = writeChain.then(task, task);
    writeChain = run.catch(() => { });
    return run;
  }

  async function loadStore() {
    const loaded = await ensureLoaded();
    return deepClone(loaded);
  }

  async function mutateStore(mutator) {
    return queue(async () => {
      const current = await ensureLoaded();
      const working = deepClone(current);
      const result = await mutator(working);
      const normalized = normalizeStore(working, {
        ownerEmail,
        ownerPasswordHash,
        ownerRoles: ['owner'],
      });
      await writeStore(normalized);
      cache = normalized;
      return {
        store: deepClone(normalized),
        result,
      };
    });
  }

  return {
    loadStore,
    mutateStore,
  };
}

module.exports = {
  ROLE_NAMES,
  ROLE_CAPABILITIES,
  buildCapabilities,
  hasCapability,
  userCapabilities,
  canInlineEdit,
  publicUser,
  createAdminStore,
};
