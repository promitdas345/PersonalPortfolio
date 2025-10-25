const http = require('http');
const fs = require('fs/promises');
const path = require('path');

/*
 * A simple Node.js web server for a personal portfolio and blog site.
 *
 * The server delivers static assets from the `public` folder and renders
 * HTML pages from templates in the `views` folder. Dynamic routes (e.g.
 * `/blog/:slug`) read data from JSON files in the `data` folder and
 * perform basic string interpolation to inject content into templates.
 * API endpoints under `/api` expose the same data for use by client
 * scripts or external consumers.
 */

// Resolve important directories relative to this file
const BASE_DIR = __dirname;
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const VIEWS_DIR = path.join(BASE_DIR, 'views');
const DATA_DIR = path.join(BASE_DIR, 'data');

// Data file locations
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PACMAN_SECTION_FILE = path.join(VIEWS_DIR, 'partials', 'pacman-section.html');

function slugify(text) {
  return text
    ? text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : 'project';
}

function estimateReadingTime(html) {
  const stripped = html.replace(/<[^>]*>/g, ' ');
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 200));
}

/**
 * Simple template renderer. Reads an HTML file from the views directory
 * and replaces occurrences of `{{ key }}` with values provided in
 * the `variables` object. If a key isn't found, it is replaced with
 * an empty string. This avoids leaking the placeholder into the final
 * HTML.
 *
 * @param {string} templateName File name within the views folder
 * @param {Object} variables Mapping of placeholder names to values
 * @returns {Promise<string>} The rendered HTML string
 */
async function renderTemplate(templateName, variables = {}) {
  const filePath = path.join(VIEWS_DIR, templateName);
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Template not found: ${templateName}`);
  }
  return content.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, key) => {
    return key in variables ? String(variables[key]) : '';
  });
}

/**
 * Load posts or projects from their respective JSON files. Data is cached
 * in memory between requests to avoid repeatedly reading from disk.
 */
let postsCache = null;
let projectsCache = null;
let pacmanSectionCache = null;

async function loadPosts() {
  if (!postsCache) {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    postsCache = JSON.parse(data).map(post => ({
      ...post,
      readingTime: estimateReadingTime(post.content),
    }));
    // Sort posts by date descending
    postsCache.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return postsCache;
}

async function loadProjects() {
  if (!projectsCache) {
    const data = await fs.readFile(PROJECTS_FILE, 'utf8');
    projectsCache = JSON.parse(data).map((project, index) => ({
      highlights: [],
      content: '',
      technologies: [],
      metrics: [],
      architecture: [],
      impactHeadline: '',
      ownership: '',
      ...project,
      slug: project.slug || slugify(project.title || `project-${index + 1}`),
    }));
  }
  return projectsCache;
}

async function loadPacmanSection() {
  if (!pacmanSectionCache) {
    pacmanSectionCache = await fs.readFile(PACMAN_SECTION_FILE, 'utf8');
  }
  return pacmanSectionCache;
}

/**
 * Serve a static file from the public directory. If the file doesn't
 * exist, returns null. Supported files include images, CSS and JS.
 * @param {string} filePath Path relative to PUBLIC_DIR
 * @returns {Promise<{content: Buffer, contentType: string}|null>}
 */
async function getStaticFile(filePath) {
  const absolutePath = path.join(PUBLIC_DIR, filePath);
  try {
    const ext = path.extname(absolutePath).toLowerCase();
    const content = await fs.readFile(absolutePath);
    let contentType = 'application/octet-stream';
    if (ext === '.css') contentType = 'text/css';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.ico') contentType = 'image/x-icon';
    return { content, contentType };
  } catch (err) {
    return null;
  }
}

/**
 * Router function called for every HTTP request. Determines the
 * appropriate response based on the request path and method.
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
async function router(req, res) {
  const { method, url: reqUrl } = req;
  const url = new URL(reqUrl, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Serve static assets from the public directory
  if (pathname.startsWith('/public/')) {
    const relativePath = pathname.slice('/public/'.length);
    const staticFile = await getStaticFile(relativePath);
    if (staticFile) {
      res.writeHead(200, { 'Content-Type': staticFile.contentType });
      res.end(staticFile.content);
      return;
    }
  }

  // API endpoints
  if (pathname === '/api/posts') {
    const posts = await loadPosts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(posts));
    return;
  }
  if (pathname === '/api/projects') {
    const projects = await loadProjects();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(projects));
    return;
  }
  if (pathname === '/api/contact' && method === 'POST') {
    // Simple form handler that echoes back the submitted data
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Prevent excessive payloads from flooding the server
      if (body.length > 1e6) req.connection.destroy();
    });
    req.on('end', () => {
      try {
        const formData = JSON.parse(body);
        console.log('Contact form submission:', formData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Home page
  if (pathname === '/' || pathname === '/index.html') {
    const posts = await loadPosts();
    const projects = await loadProjects();
    // Show a few recent posts and projects on the landing page
    const recentPosts = posts.slice(0, 3);
    const recentProjects = projects.slice(0, 3);
    const html = await renderTemplate('index.html', {
      postsList: recentPosts
        .map(
          post =>
            `<li><a href="/blog/${post.slug}" class="text-blue-600 hover:underline">${post.title}</a> <span class="text-gray-500 text-sm">(${post.date} • ${post.readingTime} min read)</span></li>`
        )
        .join(''),
      projectsList: recentProjects
        .map(
          proj =>
            `<li><a href="/projects/${proj.slug}" class="text-blue-600 hover:underline"><strong>${proj.title}</strong></a> - ${proj.description}</li>`
        )
        .join(''),
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Individual project detail page
  if (pathname.startsWith('/projects/')) {
    const slug = pathname.slice('/projects/'.length);
    const projects = await loadProjects();
    const project = projects.find(p => p.slug === slug);
    if (!project) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Project not found');
      return;
    }
    const highlightItems = (project.highlights || [])
      .map(item => `<li>${item}</li>`);
    const highlightsList =
      highlightItems.length > 0 ? highlightItems.join('') : '<li>More details coming soon.</li>';
    const metricsItems = (project.metrics || []).map(item => `<li>${item}</li>`);
    const metricsSection = metricsItems.length
      ? `<section class="mb-6">
          <h3 class="text-2xl font-semibold mb-2">Impact & Metrics</h3>
          <ul class="list-disc list-inside space-y-1 text-gray-600">
            ${metricsItems.join('')}
          </ul>
        </section>`
      : '';
    const architectureItems = (project.architecture || []).map(item => `<li>${item}</li>`);
    const architectureSection = architectureItems.length
      ? `<section class="mb-6">
          <h3 class="text-2xl font-semibold mb-2">System Architecture</h3>
          <ul class="list-disc list-inside space-y-1 text-gray-600">
            ${architectureItems.join('')}
          </ul>
        </section>`
      : '';
    const ownershipSection = project.ownership
      ? `<section class="mb-6">
          <h3 class="text-2xl font-semibold mb-2">Ownership & Learnings</h3>
          <p class="text-gray-600">${project.ownership}</p>
        </section>`
      : '';
    const ctaButton =
      project.link && project.link.trim().length > 0
        ? `<p class="mt-4"><a href="${project.link}" class="btn btn-primary" target="_blank" rel="noopener">View Repository</a></p>`
        : '';
    const html = await renderTemplate('project.html', {
      title: project.title,
      description: project.description,
      summary: project.summary || project.description,
      technologies: project.technologies.join(', '),
      highlightsList,
      metricsSection,
      architectureSection,
      ownershipSection,
      content: project.content,
      image: project.image,
      ctaButton,
      slug: project.slug,
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Projects landing page
  if (pathname === '/projects') {
    const projects = await loadProjects();
    const pacmanSection = await loadPacmanSection();
    const html = await renderTemplate('projects.html', {
      projectsList: projects
        .map(
          proj =>
            `<div class="project-card section">
              <h3 class="text-xl font-semibold mb-1">${proj.title}</h3>
              <p class="mb-2">${proj.description}</p>
              ${proj.impactHeadline ? `<p class="project-impact">${proj.impactHeadline}</p>` : ''}
              <div class="project-tags">
                ${proj.technologies.map(tech => `<span class="tag">${tech}</span>`).join('')}
              </div>
              <div class="project-actions">
                <a href="/projects/${proj.slug}" class="btn btn-secondary">View Project</a>
              </div>
            </div>`
        )
        .join(''),
      pacmanSection,
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Blog list page
  if (pathname === '/blog') {
    const posts = await loadPosts();
    const html = await renderTemplate('blog.html', {
      postsList: posts
        .map(
          post =>
            `<article class="mb-6 section">
              <h3 class="text-2xl font-bold"><a href="/blog/${post.slug}" class="text-blue-600 hover:underline">${post.title}</a></h3>
              <p class="text-sm text-gray-600 mb-2">${post.date} • ${post.readingTime} min read</p>
              <p>${post.excerpt}</p>
            </article>`
        )
        .join(''),
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Individual blog post page
  if (pathname.startsWith('/blog/')) {
    const slug = pathname.slice('/blog/'.length);
    const posts = await loadPosts();
    const post = posts.find(p => p.slug === slug);
    if (!post) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Post not found');
      return;
    }
    const html = await renderTemplate('post.html', {
      title: post.title,
      date: post.date,
      readingTime: post.readingTime,
      content: post.content,
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // About page
  if (pathname === '/about') {
    const html = await renderTemplate('about.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Contact page
  if (pathname === '/contact') {
    const html = await renderTemplate('contact.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Pac-Man mini-game page
  if (pathname === '/pacman') {
    const pacmanSection = await loadPacmanSection();
    const html = await renderTemplate('pacman.html', { pacmanSection });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
}

// Create HTTP server
const server = http.createServer((req, res) => {
  router(req, res).catch(err => {
    console.error('Error handling request', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Portfolio/blog site running at http://localhost:${PORT}`);
});
