# Architecture Guide

This document explains how every part of the codebase connects, from the moment a request hits the server to when a response is sent back. If you're new to the project, read this first.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Server & Routing](#2-server--routing)
3. [Data Layer](#3-data-layer)
4. [Authentication & Sessions](#4-authentication--sessions)
5. [Admin Store (RBAC)](#5-admin-store-rbac)
6. [Templating & HTML Builders](#6-templating--html-builders)
7. [Post Workflow](#7-post-workflow)
8. [File Uploads](#8-file-uploads)
9. [HTTP Utilities](#9-http-utilities)
10. [Frontend JavaScript](#10-frontend-javascript)
11. [Static Site Build](#11-static-site-build)
12. [Security Summary](#12-security-summary)
13. [Operations: Health, Shutdown, Config, CI](#13-operations-health-shutdown-config-ci)

---

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────┐
│                    Browser / Client                  │
└──────────────┬──────────────────────┬───────────────┘
               │ HTTP Request         │ Static Assets
               ▼                      ▼
┌──────────────────────┐   ┌─────────────────────────┐
│     server.js        │   │  public/ (CSS, JS, imgs) │
│  ┌─────────────────┐ │   └─────────────────────────┘
│  │  router()       │ │
│  │  ├─ /api/*  ────┼─┼──→ routes/api.js
│  │  ├─ /public/* ──┼─┼──→ lib/http.js (static)
│  │  └─ /* ─────────┼─┼──→ routes/pages.js
│  └─────────────────┘ │
└──────────────────────┘
         │                        │
         ▼                        ▼
┌──────────────────┐    ┌──────────────────┐
│    lib/auth.js   │    │  lib/data.js     │
│  (sessions,      │    │  (load posts,    │
│   passwords,     │    │   projects,      │
│   rate limiting) │    │   sanitization)  │
└──────────────────┘    └──────────────────┘
         │                        │
         ▼                        ▼
┌──────────────────┐    ┌──────────────────┐
│ lib/admin-store  │    │  data/*.json     │
│  (users, roles,  │    │  OR              │
│   audit logs)    │    │  MongoDB         │
└──────────────────┘    └──────────────────┘
```

**Key principle:** Everything is built with native Node.js modules. There is no Express, no Koa, no framework — just `http.createServer()`.

---

## 2. Server & Routing

### `server.js` — The Entry Point

**What it does:**
1. Loads environment variables (`dotenv`)
2. Creates all the subsystems (auth, data loaders, template renderer)
3. Creates an HTTP server
4. Routes every request through the `router()` function

**The `router()` function** checks the URL in this order:

```
1. /public/*  → Serve static file (CSS, JS, images)
2. /api/*     → Hand off to API route handler
3. /*         → Hand off to page route handler
4. (none)     → 404 Not Found
```

**Request logging:** Every request is logged with method, URL, status code, duration, and IP address. Controlled by `REQUEST_LOGGING_ENABLED` env var.

### `routes/api.js` — API Routes

Handles all JSON API endpoints. Returns JSON responses. All mutation endpoints (POST/PUT/DELETE) require:
- An active session (cookie-based)
- A valid CSRF token (header `x-csrf-token`)

See [API Reference](API.md) for the full endpoint list.

### `routes/pages.js` — Page Routes

Handles all HTML page routes. Renders templates using `lib/templates.js` and injects data. Routes:

| Path | Template | Description |
|------|----------|-------------|
| `/` | `index.html` | Home page (latest 3 posts + 3 projects) |
| `/blog` | `blog.html` | Blog listing (all published posts) |
| `/blog/:slug` | `post.html` | Single blog post |
| `/blog/editor` | `editor.html` | Blog post editor (requires auth) |
| `/projects` | `projects.html` | Projects listing |
| `/projects/:slug` | `project.html` | Single project page |
| `/about` | `about.html` | About page |
| `/contact` | `contact.html` | Contact form |
| `/pacman` | `pacman.html` | Pac-Man game |

---

## 3. Data Layer

The app supports **two storage backends**: JSON files (default) and MongoDB.

### `lib/data.js` — JSON File Backend (Default)

This is the main data module. It provides:

- **`loadPosts(options)`** — Load blog posts from `data/posts.json`. Supports filtering by status, search, sorting, and pagination.
- **`loadProjects()`** — Load projects from `data/projects.json`.
- **`updatePosts(mutator)`** — Modify posts array and write back to disk. Uses atomic file writes (write to `.tmp`, then rename).
- **`sanitizeRichHtml(html)`** — Sanitizes user-submitted HTML using the `sanitize-html` library.
- **`markdownToHtml(markdown)`** — Converts markdown to HTML (custom parser).
- **`escapeHtml(text)`** — Escapes `<`, `>`, `&`, `"` for safe insertion into HTML.

**How data loading works:**
```
loadPosts()
  → Read data/posts.json from disk
  → Parse JSON
  → For each post: normalize fields, calculate reading time, generate excerpt
  → Filter by status/search/pagination
  → Return sorted array
```

**Auto-detection:** If `MONGODB_URI` is set, the module detects it and delegates to `data-mongodb.js` instead.

#### MongoDB fallback

`loadPosts()` (reads) do **not** hard-fail if Mongo is unreachable. If `mongoDbLoaders.loadPosts()` throws — connection timeout, DNS failure, auth error, whatever — `lib/data.js` catches it, logs a `⚠️` warning, and falls through to the JSON-file path below it in the same function, transparently serving `data/posts.json` instead. A page visitor never sees a 500 because of a flaky database connection; they just silently get the file-backed content. Check `GET /health` (see [API Reference](API.md#get-health)) to see whether Mongo is actually connected at any given moment.

This fallback is **read-only**. `updatePosts()` (writes — creating/editing/deleting a post through the admin UI) still calls straight into Mongo with no fallback: if Mongo is down, saving a post fails loudly rather than silently writing to a JSON file that would then disagree with what Mongo has once it reconnects. Silently diverging the two stores would be worse than a failed save.

### `lib/data-mongodb.js` — MongoDB Backend

Same interface as `data.js` but reads/writes to MongoDB instead of JSON files. Uses Mongoose via `lib/database.js`.

### `lib/database.js` — Mongoose Connection

Simple connection manager. Connects once, caches the connection, auto-reconnects.

### `lib/models/Post.js` — Mongoose Schema

Defines the MongoDB schema for blog posts with all fields (title, slug, content, status, reactions, media, etc.).

---

## 4. Authentication & Sessions

### `lib/auth.js`

This file manages everything related to user authentication:

#### Password Hashing

```
New passwords → scrypt (v2:salt:hash)
Legacy passwords → PBKDF2 (salt:hash) — still verified, auto-upgraded
```

- `createPasswordHash(password)` → generates `v2:salt:hash` string
- `verifyPassword(password, storedHash)` → returns `true/false`
- `parsePasswordHash(storedHash)` → detects version (v1 or v2)

#### Sessions (Persistent)

Sessions are stored in `admin-store.json` (not in memory), so they survive server restarts.

```
createSession(user, req)   → generates token, saves to store, returns { token, session }
getSession(req)            → reads cookie, finds session in store, returns session or null
deleteSession(token)       → removes session from store
```

- Session cookie: `portfolio_admin_session`
- TTL: 8 hours
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` (on HTTPS)

#### Rate Limiting

Login attempts are rate-limited per username and per IP address:

```
Default: 5 attempts per 15-minute window → 15-minute lockout
Configurable via: LOGIN_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_LOCKOUT_MS
```

Rate limit state is stored in `admin-store.json` alongside sessions.

---

## 5. Admin Store (RBAC)

### `lib/admin-store.js`

A file-based JSON store that manages:

| Collection | Purpose |
|-----------|---------|
| `users` | User accounts (email, password hash, roles, status) |
| `sessions` | Active login sessions |
| `invites` | Pending user invitations |
| `siteSettings` | SEO settings, blog config |
| `auditLogs` | Record of admin actions (capped at 2000) |
| `workflowEvents` | Post status transitions (capped at 2000) |
| `revisions` | Content change history (capped at 4000) |
| `previewTokens` | Temporary preview links for unpublished content |
| `loginAttempts` | Rate limiting data |

#### Roles & Capabilities

```
owner   → All capabilities (wildcard *)
admin   → Everything except owner-level actions
editor  → Content management (posts, projects, media)
author  → Create and edit own posts only
```

Each role maps to a set of capabilities like `content.posts.create`, `inline.edit`, `settings.manage`, etc.

#### Atomic Writes

All mutations go through `mutateStore(mutator)`:
1. Load current data
2. Deep clone it (so the mutator can't break the cache)
3. Run the mutator function
4. Normalize the result
5. Write to a `.tmp` file
6. Rename `.tmp` → `admin-store.json` (atomic on most filesystems)

This prevents data corruption from crashes or concurrent writes.

---

## 6. Templating & HTML Builders

### `lib/templates.js`

A minimal template engine. Templates use `{{ variableName }}` syntax:

```html
<h1>{{ title }}</h1>
<p>{{ description }}</p>
```

The `renderTemplate(name, vars)` function:
1. Reads the HTML file from `views/`
2. Replaces all `{{ key }}` placeholders with values from `vars`
3. Returns the final HTML string

### `lib/html-builders.js`

Factory function that creates HTML fragment builders. These generate the repetitive HTML chunks used in pages:

- `buildBlogCard(post)` — Full blog card for listing pages
- `buildPostTags(post)` — Hashtag badges
- `buildPostEngagement(post)` — Reactions/comments/reposts summary
- `buildPostReactionControls(post)` — Interactive reaction buttons
- `buildPostMediaGallery(post)` — Image/video gallery
- `buildMetricsSection(items)` — Project metrics list
- `buildArchitectureSection(items)` — Project architecture list
- `buildOwnershipSection(text)` — Project ownership paragraph

---

## 7. Post Workflow

### `lib/post-helpers.js`

Blog posts follow a status workflow:

```
draft → in_review → approved → scheduled → published → archived
  ↑                                                        │
  └────────────────────────────────────────────────────────┘
```

**Key functions:**
- `parsePostPayload(body, isCreate)` — Validates and normalizes POST body fields
- `ensureTransition(from, to)` — Checks if a status change is allowed
- `requiredCapabilityForStatus(status)` — Maps status to required RBAC capability
- `canEditPost(context, post)` — Checks if user can edit a specific post
- `normalizeHashtags(raw)` — Deduplicates, lowercases, strips `#` prefix
- `normalizeMedia(raw)` — Validates media array, enforces order and limits

Each status requires a specific capability:

| Status | Required Capability |
|--------|-------------------|
| `in_review` | `content.posts.submit_review` |
| `approved` | `content.posts.approve` |
| `scheduled` | `content.posts.schedule` |
| `published` | `content.posts.publish` |
| `archived` | `content.posts.archive` |

---

## 8. File Uploads

### `lib/upload-helpers.js`

Handles image uploads for blog posts and projects:

- **Max size:** 5 MB per image
- **Allowed types:** JPEG, PNG, GIF, WebP
- **Validation:** Uses magic byte detection (reads first bytes of file, not just extensions)
- **Filename:** Sanitized + timestamp + random suffix to prevent collisions

**`parseMultipartBody(buffer, contentType)`** — Custom multipart/form-data parser (no dependency on `multer` or `busboy`). Returns `{ fields, files }`.

---

## 9. HTTP Utilities

### `lib/http.js`

Shared utilities used across the entire app:

| Function | Purpose |
|----------|---------|
| `sendJson(res, status, data)` | Send JSON response |
| `sendHtml(res, html)` | Send HTML response |
| `sendText(res, status, text)` | Send plain text response |
| `send(res, status, content, headers)` | Generic response sender |
| `parseJsonBody(req)` | Read and parse JSON request body (4MB limit) |
| `parseCookies(cookieHeader)` | Parse `Cookie` header into key-value pairs |
| `serializeCookie(name, value, options)` | Create `Set-Cookie` header string |
| `enforceMutationGuards(req, res, session)` | Validate CSRF token and Origin header |
| `isSecureRequest(req)` | Check if request is over HTTPS |
| `createStaticFileServer(dir)` | Create a static file server with path traversal protection |
| `createEditableFileResolver(dirs)` | Resolve file paths for inline editing |
| `createId()` | Generate a UUID (or random hex fallback) |
| `trim(value, maxLength)` | Safe string trim with length limit |

---

## 10. Frontend JavaScript

### `public/inline-editor.js` (~800 lines)

The most complex client file. Powers the inline editing system:

1. **Authentication check** — Fetches `/api/admin/session` to determine capabilities
2. **Edit mode** — Makes `contenteditable` elements editable, tracks changes
3. **Toolbar** — Floating toolbar with bold/italic/link/heading controls
4. **Save** — Collects all changes, sends them to appropriate API endpoints
5. **Post/Project management** — Create, edit, delete directly from the page

### `public/blog-editor.js`

Dedicated editor for creating/editing blog posts with markdown input, live preview, and media upload.

### `public/script.js`

Shared utilities: smooth scroll, theme toggle, mobile menu, lazy loading.

### `public/post-reactions.js`

Handles the public reaction buttons (like, celebrate, support, insightful) on blog posts.

### `public/pacman.js`

Full Pac-Man game implementation with AI ghosts.

### `public/project-demos.js`

Interactive demo animations shown on project pages.

---

## 11. Static Site Build

### `build.js`

Generates a static HTML website in `dist/`:

```bash
npm run build
```

**What it does:**
1. Clears the `dist/` directory
2. Copies `public/` → `dist/public/`
3. Renders every page template with current data
4. Writes HTML files using clean URL structure (`/blog/my-post/index.html`)

**What it does NOT include:**
- API endpoints (no login, no editing)
- Contact form (no server-side email)
- Dynamic features (reactions, search)

---

## 12. Security Summary

| Layer | Mechanism | File |
|-------|-----------|------|
| Password storage | scrypt (v2) with PBKDF2 fallback | `lib/auth.js` |
| HTML sanitization | `sanitize-html` library | `lib/data.js` |
| CSRF protection | Token in header + origin validation | `lib/http.js` |
| Rate limiting | Per-user + per-IP, configurable | `lib/auth.js` |
| Session security | HttpOnly, SameSite, Secure, 8hr TTL | `lib/auth.js` |
| Upload validation | Magic bytes + size + extension check | `lib/upload-helpers.js` |
| Body size limit | 4 MB max | `lib/http.js` |
| Path traversal | Resolved path must be within allowed dirs | `lib/http.js` |
| Audit logging | All admin actions logged with actor, IP, timestamp | `lib/admin-store.js` |
| Output escaping | Every value interpolated into a template must be passed through `escapeHtml()` — the `{{ }}` renderer in `lib/templates.js` does raw string substitution and does **not** escape anything itself | `routes/pages.js`, `lib/templates.js` |
| Security response headers | CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (on HTTPS) — set once in the shared `send()` helper so every response gets them | `lib/http.js` |

> **A note on the template engine:** `lib/templates.js`'s `{{ key }}` substitution is intentionally dumb — it does not know or care whether `key`'s value is safe to drop into HTML. That responsibility sits entirely with the caller in `routes/pages.js`. Every route handler must call `escapeHtml()` on every field before passing it to `renderTemplate()`, with the sole exception of values that are themselves already-sanitized HTML fragments (e.g. a blog post's `contentHtml`, which went through `sanitizeRichHtml()` at write time). When adding a new field to a template, escape it — the engine will not save you if you forget.

---

## 13. Operations: Health, Shutdown, Config, CI

### Health check — `GET /health`

Implemented directly in `server.js` (`healthStatus()` + the `/health` route in `router()`), ahead of every other route so it never touches auth, rate limiting, or the data layer. Returns `{ status, uptimeSeconds, mongo }` — see [API Reference](API.md#get-health) for the response shape. Point your hosting platform's health/liveness probe here.

### Graceful shutdown

`server.js` registers `SIGTERM`/`SIGINT` handlers (only when run as `node server.js` directly, i.e. inside the `require.main === module` block — not when `server.js` is `require()`'d by the test suite). On signal:

1. Stop `auth`'s background scheduler (`auth.stopScheduler()`, in `lib/auth.js`) — this clears the `setInterval` that auto-publishes scheduled posts every 30s; leaving it running would keep the process alive indefinitely and could fire mid-shutdown.
2. Call `server.close()`, which stops accepting new connections and lets in-flight requests finish, then exits `0`.
3. A 10-second watchdog timer forces `process.exit(1)` if `close()` never calls back (e.g. a connection that never ends).

**Platform note:** Windows does not deliver POSIX signals the way Linux does — `SIGTERM` sent from a non-console context (e.g. `kill` from a different shell, or a background job) is not guaranteed to reach the Node process's signal handler; only `SIGINT` from the same console (Ctrl+C) is reliable. This is a Windows/Node platform limitation, not a bug in the shutdown logic — production deployments run on Linux (Render/Railway/Heroku), where both signals are delivered normally.

### Startup config validation

`validateEnvironment()` in `server.js` runs once at boot (before the DB/scheduler init chain) and checks:
- `EMAIL_USER`/`EMAIL_PASS` are set (contact form will otherwise silently fail every send)
- `MONGODB_URI`, if set, at least looks like a Mongo connection string (`mongodb://` or `mongodb+srv://`)
- In production (`NODE_ENV=production`), `ADMIN_PASSWORD` is set — the server **refuses to start** without it, since the alternative is a fresh random admin password generated (and only logged to stdout) on every restart

Problems are logged as `⚠️  Config warning: ...`; only the production/`ADMIN_PASSWORD` case is fatal.

### CI — `.github/workflows/ci.yml`

Runs on every push/PR to `main`: `npm ci` → `npm run lint` (ESLint, see `eslint.config.js`) → `npm test` → `npm audit --audit-level=high`. All four must pass. `.github/dependabot.yml` opens a weekly PR for outdated npm packages and GitHub Actions.

### Linting — `eslint.config.js`

Flat-config ESLint (v9). Three rule sets, because this repo mixes runtime environments in one tree:
- `server.js`, `lib/**`, `routes/**`, `tests/**` — Node globals, `js.configs.recommended`
- `public/**/*.js` — browser globals (these files run in the client, not under Node)
- `public/flappy-bird-ai/**/*.js` — a p5.js sketch split across multiple `<script>` tags that share one global scope at runtime (no ES modules); each file's top-level `let`s look like undefined globals — or redeclared globals — to a linter that checks files in isolation. `no-redeclare` and `no-unused-vars` are turned off for this directory specifically, and the shared identifiers (both p5's built-ins and the sketch's own cross-file variables) are declared as `globals` so real bugs (typos, truly undefined names) still get caught.

`public/flappy-bird-ai/libraries/**` (the vendored p5.js library itself) and `claude-code/**` (an unrelated git submodule that happens to live in this repo) are excluded entirely.
