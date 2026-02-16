const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const MAX_BODY_BYTES = 4 * 1024 * 1024;

const MIME_TYPES = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const EDITABLE_EXTENSIONS = new Set(['.html', '.json', '.txt', '.md', '.css', '.js', '.svg']);

const send = (res, statusCode, body, headers = {}) => {
  res.writeHead(statusCode, headers);
  res.end(body);
};

const sendJson = (res, statusCode, payload, headers = {}) =>
  send(res, statusCode, JSON.stringify(payload), { 'Content-Type': 'application/json', ...headers });

const sendHtml = (res, html, statusCode = 200) =>
  send(res, statusCode, html, { 'Content-Type': 'text/html' });

const sendText = (res, statusCode, text) =>
  send(res, statusCode, text, { 'Content-Type': 'text/plain; charset=utf-8' });

const createId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

const trim = (value, max) => String(value || '').trim().slice(0, max);

const loginKey = value => String(value || '').trim().toLowerCase();

const parseIso = value => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const isIsoDate = value =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
  !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());

function parseCookies(cookieValue = '') {
  return cookieValue
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const index = item.indexOf('=');
      if (index < 0) return acc;
      acc[item.slice(0, index)] = decodeURIComponent(item.slice(index + 1));
      return acc;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function isSecureRequest(req) {
  if (req.socket && req.socket.encrypted) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}

function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (err) {
    return false;
  }
}

function enforceMutationGuards(req, res, session, requireCsrf = true) {
  if (!validOrigin(req)) {
    sendJson(res, 403, { success: false, error: 'Invalid request origin.' });
    return false;
  }
  if (session && requireCsrf) {
    const csrf = String(req.headers['x-csrf-token'] || '').trim();
    if (!csrf || csrf !== session.csrfToken) {
      sendJson(res, 403, { success: false, error: 'Invalid CSRF token.' });
      return false;
    }
  }
  return true;
}

async function readBodyBuffer(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const raw = (await readBodyBuffer(req, maxBytes)).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Invalid JSON');
  }
}

function createStaticFileServer(publicDir) {
  async function getStaticFile(relativePath) {
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolute = path.resolve(publicDir, normalized);
    const publicRoot = path.resolve(publicDir);
    if (!absolute.startsWith(`${publicRoot}${path.sep}`)) return null;
    try {
      const ext = path.extname(absolute).toLowerCase();
      const content = await fs.readFile(absolute);
      return { content, contentType: MIME_TYPES[ext] || 'application/octet-stream' };
    } catch (err) {
      return null;
    }
  }

  return { getStaticFile };
}

function createEditableFileResolver({ viewsDir, dataDir, publicDir }) {
  return function resolveEditablePath(rawPath) {
    const normalized = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!normalized) throw new Error('File path is required.');
    let root = null;
    if (normalized.startsWith('views/')) root = viewsDir;
    else if (normalized.startsWith('data/')) root = dataDir;
    else if (normalized.startsWith('public/')) root = publicDir;
    else throw new Error('Only files under views/, data/, and public/ are editable.');
    const relative = normalized.replace(/^(views|data|public)\//, '');
    const absolutePath = path.resolve(root, relative);
    const rootResolved = path.resolve(root);
    if (absolutePath !== rootResolved && !absolutePath.startsWith(`${rootResolved}${path.sep}`)) {
      throw new Error('Invalid file path.');
    }
    if (!EDITABLE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      throw new Error('This file type is not editable from admin.');
    }
    return { displayPath: normalized, absolutePath };
  };
}

module.exports = {
  send,
  sendJson,
  sendHtml,
  sendText,
  createId,
  trim,
  loginKey,
  parseIso,
  isIsoDate,
  parseCookies,
  serializeCookie,
  isSecureRequest,
  validOrigin,
  enforceMutationGuards,
  readBodyBuffer,
  parseJsonBody,
  createStaticFileServer,
  createEditableFileResolver,
  MIME_TYPES,
  EDITABLE_EXTENSIONS,
  MAX_BODY_BYTES,
};
