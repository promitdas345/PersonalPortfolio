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

async function loadChallenges() {
  const data = await fs.readFile(path.join(DATA_DIR, 'challenges.json'), 'utf8');
  return JSON.parse(data);
}

async function buildChallengesPages() {
  const challenges = await loadChallenges();

  const allLangs = new Set();
  let totalStagesCount = 0;
  for (const c of challenges) {
    totalStagesCount += c.totalStages || 0;
    (c.languages || []).forEach(l => allLangs.add(l));
  }

  const difficultyColors = { easy: '#22c55e', medium: '#eab308', hard: '#ef4444' };
  const challengeCards = challenges.map((c, i) => {
    const langPills = (c.languages || []).map(l =>
      `<span class="challenge-card__lang">${escapeHtml(l)}</span>`
    ).join('');
    const diffClass = c.difficulty || 'medium';
    const comingSoonBadge = c.comingSoon
      ? '<span class="challenge-card__coming-soon">Coming Soon</span>'
      : '';
    return `<a href="${c.comingSoon ? '#' : '/challenges/' + encodeURIComponent(c.slug)}" class="challenge-card${c.comingSoon ? ' challenge-card--disabled' : ''}" data-animate style="--stagger-delay:${i * 80}ms">
      ${comingSoonBadge}
      <div class="challenge-card__icon">${c.icon || '📦'}</div>
      <h3 class="challenge-card__title">${escapeHtml(c.title)}</h3>
      <p class="challenge-card__desc">${escapeHtml(c.description)}</p>
      <div class="challenge-card__footer">
        <span class="challenge-card__difficulty challenge-card__difficulty--${diffClass}">${escapeHtml(diffClass)}</span>
        <span class="challenge-card__stages">${c.totalStages || 0} stages</span>
      </div>
      <div class="challenge-card__langs">${langPills}</div>
      <div class="challenge-card__progress">
        <div class="progress-bar"><div class="progress-bar__fill" style="width:0%"></div></div>
      </div>
    </a>`;
  }).join('');

  const listingHtml = await renderTemplate('challenges.html', {
    totalChallenges: challenges.length,
    totalStages: totalStagesCount,
    totalLanguages: allLangs.size,
    challengeCards,
    analytics: '',
  });
  await writePage(path.join('challenges', 'index.html'), listingHtml);

  for (const challenge of challenges) {
    if (challenge.comingSoon) continue;

    const languagePills = (challenge.languages || []).map(l =>
      `<span class="challenge-card__lang">${escapeHtml(l)}</span>`
    ).join('');

    const stageListItems = (challenge.stages || []).map((stage, i) => {
      return `<button class="stage-item${i === 0 ? ' stage-item--active' : ''}" data-stage-index="${i}" aria-label="Stage ${i + 1}: ${escapeHtml(stage.title)}">
        <div class="stage-item__number">
          <span class="stage-item__num-text">${i + 1}</span>
          <svg class="stage-item__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="stage-item__info">
          <span class="stage-item__title">${escapeHtml(stage.title)}</span>
          <span class="stage-item__desc">${escapeHtml(stage.description)}</span>
        </div>
      </button>`;
    }).join('');

    const defaultLang = (challenge.languages || ['python'])[0];
    const stageContentPanels = (challenge.stages || []).map((stage, i) => {
      const snippet = stage.codeSnippets ? stage.codeSnippets[defaultLang] : null;
      const codeBlock = snippet
        ? `<div class="code-block">
            <div class="code-block__header">
              <span class="code-block__filename">${escapeHtml(snippet.filename)}</span>
              <button class="code-block__copy" aria-label="Copy code">Copy</button>
            </div>
            <pre class="code-block__body"><code>${escapeHtml(snippet.code)}</code></pre>
          </div>`
        : '';

      const terminal = stage.terminalOutput
        ? `<div class="terminal-output ${stage.terminalSuccess ? 'terminal-output--success' : 'terminal-output--error'}" data-animate-terminal="true">
            <div class="terminal-output__header">
              <span class="terminal-dot terminal-dot--red"></span>
              <span class="terminal-dot terminal-dot--yellow"></span>
              <span class="terminal-dot terminal-dot--green"></span>
              <span class="terminal-output__title">Terminal</span>
            </div>
            <pre class="terminal-output__body">${escapeHtml(stage.terminalOutput)}</pre>
          </div>`
        : '';

      const hints = (stage.hints || []).map((hint, hi) =>
        `<div class="hint-box" data-hint-index="${hi}">
          <button class="hint-box__header" aria-expanded="false">
            <span>💡 Hint ${hi + 1}</span>
            <span class="hint-box__chevron">▸</span>
          </button>
          <div class="hint-box__content"><p>${escapeHtml(hint)}</p></div>
        </div>`
      ).join('');

      return `<div class="stage-content${i === 0 ? ' stage-content--active' : ''}" data-stage-panel="${i}">
        <div class="stage-content__header">
          <span class="stage-content__number">Stage ${i + 1}</span>
          <h3 class="stage-content__title">${escapeHtml(stage.title)}</h3>
        </div>
        <div class="stage-content__instructions">${stage.instructions || ''}</div>
        ${codeBlock}
        ${terminal}
        ${hints}
      </div>`;
    }).join('');

    const html = await renderTemplate('challenge.html', {
      challengeId: escapeHtml(challenge.id),
      challengeTitle: escapeHtml(challenge.title),
      challengeDescription: escapeHtml(challenge.description),
      challengeDifficulty: escapeHtml(challenge.difficulty || 'medium'),
      challengeIcon: challenge.icon || '📦',
      totalStages: challenge.totalStages || 0,
      estimatedHours: challenge.estimatedHours || 0,
      languagePills,
      stageListItems,
      stageContentPanels,
      analytics: '',
    });
    
    await writePage(path.join('challenges', challenge.slug, 'index.html'), html);
  }
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
    buildChallengesPages(),
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
