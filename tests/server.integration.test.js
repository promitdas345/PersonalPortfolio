process.env.MONGODB_URI = '';
// Point SMTP at a closed local port: the contact route must still accept and store a
// message when delivery fails, and no test run should send real mail.
process.env.EMAIL_HOST = '127.0.0.1';
process.env.EMAIL_PORT = '9';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { createAppServer } = require('../server');

const ROOT_DIR = path.resolve(__dirname, '..');
const SNAPSHOT_FILES = [
  path.join(ROOT_DIR, 'data', 'admin-store.json'),
  path.join(ROOT_DIR, 'data', 'admin-auth.json'),
  path.join(ROOT_DIR, 'data', 'messages.json'),
];

const fileSnapshots = new Map();
let server;
let baseUrl = '';

async function snapshotDataFiles() {
  for (const filePath of SNAPSHOT_FILES) {
    try {
      fileSnapshots.set(filePath, await fs.readFile(filePath, 'utf8'));
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        fileSnapshots.set(filePath, null);
        continue;
      }
      throw err;
    }
  }
}

async function restoreDataFiles() {
  for (const [filePath, content] of fileSnapshots.entries()) {
    if (content === null) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        if (!err || err.code !== 'ENOENT') throw err;
      }
      continue;
    }
    await fs.writeFile(filePath, content, 'utf8');
  }
}

async function startServer() {
  server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
  server = null;
}

async function fetchJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    payload = null;
  }
  return { response, payload };
}

test.before(async () => {
  await snapshotDataFiles();
  await startServer();
});

test.after(async () => {
  await stopServer();
  await restoreDataFiles();
});

test('visitor cannot access admin posts endpoint', { concurrency: false }, async () => {
  const { response, payload } = await fetchJson('/api/admin/posts');
  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
});

test('session endpoint returns anonymous state plus default username', { concurrency: false }, async () => {
  const { response, payload } = await fetchJson('/api/admin/session');
  assert.equal(response.status, 200);
  assert.equal(payload.authenticated, false);
  assert.equal(payload.canInlineEdit, false);
  assert.equal(typeof payload.defaultUsername, 'string');
  assert.ok(payload.defaultUsername.length > 0);
});

test('request logging emits entries with method and path', { concurrency: false }, async () => {
  const captured = [];
  const originalLog = console.log;

  console.log = (...args) => {
    captured.push(args.map(value => String(value)).join(' '));
  };

  try {
    const response = await fetch(`${baseUrl}/blog`);
    assert.equal(response.status, 200);
    await response.text();
  } finally {
    console.log = originalLog;
  }

  assert.ok(
    captured.some(line => line.includes('[request] GET /blog 200')),
    `Expected a request log line for /blog, got: ${captured.join('\n')}`
  );
});

test('login endpoint enforces rate limiting after repeated failures', { concurrency: false }, async () => {
  const uniqueLogin = `rate-limit-${Date.now()}@example.com`;
  let status = 0;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { response, payload } = await fetchJson('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uniqueLogin, password: 'incorrect-password' }),
    });
    status = response.status;
    if (status === 429) {
      assert.equal(payload.success, false);
      assert.ok(String(payload.error || '').includes('Too many login attempts'));
      return;
    }
    assert.equal(status, 401);
  }

  assert.fail(`Expected login rate limiting (429) within 12 attempts, last status=${status}`);
});

test('a contact submission is stored even when the email cannot be sent', { concurrency: false }, async () => {
  const marker = `integration-${Date.now()}`;
  const { response, payload } = await fetchJson('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Integration Visitor', email: 'visitor@example.com', message: marker }),
  });

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.emailed, false, 'SMTP is pointed at a closed port for tests');

  const stored = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'data', 'messages.json'), 'utf8'));
  const saved = stored.find(item => item.message === marker);
  assert.ok(saved, 'the submission should be readable from the inbox file');
  assert.equal(saved.name, 'Integration Visitor');
  assert.equal(saved.emailed, false);
  assert.equal(saved.read, false);
});

test('contact submissions are rejected without a name, email, and message', { concurrency: false }, async () => {
  const { response, payload } = await fetchJson('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'No Message', email: 'visitor@example.com', message: '   ' }),
  });

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
});

test('visitors cannot read or change the contact inbox', { concurrency: false }, async () => {
  const listing = await fetchJson('/api/admin/messages');
  assert.equal(listing.response.status, 401);
  assert.equal(listing.payload.success, false);

  const patch = await fetchJson('/api/admin/messages/some-id', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ read: true }),
  });
  assert.equal(patch.response.status, 401);

  const removal = await fetchJson('/api/admin/messages/some-id', { method: 'DELETE' });
  assert.equal(removal.response.status, 401);
});

test('the inbox page redirects anyone who is not signed in', { concurrency: false }, async () => {
  const response = await fetch(`${baseUrl}/admin/messages`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  await response.text();
});
