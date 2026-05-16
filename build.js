const fs = require('fs/promises');
const path = require('path');
const { createLoaders } = require('./lib/data');
const { createRenderer } = require('./lib/templates');
const { createHtmlBuilders } = require('./lib/html-builders');

const BASE_DIR = __dirname;
const DIST_DIR = path.join(BASE_DIR, 'dist');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const VIEWS_DIR = path.join(BASE_DIR, 'views');
const DATA_DIR = path.join(BASE_DIR, 'data');

const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PACMAN_SECTION_FILE = path.join(VIEWS_DIR, 'partials', 'pacman-section.html');

const renderTemplate = createRenderer(VIEWS_DIR);
const loaders = createLoaders({
  postsFile: POSTS_FILE,
  projectsFile: PROJECTS_FILE,
  pacmanSectionFile: PACMAN_SECTION_FILE,
});
const { loadPosts, loadProjects, loadPacmanSection, escapeHtml } = loaders;
const {
  buildBlogCard,
  buildPostTags,
  buildPostEngagement,
  buildPostMediaGallery,
  buildLinkedInSource,
  buildMetricsSection,
  buildArchitectureSection,
  buildOwnershipSection,
} = createHtmlBuilders(escapeHtml);

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
  const html = await renderTemplate('index.html', {
    postsList: posts
      .slice(0, 3)
      .map(
        post =>
          `<li data-post-id="${escapeHtml(post.id)}"><a href="/blog/${encodeURIComponent(post.slug)}" class="text-blue-600 hover:underline"><span data-post-field="title">${escapeHtml(post.title)}</span></a> <span class="text-gray-500 text-sm">(<span data-post-field="date">${escapeHtml(post.date)}</span> &middot; ${post.readingTime} min read)</span></li>`
      )
      .join(''),
    projectsList: projects
      .slice(0, 3)
      .map(
        proj =>
          `<li data-project-id="${escapeHtml(String(proj.id))}"><a href="/projects/${encodeURIComponent(proj.slug)}" class="text-blue-600 hover:underline"><strong data-project-field="title">${escapeHtml(proj.title)}</strong></a> - <span data-project-field="description">${escapeHtml(proj.description)}</span></li>`
      )
      .join(''),
  });
  await writePage('index.html', html);
}

async function buildProjectsPages() {
  const projects = await loadProjects();
  const pacmanSection = await loadPacmanSection();

  const projectsHtml = await renderTemplate('projects.html', {
    projectsList: projects
      .map(
        proj =>
          `<div class="project-card section" data-project-id="${escapeHtml(String(proj.id))}">
            <h3 class="text-xl font-semibold mb-1" data-project-field="title">${escapeHtml(proj.title)}</h3>
            <p class="mb-2" data-project-field="description">${escapeHtml(proj.description)}</p>
            ${proj.impactHeadline ? `<p class="project-impact" data-project-field="impactHeadline">${escapeHtml(proj.impactHeadline)}</p>` : ''}
            <div class="project-tags" data-project-field="technologies">
              ${proj.technologies.map(tech => `<span class="tag">${escapeHtml(tech)}</span>`).join('')}
            </div>
            <div class="project-actions">
              <a href="/projects/${encodeURIComponent(proj.slug)}" class="btn btn-secondary">View Project</a>
            </div>
          </div>`
      )
      .join(''),
    pacmanSection,
  });
  await writePage(path.join('projects', 'index.html'), projectsHtml);

  for (const project of projects) {
    const highlightItems = (project.highlights || []).map(item => `<li>${escapeHtml(item)}</li>`);
    const highlightsList =
      highlightItems.length > 0 ? highlightItems.join('') : '<li>More details coming soon.</li>';

    const html = await renderTemplate('project.html', {
      title: escapeHtml(project.title),
      description: escapeHtml(project.description),
      summary: escapeHtml(project.summary || project.description),
      technologies: escapeHtml(project.technologies.join(', ')),
      highlightsList,
      metricsSection: buildMetricsSection(project.metrics),
      architectureSection: buildArchitectureSection(project.architecture),
      ownershipSection: buildOwnershipSection(project.ownership),
      content: project.content,
      image: project.image,
      ctaButton:
        project.link && project.link.trim().length > 0
          ? `<p class="mt-4"><a href="${escapeHtml(project.link)}" class="btn btn-primary" target="_blank" rel="noopener">View Repository</a></p>`
          : '',
      projectId: escapeHtml(String(project.id)),
      slug: escapeHtml(project.slug),
    });

    await writePage(path.join('projects', project.slug, 'index.html'), html);
  }
}

async function buildBlogPages() {
  const posts = await loadPosts();
  const blogHtml = await renderTemplate('blog.html', {
    postsList: posts.map(buildBlogCard).join(''),
  });
  await writePage(path.join('blog', 'index.html'), blogHtml);

  for (const post of posts) {
    const html = await renderTemplate('post.html', {
      postId: escapeHtml(post.id),
      slug: escapeHtml(post.slug),
      title: escapeHtml(post.title),
      date: escapeHtml(post.date),
      readingTime: post.readingTime,
      content: post.contentHtml,
      hashtags: buildPostTags(post),
      mediaGallery: buildPostMediaGallery(post),
      engagement: buildPostEngagement(post),
      reactionControls: '',
      linkedinSource: buildLinkedInSource(post),
      previewBanner: '',
    });
    await writePage(path.join('blog', post.slug, 'index.html'), html);
  }
}

async function buildStaticPages() {
  const about = await renderTemplate('about.html');
  const contact = await renderTemplate('contact.html');
  const pacmanSection = await loadPacmanSection();
  const pacman = await renderTemplate('pacman.html', { pacmanSection });
  const connect4 = await renderTemplate('connect4.html');
  const snake = await renderTemplate('snake.html');
  const neuroedit = await renderTemplate('neuroedit.html');
  const photography = await renderTemplate('photography.html');
  const resumeTutorial = await renderTemplate('resume-tutorial.html');

  await writePage(path.join('about', 'index.html'), about);
  await writePage(path.join('contact', 'index.html'), contact);
  await writePage(path.join('pacman', 'index.html'), pacman);
  await writePage(path.join('connect4', 'index.html'), connect4);
  await writePage(path.join('snake', 'index.html'), snake);
  await writePage(path.join('neuroedit', 'index.html'), neuroedit);
  await writePage(path.join('photography', 'index.html'), photography);
  await writePage(path.join('resume-tutorial', 'index.html'), resumeTutorial);
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
