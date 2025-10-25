const fs = require('fs/promises');
const path = require('path');

const BASE_DIR = __dirname;
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const VIEWS_DIR = path.join(BASE_DIR, 'views');
const DATA_DIR = path.join(BASE_DIR, 'data');
const BUILD_DIR = path.join(BASE_DIR, 'dist');

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

async function loadPosts() {
  const data = await fs.readFile(POSTS_FILE, 'utf8');
  const posts = JSON.parse(data).map(post => ({
    ...post,
    readingTime: estimateReadingTime(post.content),
  }));
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return posts;
}

async function loadProjects() {
  const data = await fs.readFile(PROJECTS_FILE, 'utf8');
  return JSON.parse(data).map((project, index) => ({
    highlights: [],
    content: '',
    ...project,
    slug: project.slug || slugify(project.title || `project-${index + 1}`),
  }));
}

async function loadPacmanSection() {
  return await fs.readFile(PACMAN_SECTION_FILE, 'utf8');
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function writeHtmlFile(relativePath, content) {
  const fullPath = path.join(BUILD_DIR, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf8');
  console.log(`Generated: ${relativePath}`);
}

async function build() {
  console.log('Starting build...');
  
  await fs.mkdir(BUILD_DIR, { recursive: true });
  
  console.log('Copying public assets...');
  await copyDir(PUBLIC_DIR, path.join(BUILD_DIR, 'public'));
  
  console.log('Loading data...');
  const posts = await loadPosts();
  const projects = await loadProjects();
  const pacmanSection = await loadPacmanSection();
  
  console.log('Generating pages...');
  
  const recentPosts = posts.slice(0, 3);
  const recentProjects = projects.slice(0, 3);
  const indexHtml = await renderTemplate('index.html', {
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
  await writeHtmlFile('index.html', indexHtml);
  
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
  await writeHtmlFile('blog/index.html', blogHtml);
  
  for (const post of posts) {
    const postHtml = await renderTemplate('post.html', {
      title: post.title,
      date: post.date,
      readingTime: post.readingTime,
      content: post.content,
    });
    await writeHtmlFile(`blog/${post.slug}/index.html`, postHtml);
  }
  
  const projectsHtml = await renderTemplate('projects.html', {
    projectsList: projects
      .map(
        proj =>
          `<div class="project-card section">
            <h3 class="text-xl font-semibold mb-1">${proj.title}</h3>
            <p class="mb-2">${proj.description}</p>
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
  await writeHtmlFile('projects/index.html', projectsHtml);
  
  for (const project of projects) {
    const highlightItems = (project.highlights || [])
      .map(item => `<li>${item}</li>`);
    const highlightsList =
      highlightItems.length > 0 ? highlightItems.join('') : '<li>More details coming soon.</li>';
    const ctaButton =
      project.link && project.link.trim().length > 0
        ? `<p class="mt-4"><a href="${project.link}" class="btn btn-primary" target="_blank" rel="noopener">View Repository</a></p>`
        : '';
    const projectHtml = await renderTemplate('project.html', {
      title: project.title,
      description: project.description,
      summary: project.summary || project.description,
      technologies: project.technologies.join(', '),
      highlightsList,
      content: project.content,
      image: project.image,
      ctaButton,
      slug: project.slug,
    });
    await writeHtmlFile(`projects/${project.slug}/index.html`, projectHtml);
  }
  
  const aboutHtml = await renderTemplate('about.html');
  await writeHtmlFile('about/index.html', aboutHtml);
  
  const contactHtml = await renderTemplate('contact.html');
  await writeHtmlFile('contact/index.html', contactHtml);
  
  const pacmanHtml = await renderTemplate('pacman.html', { pacmanSection });
  await writeHtmlFile('pacman/index.html', pacmanHtml);
  
  console.log('Build complete! Output in dist/');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
