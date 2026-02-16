# Contributing Guide

Welcome! This guide will help you get set up, understand the codebase, and start contributing. It's written for anyone from interns to senior developers.

---

## Table of Contents

1. [Setting Up Your Development Environment](#1-setting-up-your-development-environment)
2. [Running the App Locally](#2-running-the-app-locally)
3. [Running Tests](#3-running-tests)
4. [How to Add a New Page](#4-how-to-add-a-new-page)
5. [How to Add a New API Endpoint](#5-how-to-add-a-new-api-endpoint)
6. [How to Add a New Lib Module](#6-how-to-add-a-new-lib-module)
7. [Code Style Conventions](#7-code-style-conventions)
8. [Common Gotchas](#8-common-gotchas)
9. [Where to Find Things](#9-where-to-find-things)

---

## 1. Setting Up Your Development Environment

### Prerequisites

- **Node.js** 18 or higher (check with `node --version`)
- **npm** (comes with Node.js)
- A code editor (VS Code recommended)

### Steps

```bash
# Clone the repository
git clone https://github.com/promitdas345/PersonalPortfolio.git
cd PersonalPortfolio

# Install dependencies
npm install

# Create your environment file
cp .env.example .env
# ✏️ Edit .env with your values (see .env.example for descriptions)
```

### What the `.env` file does

The app reads environment variables from `.env` at startup. The most important ones:

| Variable | What it does |
|----------|-------------|
| `ADMIN_USERNAME` | Username for the admin login |
| `ADMIN_PASSWORD` | Password for the admin login (hashed on first run) |
| `PORT` | Server port (default: 3000) |
| `EMAIL_*` | SMTP settings for the contact form |

See the full list in [README.md](../README.md#environment-variables).

---

## 2. Running the App Locally

```bash
npm start
```

Open `http://localhost:3000` in your browser. The server will:
1. Load or create admin credentials
2. Start the HTTP server
3. Start the scheduler (checks for posts to auto-publish)

### Hot reloading

There is no automatic hot reload. After code changes, stop the server (`Ctrl+C`) and restart it (`npm start`).

> **Tip:** For faster iteration, use `node --watch server.js` (requires Node 18.11+).

---

## 3. Running Tests

```bash
npm test
```

This runs **all tests** sequentially using Node's built-in test runner:

- `tests/data.unit.test.js` — Unit tests for HTML sanitization and URL validation
- `tests/server.integration.test.js` — Integration tests that spin up a real server

### Writing a new test

Create a file in `tests/` with the `.test.js` suffix:

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('my feature', () => {
  it('should do something', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

---

## 4. How to Add a New Page

Let's say you want to add a `/skills` page.

### Step 1: Create the HTML template

Create `views/skills.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Skills | Promit's Portfolio</title>
  <link rel="stylesheet" href="/public/styles.css" />
</head>
<body>
  <main class="container">
    <h1>My Skills</h1>
    <p>{{ skillsList }}</p>
  </main>
  <script src="/public/script.js"></script>
</body>
</html>
```

> `{{ skillsList }}` is a template variable — it will be replaced by the server.

### Step 2: Add the route

Open `routes/pages.js` and add a new route handler:

```javascript
if (normalizedPathname === '/skills') {
  const html = await renderTemplate('skills.html', {
    skillsList: '<ul><li>JavaScript</li><li>Node.js</li></ul>',
  });
  return sendHtml(res, html);
}
```

### Step 3: Add to the static build (optional)

If you want this page in the static build, open `build.js` and add to `buildStaticPages()`:

```javascript
const skills = await renderTemplate('skills.html', {
  skillsList: '<ul><li>JavaScript</li><li>Node.js</li></ul>',
});
await writePage(path.join('skills', 'index.html'), skills);
```

### Step 4: Restart and test

```bash
# Stop server (Ctrl+C), then:
npm start
# Visit http://localhost:3000/skills
```

---

## 5. How to Add a New API Endpoint

Let's say you want to add `GET /api/admin/stats` that returns post count.

### Step 1: Add to `routes/api.js`

Inside the `handleApiRoute` function, add before the `return false` at the bottom:

```javascript
if (normalizedPathname === '/api/admin/stats' && method === 'GET') {
  // Require authentication
  const context = await auth.requireAuth(req, res);
  if (!context) return;  // requireAuth already sent 401

  // Load data
  const posts = await loadPosts({ includeUnpublished: true, includeArchived: true });

  // Return response
  return sendJson(res, 200, {
    success: true,
    totalPosts: posts.length,
    publishedPosts: posts.filter(p => p.status === 'published').length,
  });
}
```

### Key patterns to follow

1. **Always check auth** — Use `auth.requireAuth(req, res)` for protected endpoints
2. **Check capabilities** — Use `auth.requireCapability(context, 'capability.name', res)`
3. **CSRF for mutations** — Use `enforceMutationGuards(req, res, context.session)` for POST/PATCH/DELETE
4. **Parse body** — Use `parseJsonBody(req)` to safely parse JSON request bodies
5. **Return JSON** — Always use `sendJson(res, statusCode, data)`

---

## 6. How to Add a New Lib Module

If you need shared logic, create a new file in `lib/`.

### Pattern to follow

```javascript
// lib/my-helper.js

/**
 * Brief description of what this module does.
 */

function myFunction(input) {
  // implementation
  return result;
}

module.exports = { myFunction };
```

Then import it where needed:

```javascript
const { myFunction } = require('./lib/my-helper');
// or from within lib/:
const { myFunction } = require('./my-helper');
```

---

## 7. Code Style Conventions

### General rules

- **No frameworks** — The app uses vanilla Node.js. Don't add Express, Koa, etc.
- **CommonJS** — Use `require()` and `module.exports`, not ES module `import/export`
- **Single quotes** — Use single quotes for strings
- **2-space indent** — Consistent 2-space indentation
- **Semicolons** — Always use semicolons

### Function naming

| Convention | Used for | Example |
|-----------|----------|---------|
| `create*` | Factory functions | `createAuthSystem()`, `createRenderer()` |
| `load*` | Read data from disk/DB | `loadPosts()`, `loadStore()` |
| `update*` | Modify and persist data | `updatePosts(mutator)` |
| `mutate*` | Modify store with atomic write | `mutateStore(mutator)` |
| `send*` | Send HTTP response | `sendJson()`, `sendHtml()` |
| `build*` | Generate HTML fragments | `buildBlogCard()` |
| `normalize*` | Validate and clean data | `normalizeHashtags()` |
| `ensure*` | Create if missing | `ensureDir()`, `ensureUploadDir()` |
| `parse*` | Parse raw input | `parseJsonBody()`, `parseMultipartBody()` |

### Factory pattern

Most modules use a **factory function** that takes dependencies and returns an object of functions:

```javascript
function createSomething(config) {
  const { someParam } = config;

  function doWork() { /* uses someParam */ }
  function doOtherWork() { /* uses someParam */ }

  return { doWork, doOtherWork };
}

module.exports = { createSomething };
```

This pattern is used in `auth.js`, `data.js`, `templates.js`, `html-builders.js`, and `admin-store.js`.

---

## 8. Common Gotchas

### 1. "I changed a file, but nothing happened"

Restart the server. There is no hot reload by default.

### 2. "My test is hanging"

The integration tests start a real HTTP server. If a test fails mid-run, the server might not shut down cleanly. Kill any Node processes and try again:

```bash
# Windows
taskkill /f /im node.exe

# Mac/Linux
pkill -f node
```

### 3. "Where are sessions stored?"

In `data/admin-store.json` (not in memory). If you delete this file, all sessions are lost.

### 4. "Where is the admin password?"

In `data/admin-auth.json`. The password is stored as a hash — you can't read it. To reset, delete the file and restart the server (a new password will be generated and logged).

### 5. "I added a new field to posts but it's not showing"

Three places to update:
1. `lib/post-helpers.js` — Add to `parsePostPayload()` for validation
2. `routes/api.js` — Add to the post create/update handlers
3. `views/post.html` — Add the template variable
4. (Optional) `lib/html-builders.js` — If you need an HTML fragment

### 6. "Path traversal error when serving files"

The static file server in `lib/http.js` rejects any resolved path outside the allowed directory. Make sure you're using relative paths starting with `/public/`.

---

## 9. Where to Find Things

| I want to... | Look in... |
|--------------|-----------|
| Change the homepage layout | `views/index.html` |
| Modify the stylesheet | `public/styles.css` |
| Add a new API endpoint | `routes/api.js` |
| Add a new page | `routes/pages.js` + `views/*.html` |
| Change how posts are loaded | `lib/data.js` |
| Change authentication logic | `lib/auth.js` |
| Change user roles/permissions | `lib/admin-store.js` (ROLE_CAPABILITIES) |
| Add a new post field | `lib/post-helpers.js` |
| Change HTML sanitization | `lib/data.js` (sanitizeRichHtml) |
| Modify the inline editor | `public/inline-editor.js` |
| Modify the blog editor | `public/blog-editor.js` |
| Change the static build | `build.js` |
| Run database migration | `scripts/migrate-posts-to-db.js` |
| Understand security measures | [ARCHITECTURE.md → Security Summary](ARCHITECTURE.md#12-security-summary) |
| See all API endpoints | [API.md](API.md) |
