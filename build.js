const fs = require('fs/promises');
const path = require('path');

const BASE_DIR = __dirname;
const DIST_DIR = path.join(BASE_DIR, 'dist');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const VIEWS_DIR = path.join(BASE_DIR, 'views');
const DATA_DIR = path.join(BASE_DIR, 'data');

const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PACMAN_SECTION_FILE = path.join(VIEWS_DIR, 'partials', 'pacman-section.html');
const CHESS_SECTION_FILE = path.join(VIEWS_DIR, 'partials', 'chess-section.html');

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

async function renderTemplate(templateName, variables = {}) {
  const filePath = path.join(VIEWS_DIR, templateName);
  const content = await fs.readFile(filePath, 'utf8');
  return content.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, key) => {
    return key in variables ? String(variables[key]) : '';
  });
}

let postsCache = null;
let projectsCache = null;
let pacmanSectionCache = null;
let chessSectionCache = null;

async function loadPosts() {
  if (!postsCache) {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    postsCache = JSON.parse(data).map(post => ({
      ...post,
      readingTime: estimateReadingTime(post.content),
    }));
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

async function loadChessSection() {
  if (!chessSectionCache) {
    chessSectionCache = await fs.readFile(CHESS_SECTION_FILE, 'utf8');
  }
  return chessSectionCache;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writePage(relativePath, html) {
  const outPath = path.join(DIST_DIR, relativePath);
  await ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, html, 'utf8');
}

async function copyDirectory(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await ensureDir(dest);
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function buildHomePage() {
  const posts = await loadPosts();
  const projects = await loadProjects();
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
  await writePage('index.html', html);
}

function buildMetricsSection(items) {
  if (!items || items.length === 0) return '';
  return `<section class="mb-6">
    <h3 class="text-2xl font-semibold mb-2">Impact & Metrics</h3>
    <ul class="list-disc list-inside space-y-1 text-gray-600">
      ${items.map(item => `<li>${item}</li>`).join('')}
    </ul>
  </section>`;
}

function buildArchitectureSection(items) {
  if (!items || items.length === 0) return '';
  return `<section class="mb-6">
    <h3 class="text-2xl font-semibold mb-2">System Architecture</h3>
    <ul class="list-disc list-inside space-y-1 text-gray-600">
      ${items.map(item => `<li>${item}</li>`).join('')}
    </ul>
  </section>`;
}

function buildOwnershipSection(text) {
  if (!text) return '';
  return `<section class="mb-6">
    <h3 class="text-2xl font-semibold mb-2">Ownership & Learnings</h3>
    <p class="text-gray-600">${text}</p>
  </section>`;
}

async function buildProjectsPages() {
  const projects = await loadProjects();
  const pacmanSection = await loadPacmanSection();
  const chessSection = await loadChessSection();

  const projectsHtml = await renderTemplate('projects.html', {
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
    chessSection,
  });
  await writePage(path.join('projects', 'index.html'), projectsHtml);

  for (const project of projects) {
    const highlightItems = (project.highlights || []).map(item => `<li>${item}</li>`);
    const highlightsList =
      highlightItems.length > 0 ? highlightItems.join('') : '<li>More details coming soon.</li>';

    const html = await renderTemplate('project.html', {
      title: project.title,
      description: project.description,
      summary: project.summary || project.description,
      technologies: project.technologies.join(', '),
      highlightsList,
      metricsSection: buildMetricsSection(project.metrics),
      architectureSection: buildArchitectureSection(project.architecture),
      ownershipSection: buildOwnershipSection(project.ownership),
      content: project.content,
      image: project.image,
      ctaButton:
        project.link && project.link.trim().length > 0
          ? `<p class="mt-4"><a href="${project.link}" class="btn btn-primary" target="_blank" rel="noopener">View Repository</a></p>`
          : '',
      slug: project.slug,
    });

    await writePage(path.join('projects', project.slug, 'index.html'), html);
  }
}

async function buildBlogPages() {
  const posts = await loadPosts();
  const blogHtml = await renderTemplate('blog.html', {
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
  await writePage(path.join('blog', 'index.html'), blogHtml);

  for (const post of posts) {
    const html = await renderTemplate('post.html', {
      title: post.title,
      date: post.date,
      readingTime: post.readingTime,
      content: post.content,
    });
    await writePage(path.join('blog', post.slug, 'index.html'), html);
  }
}

async function buildStaticPages() {
  const about = await renderTemplate('about.html');
  const contact = await renderTemplate('contact.html');
  const pacmanSection = await loadPacmanSection();
  const chessSection = await loadChessSection();
  const pacman = await renderTemplate('pacman.html', { pacmanSection });
  const chess = await renderTemplate('chess.html', { chessSection });

  await writePage(path.join('about', 'index.html'), about);
  await writePage(path.join('contact', 'index.html'), contact);
  await writePage(path.join('pacman', 'index.html'), pacman);
  await writePage(path.join('chess', 'index.html'), chess);
}

async function build404Page() {
  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Page Not Found | Promit's Portfolio</title>
      <link rel="stylesheet" href="/public/styles.css" />
    </head>
    <body>
      <main class="container py-8" style="text-align:center;">
        <h1>Page not found</h1>
        <p>The page you're looking for doesn't exist. Head back to the <a href="/">home page</a>.</p>
      </main>
    </body>
  </html>`;
  await writePage('404.html', html);
}

async function buildSite() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await ensureDir(DIST_DIR);
  await Promise.all([
    copyDirectory(PUBLIC_DIR, path.join(DIST_DIR, 'public')),
    buildHomePage(),
    buildProjectsPages(),
    buildBlogPages(),
    buildStaticPages(),
  ]);
  await build404Page();
}

buildSite()
  .then(() => {
    console.log('Static site generated in dist/');
  })
  .catch(err => {
    console.error('Failed to build static site:', err);
    process.exit(1);
  });
