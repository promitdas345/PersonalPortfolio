process.env.MONGODB_URI = '';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { createAppServer } = require('../server');

const ROOT_DIR = path.resolve(__dirname, '..');
const SNAPSHOT_FILES = [
  path.join(ROOT_DIR, 'data', 'admin-store.json'),
  path.join(ROOT_DIR, 'data', 'admin-auth.json'),
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
