const fs = require('fs/promises');
const crypto = require('crypto');

/**
 * Contact form submissions, stored on disk.
 *
 * Email delivery is best effort: SMTP can be misconfigured, rate limited, or simply
 * down, and before this store a failed send meant the message was gone for good. Every
 * submission is written here first so the owner can always read it in the admin inbox.
 */

/** Oldest messages are dropped past this, so a spam run cannot grow the file forever. */
const MAX_STORED_MESSAGES = 1000;

function createId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function toIso(value, fallback) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function normalizeMessage(raw, nowIso) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(source.id || createId()),
    name: String(source.name || ''),
    email: String(source.email || ''),
    message: String(source.message || ''),
    createdAt: toIso(source.createdAt, nowIso),
    read: Boolean(source.read),
    readAt: source.readAt ? toIso(source.readAt, null) : null,
    emailed: Boolean(source.emailed),
    emailError: source.emailError ? String(source.emailError) : null,
    ip: String(source.ip || ''),
    userAgent: String(source.userAgent || ''),
  };
}

function createMessageStore({ messagesFile }) {
  let cache = null;
  let writeChain = Promise.resolve();

  async function readFromDisk() {
    let raw;
    try {
      raw = await fs.readFile(messagesFile, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return [];
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error('Invalid messages.json content.');
    }
    if (!Array.isArray(parsed)) return [];
    const nowIso = new Date().toISOString();
    return parsed.map(entry => normalizeMessage(entry, nowIso));
  }

  async function writeAtomically(messages) {
    const payload = `${JSON.stringify(messages, null, 2)}\n`;
    const tempPath = `${messagesFile}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, payload, 'utf8');
    try {
      await fs.rename(tempPath, messagesFile);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  function queueWrite(task) {
    const run = writeChain.then(task, task);
    writeChain = run.catch(() => {});
    return run;
  }

  async function ensureLoaded() {
    if (!cache) cache = await readFromDisk();
    return cache;
  }

  async function loadMessages() {
    return (await ensureLoaded()).slice();
  }

  /** Runs `mutator` against the live list and persists whatever it leaves behind. */
  function mutate(mutator) {
    return queueWrite(async () => {
      const messages = await ensureLoaded();
      const result = mutator(messages);
      if (messages.length > MAX_STORED_MESSAGES) {
        messages.splice(MAX_STORED_MESSAGES);
      }
      await writeAtomically(messages);
      cache = messages;
      return result;
    });
  }

  async function addMessage({ name, email, message, ip, userAgent }) {
    const entry = normalizeMessage(
      { id: createId(), name, email, message, ip, userAgent, createdAt: new Date().toISOString() },
      new Date().toISOString()
    );
    await mutate(messages => {
      messages.unshift(entry);
    });
    return entry;
  }

  /** Records whether the notification email for `id` went out, without failing the request. */
  async function recordEmailResult(id, { emailed, error }) {
    return mutate(messages => {
      const found = messages.find(item => item.id === id);
      if (!found) return null;
      found.emailed = Boolean(emailed);
      found.emailError = error ? String(error).slice(0, 500) : null;
      return found;
    });
  }

  async function setRead(id, read) {
    return mutate(messages => {
      const found = messages.find(item => item.id === id);
      if (!found) throw new Error('Message not found.');
      found.read = Boolean(read);
      found.readAt = read ? new Date().toISOString() : null;
      return found;
    });
  }

  async function deleteMessage(id) {
    return mutate(messages => {
      const index = messages.findIndex(item => item.id === id);
      if (index === -1) throw new Error('Message not found.');
      const [removed] = messages.splice(index, 1);
      return removed;
    });
  }

  function invalidateCache() {
    cache = null;
  }

  return {
    loadMessages,
    addMessage,
    recordEmailResult,
    setRead,
    deleteMessage,
    invalidateCache,
  };
}

module.exports = { createMessageStore, MAX_STORED_MESSAGES };
