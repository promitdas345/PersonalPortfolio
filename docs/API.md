# API Reference

All API endpoints are defined in `routes/api.js`. Every response is JSON with the shape `{ success: boolean, ... }`.

---

## Authentication

All admin endpoints (except session check and login) require:
1. **Session cookie** (`portfolio_admin_session`) — set after login
2. **CSRF token** — sent as `x-csrf-token` header on all POST/PATCH/DELETE requests

The CSRF token is returned in the login and session responses.

---

## Endpoints

### Auth

#### `GET /api/admin/session`

Check current authentication status. No authentication required.

**Response (200):**
```json
{
  "authenticated": true,
  "defaultUsername": "admin",
  "user": { "id": "...", "email": "...", "displayName": "...", "roles": ["owner"] },
  "roles": ["owner"],
  "capabilities": ["*"],
  "canInlineEdit": true,
  "csrfToken": "abc123..."
}
```

---

#### `POST /api/admin/login`

Authenticate with username/email and password.

**Request body:**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

> Also accepts `email` or `login` instead of `username`.

**Response (200):** Same shape as session endpoint, plus `Set-Cookie` header.

**Error responses:**
| Status | Reason |
|--------|--------|
| 400 | Missing username or password |
| 401 | Invalid credentials |
| 429 | Too many login attempts (rate limited) |

---

#### `POST /api/admin/logout`

End the current session.

**Headers:** `x-csrf-token: <token>`

**Response (200):** `{ "success": true }` with expired `Set-Cookie`.

---

### Site Files (Inline Editing)

#### `GET /api/admin/site-file?path=<path>`

Read a site file's content for inline editing.

**Auth:** Requires `inline.edit` capability.

**Query params:** `path` — relative path to the file (e.g., `views/index.html`).

**Response (200):**
```json
{
  "success": true,
  "path": "views/index.html",
  "content": "<html>..."
}
```

---

#### `POST /api/admin/site-file`

Save changes to a site file (inline editing).

**Auth:** Requires `inline.edit` capability.

**Request body:**
```json
{
  "path": "views/index.html",
  "content": "<html>..."
}
```

**Response (200):** `{ "success": true, "path": "views/index.html" }`

---

### Posts (Admin)

#### `GET /api/admin/posts`

List all posts (including unpublished and archived).

**Auth:** Requires `content.posts.read` capability.

**Query params:**
| Param | Default | Description |
|-------|---------|-------------|
| `q` | — | Search term (matches title, excerpt, slug) |
| `status` | `all` | Filter by status: `draft`, `in_review`, `approved`, `scheduled`, `published`, `archived` |
| `sort` | `updatedAt` | Sort field: `updatedAt`, `publishedAt`, `scheduledAt`, `createdAt`, `title`, `date` |
| `order` | `desc` | Sort order: `asc` or `desc` |

**Response (200):**
```json
{
  "success": true,
  "posts": [{ "id": "...", "title": "...", "status": "draft", ... }]
}
```

> Authors with `content.posts.edit.own` (but not `edit.any`) only see their own posts.

---

#### `POST /api/admin/posts`

Create a new blog post.

**Auth:** Requires `content.posts.create` capability.

**Request body:**
```json
{
  "title": "My Post",
  "contentMarkdown": "# Hello\nThis is my post.",
  "date": "2026-01-15",
  "status": "draft",
  "hashtags": ["nodejs", "portfolio"],
  "coverImage": "/public/images/uploads/my-image.jpg"
}
```

> You can also send `contentHtml` instead of `contentMarkdown`. If both are provided, `contentHtml` takes precedence (it will be sanitized).

**Response (201):** `{ "success": true, "post": { ... } }`

**Error responses:**
| Status | Reason |
|--------|--------|
| 400 | Missing title or content |
| 409 | Slug already exists |

---

#### `PATCH /api/admin/posts/:id`

Update an existing post. All fields are optional (only send what you want to change).

**Auth:** Requires edit capability for the post.

**Request body:** Same fields as create, all optional.

**Response (200):** `{ "success": true, "post": { ... } }`

**Error responses:**
| Status | Reason |
|--------|--------|
| 400 | Validation error |
| 403 | Cannot edit this post |
| 404 | Post not found |
| 409 | Slug already exists |

---

#### `DELETE /api/admin/posts/:id`

Delete a post permanently.

**Auth:** Requires `content.posts.archive` capability.

**Response (200):** `{ "success": true }`

---

### Posts (Public)

#### `GET /api/posts`

List all published posts. No authentication required.

**Response (200):** Array of post objects.

---

#### `POST /api/posts/:slug/reactions`

Add a reaction to a published post. No authentication required.

**Request body:**
```json
{
  "type": "like"
}
```

> Valid types: `like`, `celebrate`, `support`, `insightful`

**Response (200):**
```json
{
  "success": true,
  "reactions": { "like": 5, "celebrate": 2, "support": 1, "insightful": 3 }
}
```

**Error responses:**
| Status | Reason |
|--------|--------|
| 403 | Reactions disabled for this post or site-wide |
| 404 | Post not found |

---

### Projects (Admin)

#### `GET /api/admin/projects`

List all projects.

**Auth:** Requires `content.projects.read` capability.

**Query params:** `q` — optional search term.

**Response (200):** `{ "success": true, "projects": [...] }`

---

#### `POST /api/admin/projects`

Create a new project.

**Auth:** Requires `content.projects.create` capability.

**Request body:**
```json
{
  "title": "My Project",
  "description": "Short description",
  "technologies": ["React", "Node.js"],
  "link": "https://github.com/user/repo",
  "image": "/public/images/project.png",
  "highlights": ["Feature 1", "Feature 2"],
  "content": "<p>Detailed HTML content</p>"
}
```

**Response (201):** `{ "success": true, "project": { ... } }`

---

#### `PATCH /api/admin/projects/:id`

Update an existing project. All fields optional.

**Auth:** Requires `content.projects.edit.any` (or own project for authors).

**Response (200):** `{ "success": true, "project": { ... } }`

---

#### `DELETE /api/admin/projects/:id`

Delete a project.

**Auth:** Requires `content.projects.archive` capability.

**Response (200):** `{ "success": true }`

---

### Projects (Public)

#### `GET /api/projects`

List all projects. No authentication required.

**Response (200):** Array of project objects.

---

### File Upload

#### `POST /api/admin/uploads/images`

Upload an image file.

**Auth:** Requires `content.posts.create` capability.

**Content-Type:** `multipart/form-data`

**Limits:**
- Max file size: 5 MB
- Allowed types: JPEG, PNG, GIF, WebP (validated by magic bytes, not just extension)

**Response (201):**
```json
{
  "success": true,
  "url": "/public/images/uploads/abc123-my-image.jpg"
}
```

---

### Contact Form

#### `POST /api/contact`

Send a contact form message via email. No authentication required.

**Request body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "message": "Hello, I'd like to connect!"
}
```

**Response (200):** `{ "success": true }`

**Error responses:**
| Status | Reason |
|--------|--------|
| 400 | Missing fields or invalid email |
| 500 | Email sending failed |

---

## Error Response Format

All errors follow this shape:

```json
{
  "success": false,
  "error": "Human-readable error message."
}
```

Common HTTP status codes:
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Not authorized (insufficient permissions) |
| 404 | Resource not found |
| 409 | Conflict (duplicate slug) |
| 413 | Payload too large |
| 429 | Rate limited |
| 500 | Server error |
