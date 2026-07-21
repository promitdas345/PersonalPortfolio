# Personal Portfolio — Promit Das

[![CI](https://github.com/promitdas345/PersonalPortfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/promitdas345/PersonalPortfolio/actions/workflows/ci.yml)

A full-stack portfolio website with a blog, project showcase, inline content editing, and static-site generation — all built from scratch using Node.js with **zero frameworks**.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
cp .env.example .env    # then edit .env with your values

# 3. Start the development server
npm start               # → http://localhost:3000
```

> **First run?** If you don't set `ADMIN_PASSWORD` in `.env`, the server will generate a random one and print it to the console **once**. Save it immediately.

---

## Features

| Feature | Description |
|---------|-------------|
| 📝 Blog | Markdown + rich HTML posts with status workflow (draft → review → published) |
| 💼 Projects | Detailed project pages with metrics, architecture, and ownership sections |
| 🔐 Inline Editing | Edit any page directly in the browser — no separate admin dashboard |
| 📧 Contact Form | Server-side email sending via Nodemailer |
| 🏗️ Static Build | Generate a static `dist/` folder for deployment on any hosting |
| 🎮 Pac-Man | Interactive game section embedded in the portfolio |
| 📊 Analytics | Optional Google Analytics 4 integration |
| 🔒 Security | scrypt password hashing, CSRF protection, rate limiting, HTML sanitization |

---

## Project Structure

```
PersonalPortfolio/
├── server.js                  # HTTP server, router, startup, health check, graceful shutdown
├── build.js                   # Static site generator (creates dist/)
├── package.json               # Dependencies & scripts
├── eslint.config.js           # ESLint flat config (Node + browser rule sets)
├── CHANGELOG.md                # Detailed record of fixes and infra additions
│
├── .github/
│   ├── workflows/ci.yml       # CI: lint → test → npm audit, on every push/PR
│   └── dependabot.yml         # Weekly dependency update PRs
│
├── lib/                       # ← ALL backend logic lives here
│   ├── auth.js                # Authentication, sessions, rate limiting
│   ├── admin-store.js         # Admin data store (users, roles, audit logs)
│   ├── data.js                # Data loading (JSON files), sanitization, markdown
│   ├── data-mongodb.js        # MongoDB adapter (alternative to JSON files)
│   ├── database.js            # Mongoose connection manager
│   ├── http.js                # HTTP helpers (cookies, CSRF, static files, body parsing)
│   ├── templates.js           # Mustache-like template engine ({{ variable }})
│   ├── html-builders.js       # Functions that generate HTML fragments for posts/projects
│   ├── post-helpers.js        # Post validation, workflow transitions, normalization
│   ├── upload-helpers.js      # Multipart parsing, image validation (magic bytes)
│   └── models/
│       └── Post.js            # Mongoose schema for blog posts
│
├── routes/
│   ├── api.js                 # All API endpoints (login, CRUD, contact, uploads)
│   └── pages.js               # All page routes (/, /blog, /projects, /about, etc.)
│
├── views/                     # HTML templates (server-side rendered)
│   ├── index.html             # Home page
│   ├── blog.html              # Blog listing
│   ├── post.html              # Single blog post
│   ├── editor.html            # Blog post editor
│   ├── projects.html          # Projects listing
│   ├── project.html           # Single project page
│   ├── about.html             # About page
│   ├── contact.html           # Contact form
│   ├── pacman.html            # Pac-Man game page
│   └── partials/              # Reusable HTML fragments
│       ├── pacman-section.html
│       └── analytics.html
│
├── public/                    # Client-side assets (served at /public/*)
│   ├── styles.css             # Main stylesheet
│   ├── script.js              # Shared client JS (theme toggle, animations)
│   ├── inline-editor.js       # Inline editing system (largest client file)
│   ├── inline-editor.css      # Inline editor styles
│   ├── blog-editor.js         # Blog post editor (create/edit posts)
│   ├── blog-editor.css        # Blog editor styles
│   ├── post-reactions.js      # Public reaction buttons on blog posts
│   ├── analytics.js           # Google Analytics integration
│   ├── project-demos.js       # Interactive project demo animations
│   ├── pacman.js              # Pac-Man game logic
│   ├── images/                # Image assets
│   └── resume/                # Resume PDF
│
├── data/                      # Persistent JSON data (gitignored in production)
│   ├── posts.json             # Blog posts
│   ├── projects.json          # Projects
│   ├── admin-auth.json        # Admin credentials (auto-generated)
│   └── admin-store.json       # Users, sessions, roles, audit logs (auto-generated)
│
├── tests/                     # Test suite
│   ├── server.integration.test.js  # Integration tests (runs actual HTTP server)
│   ├── data.unit.test.js           # Unit tests for data utilities
│   └── public-scripts.unit.test.js # Syntax-checks every public/*.js file
│
├── scripts/
│   └── migrate-posts-to-db.js # One-time migration: JSON → MongoDB
│
├── dist/                      # Generated static site (after `npm run build`)
├── .env                       # Environment variables (NEVER commit this)
└── .env.example               # Template for .env
```

---

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ADMIN_USERNAME` | Admin login username | `admin` | No |
| `ADMIN_EMAIL` | Admin email for the owner account | `{username}@local` | No |
| `ADMIN_PASSWORD` | Admin password (hashed on first run) | Random (logged once) | **Recommended** |
| `EMAIL_HOST` | SMTP hostname | `smtp.example.com` | For contact form |
| `EMAIL_PORT` | SMTP port | `587` | For contact form |
| `EMAIL_USER` | SMTP username | — | For contact form |
| `EMAIL_PASS` | SMTP password | — | For contact form |
| `EMAIL_TO` | Recipient email for contact form | — | For contact form |
| `PORT` | Server port | `3000` | No |
| `GA_MEASUREMENT_ID` | Google Analytics 4 ID | — | No |
| `MONGODB_URI` | MongoDB connection string | — | Only if using MongoDB |
| `REQUEST_LOGGING_ENABLED` | Enable request logging | `true` | No |

---

## How It Works (Request Lifecycle)

```
Browser Request
      │
      ▼
  server.js  ─── creates HTTP server, logs requests
      │
      ├── /public/*      → lib/http.js (static file server)
      ├── /api/*          → routes/api.js (JSON API)
      └── everything else → routes/pages.js (HTML pages)
                                │
                                ▼
                          lib/templates.js (render HTML)
                          lib/data.js (load posts/projects)
                          lib/html-builders.js (generate fragments)
```

---

## Inline Editing

There is **no separate admin panel**. To edit content:

1. Visit any page on the site
2. Click the **Admin Login** floating button
3. Sign in with your credentials
4. Click **Edit Site** — editable fields highlight
5. Make changes directly on the page
6. Click **Save**

Blog posts and projects can also be created via **New Post** / **New Project** buttons that appear in edit mode.

---

## Running Tests

```bash
npm test
```

This runs the Node.js built-in test runner with `--test-concurrency=1` (sequential), scoped to `tests/**/*.test.js`. Tests include:
- **Integration tests** (`server.integration.test.js`) — spins up a real HTTP server, makes requests, validates responses. Forces `MONGODB_URI=''` before requiring the server so it never depends on your real database being reachable.
- **Unit tests** (`data.unit.test.js`) — HTML sanitization and URL validation
- **Static-analysis regression test** (`public-scripts.unit.test.js`) — syntax-checks every file in `public/*.js`. Catches the class of bug where a browser script has a JS syntax error that silently kills all interactivity on a page (this happened once — see [CHANGELOG.md](CHANGELOG.md)).

## Linting

```bash
npm run lint
```

ESLint (flat config, `eslint.config.js`). Node-side code (`lib/`, `routes/`, `server.js`) and browser-side code (`public/`) use separate rule sets with the appropriate globals for each environment.

## CI

Every push/PR to `main` runs, in order: `npm ci` → `npm run lint` → `npm test` → `npm audit --audit-level=high`. See `.github/workflows/ci.yml`. Dependabot (`.github/dependabot.yml`) opens a weekly PR for outdated dependencies.

## Health Check

```
GET /health
```

Returns `{ status, uptimeSeconds, mongo }` without touching auth or the data layer — point your hosting platform's liveness/readiness probe here. See [API Reference](docs/API.md#get-health) for the full response shape.

---

## Building the Static Site

```bash
npm run build
```

This generates a `dist/` folder with pure HTML files (no server needed). Deploy to any static hosting (Netlify, Vercel, GitHub Pages).

> **Note:** The static build does **not** include the admin API, inline editing, or contact form. It's a read-only snapshot of your content.

---

## Deployment

### Render / Heroku / Railway (Dynamic)

1. Set all environment variables in the hosting dashboard
2. Set build command: `npm install`
3. Set start command: `npm start`
4. The server runs on the `PORT` provided by the platform

### Static Hosting (Netlify, Vercel, GitHub Pages)

1. Run `npm run build` locally
2. Deploy the `dist/` folder

---

## Further Documentation

| Document | What it covers |
|----------|---------------|
| [Architecture Guide](docs/ARCHITECTURE.md) | Deep dive into every module and how they connect |
| [API Reference](docs/API.md) | Every API endpoint with request/response examples |
| [Contributing Guide](docs/CONTRIBUTING.md) | How to add features, code conventions, testing |
| [Analytics Setup](ANALYTICS_SETUP.md) | Google Analytics 4 integration guide |
| [Changelog](CHANGELOG.md) | Detailed record of security fixes, reliability fixes, and infrastructure additions |

---

## Security

- **Password Hashing:** `scrypt` (v2) with automatic legacy PBKDF2 fallback
- **HTML Sanitization:** `sanitize-html` library with an explicit `allowedStyles` allowlist (prevents CSS-based overlay/clickjacking attacks via rich-text posts)
- **Output Escaping:** Every value interpolated into an HTML template is escaped at the call site (`routes/pages.js`) — the template engine itself does raw substitution and enforces nothing
- **CSRF Protection:** Token-based, enforced on all mutation endpoints
- **Rate Limiting:** Login attempts are rate-limited per user and IP
- **Session Security:** HttpOnly, SameSite=Lax cookies; Secure flag on HTTPS
- **Security Headers:** CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS — set on every response (`lib/http.js`)
- **File Uploads:** Magic byte validation, 5MB limit, allowed types only
- **Body Size Limit:** 4MB max request body
- **Dependency Scanning:** `npm audit --audit-level=high` runs in CI on every push; Dependabot opens weekly update PRs

See [CHANGELOG.md](CHANGELOG.md) for the specific vulnerabilities found and fixed in the most recent audit, including two stored-XSS issues and a dependency CVE upgrade.

---

## License

MIT

## Contact

- **Email:** promitd@mun.ca
- **LinkedIn:** [linkedin.com/in/promitd](https://www.linkedin.com/in/promitd)
- **GitHub:** [github.com/promitdas345](https://github.com/promitdas345)
