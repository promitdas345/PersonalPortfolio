require('dotenv').config();

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { createLoaders } = require('./lib/data');
const { createRenderer } = require('./lib/templates');
const { send, sendText, createStaticFileServer, createEditableFileResolver } = require('./lib/http');
const { createAuthSystem } = require('./lib/auth');
const { createHtmlBuilders } = require('./lib/html-builders');
const { createApiRoutes } = require('./routes/api');
const { createPageRoutes } = require('./routes/pages');

const BASE_DIR = __dirname;
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const VIEWS_DIR = path.join(BASE_DIR, 'views');
const DATA_DIR = path.join(BASE_DIR, 'data');

const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PACMAN_SECTION_FILE = path.join(VIEWS_DIR, 'partials', 'pacman-section.html');
const ANALYTICS_PARTIAL_FILE = path.join(VIEWS_DIR, 'partials', 'analytics.html');
const ADMIN_AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');
const ADMIN_STORE_FILE = path.join(DATA_DIR, 'admin-store.json');

const ADMIN_DEFAULT_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim();
const ADMIN_DEFAULT_EMAIL = String(process.env.ADMIN_EMAIL || `${ADMIN_DEFAULT_USERNAME}@local`).toLowerCase();
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || `CHANGE_ME_${crypto.randomBytes(8).toString('hex')}`;

const renderTemplate = createRenderer(VIEWS_DIR);
const loaders = createLoaders({
  postsFile: POSTS_FILE,
  projectsFile: PROJECTS_FILE,
  pacmanSectionFile: PACMAN_SECTION_FILE,
  analyticsPartialFile: ANALYTICS_PARTIAL_FILE,
});

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.example.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER || 'user@example.com',
    pass: process.env.EMAIL_PASS || 'password',
  },
});

const auth = createAuthSystem({
  adminAuthFile: ADMIN_AUTH_FILE,
  adminStoreFile: ADMIN_STORE_FILE,
  defaultUsername: ADMIN_DEFAULT_USERNAME,
  defaultEmail: ADMIN_DEFAULT_EMAIL,
  defaultPassword: ADMIN_DEFAULT_PASSWORD,
  updatePosts: loaders.updatePosts,
});

const { getStaticFile } = createStaticFileServer(PUBLIC_DIR);
const resolveEditablePath = createEditableFileResolver({ viewsDir: VIEWS_DIR, dataDir: DATA_DIR, publicDir: PUBLIC_DIR });
const htmlBuilders = createHtmlBuilders(loaders.escapeHtml);

const handleApiRoute = createApiRoutes({
  auth,
  loaders,
  transporter,
  resolveEditablePath,
  projectsFile: PROJECTS_FILE,
  publicDir: PUBLIC_DIR,
});

const handlePageRoute = createPageRoutes({
  auth,
  loaders,
  renderTemplate,
  htmlBuilders,
});
const REQUEST_LOGGING_ENABLED = String(process.env.REQUEST_LOGGING_ENABLED || 'true').toLowerCase() !== 'false';

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return String(req.socket.remoteAddress || '');
}

function logRequest(req, res, startedAtNs) {
  if (!REQUEST_LOGGING_ENABLED) return;
  const durationMs = Number((process.hrtime.bigint() - startedAtNs) / 1000000n);
  const status = res.statusCode || 0;
  console.log(
    `[request] ${req.method || 'UNKNOWN'} ${req.url || '/'} ${status} ${durationMs}ms ip=${requestIp(req)}`
  );
}

async function router(req, res) {
  const { method, url: reqUrl } = req;
  const url = new URL(reqUrl, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const normalizedPathname = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (pathname.startsWith('/public/')) {
    const staticFile = await getStaticFile(pathname.slice('/public/'.length));
    if (staticFile) {
      send(res, 200, staticFile.content, {
        'Content-Type': staticFile.contentType,
        'Cache-Control': 'no-cache',
      });
      return;
    }
  }

  if (normalizedPathname.startsWith('/api/')) {
    const result = await handleApiRoute(req, res, normalizedPathname, method, url);
    if (result !== false) return;
  }

  const pageResult = await handlePageRoute(req, res, normalizedPathname);
  if (pageResult !== false) return;

  return sendText(res, 404, '404 Not Found');
}

function createAppServer() {
  return http.createServer((req, res) => {
    const startedAtNs = process.hrtime.bigint();
    res.on('finish', () => logRequest(req, res, startedAtNs));

    router(req, res).catch(err => {
      console.error('Error handling request', err);
      if (!res.headersSent && !res.writableEnded) {
        sendText(res, 500, 'Internal server error');
      }
    });
  });
}

if (require.main === module) {
  auth.loadAdminAuthRecord()
    .then(record => {
      if (record.isNew) {
        console.log('\n--- ADMIN SETUP ---');
        console.log(`Admin account created with username: ${record.username}`);
        console.log(`Password: ${ADMIN_DEFAULT_PASSWORD}`);
        console.log('PLEASE SAVE THIS PASSWORD NOW. It is stored as a hash and cannot be recovered.');
        console.log('-------------------\n');
      }
      return auth.ensureAdminStore();
    })
    .then(() => {
      auth.startScheduler();
      const server = createAppServer();
      const PORT = process.env.PORT || 3000;
      server.listen(PORT, () => {
        console.log(`Portfolio/blog site running at http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('Failed to initialize:', err);
      process.exit(1);
    });
}

module.exports = {
  createAppServer,
  router,
};
