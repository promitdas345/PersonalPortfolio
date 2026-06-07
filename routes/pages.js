const { sendHtml, sendText } = require('../lib/http');
const fs = require('fs/promises');
const path = require('path');

function createPageRoutes(deps) {
  const { auth, loaders, renderTemplate, htmlBuilders } = deps;
  const { loadPosts, loadProjects, loadPacmanSection, loadAnalytics, escapeHtml, sanitizeRichHtml } = loaders;

  // Challenges data loader
  const CHALLENGES_FILE = path.join(__dirname, '..', 'data', 'challenges.json');
  let challengesCache = null;
  async function loadChallenges() {
    if (!challengesCache) {
      const data = await fs.readFile(CHALLENGES_FILE, 'utf8');
      challengesCache = JSON.parse(data);
    }
    return challengesCache;
  }

  // Helper to get analytics HTML with GA measurement ID from environment
  async function getAnalyticsHtml() {
    const gaMeasurementId = process.env.GA_MEASUREMENT_ID || '';
    if (!gaMeasurementId) return ''; // No tracking if GA ID not configured
    const analyticsPartial = await loadAnalytics();
    return analyticsPartial.replace(/\{\{\s*gaMeasurementId\s*\}\}/g, gaMeasurementId);
  }
  const {
    buildBlogCard,
    buildPostTags,
    buildPostEngagement,
    buildPostReactionControls,
    buildPostMediaGallery,
    buildLinkedInSource,
    buildMetricsSection,
    buildArchitectureSection,
    buildOwnershipSection,
  } = htmlBuilders;

  async function handlePageRoute(req, res, normalizedPathname) {
    if (normalizedPathname === '/' || normalizedPathname === '/index.html') {
      const posts = await loadPosts();
      const projects = await loadProjects();
      const analytics = await getAnalyticsHtml();
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
            project =>
              `<li data-project-id="${escapeHtml(String(project.id))}"><a href="/projects/${encodeURIComponent(project.slug)}" class="text-blue-600 hover:underline"><strong data-project-field="title">${escapeHtml(project.title)}</strong></a> - <span data-project-field="description">${escapeHtml(project.description)}</span></li>`
          )
          .join(''),
        analytics,
      });
      return sendHtml(res, html);
    }

    if (normalizedPathname.startsWith('/projects/')) {
      const slug = decodeURIComponent(normalizedPathname.slice('/projects/'.length));
      const project = (await loadProjects()).find(item => item.slug === slug);
      if (!project) return sendText(res, 404, 'Project not found');
      const highlightsList =
        project.highlights && project.highlights.length
          ? project.highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('')
          : '<li>More details coming soon.</li>';
      const ctaButton =
        project.link && project.link.trim()
          ? `<p class="mt-4"><a href="${escapeHtml(project.link)}" class="btn btn-primary" target="_blank" rel="noopener">View Repository</a></p>`
          : '';
      const analytics = await getAnalyticsHtml();
      const html = await renderTemplate('project.html', {
        title: escapeHtml(project.title),
        description: escapeHtml(project.description),
        summary: escapeHtml(project.summary || project.description),
        technologies: escapeHtml((project.technologies || []).join(', ')),
        highlightsList,
        metricsSection: buildMetricsSection(project.metrics),
        architectureSection: buildArchitectureSection(project.architecture),
        ownershipSection: buildOwnershipSection(project.ownership),
        content: project.content || '',
        image: project.image,
        ctaButton,
        projectId: escapeHtml(String(project.id)),
        slug: escapeHtml(project.slug),
        analytics,
      });
      return sendHtml(res, html);
    }

    if (normalizedPathname === '/projects') {
      const projects = await loadProjects();
      const pacmanSection = await loadPacmanSection();
      const analytics = await getAnalyticsHtml();
      const html = await renderTemplate('projects.html', {
        projectsList: projects
          .map(
            project =>
              `<div class="project-card section" data-project-id="${escapeHtml(String(project.id))}">
              <h3 class="text-xl font-semibold mb-1" data-project-field="title">${escapeHtml(project.title)}</h3>
              <p class="mb-2" data-project-field="description">${escapeHtml(project.description)}</p>
              ${project.impactHeadline ? `<p class="project-impact" data-project-field="impactHeadline">${escapeHtml(project.impactHeadline)}</p>` : ''}
              <div class="project-tags" data-project-field="technologies">${(project.technologies || []).map(tech => `<span class="tag">${escapeHtml(tech)}</span>`).join('')}</div>
              <div class="project-actions"><a href="/projects/${encodeURIComponent(project.slug)}" class="btn btn-secondary">View Project</a></div>
            </div>`
          )
          .join(''),
        pacmanSection,
        analytics,
      });
      return sendHtml(res, html);
    }

    if (normalizedPathname === '/blog') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(
        res,
        await renderTemplate('blog.html', {
          postsList: (await loadPosts()).map(buildBlogCard).join(''),
          analytics,
        })
      );
    }

    if (normalizedPathname === '/blog/editor' || normalizedPathname.startsWith('/blog/editor/')) {
      const context = await auth.authContext(req);
      if (!context.session) return sendHtml(res, '<script>window.location.href="/blog";</script>', 302);
      const editSlug = normalizedPathname === '/blog/editor' ? '' : decodeURIComponent(normalizedPathname.slice('/blog/editor/'.length));
      let postJson = 'null';
      if (editSlug) {
        const allPosts = await loadPosts({ includeUnpublished: true, includeArchived: true });
        const post = allPosts.find(item => item.slug === editSlug);
        if (post) postJson = JSON.stringify({ id: post.id, slug: post.slug, title: post.title, excerpt: post.excerpt, contentHtml: post.contentHtml, contentMarkdown: post.contentMarkdown, date: post.date, status: post.status, hashtags: post.hashtags, linkedinSourceUrl: post.linkedinSourceUrl, media: post.media, coverImage: post.coverImage });
      }
      const csrfToken = context.session ? context.session.csrfToken : '';
      const analytics = await getAnalyticsHtml();
      const html = await renderTemplate('editor.html', { postJson, csrfToken, analytics });
      return sendHtml(res, html);
    }

    if (normalizedPathname.startsWith('/blog/')) {
      const slug = decodeURIComponent(normalizedPathname.slice('/blog/'.length));
      const post = (await loadPosts()).find(item => item.slug === slug);
      if (!post) return sendText(res, 404, 'Post not found');
      const store = await auth.loadStore();
      const publicReactionsEnabled =
        !(store.siteSettings && store.siteSettings.blog && store.siteSettings.blog.allowPublicReactions === false) &&
        post.allowComments !== false;
      const analytics = await getAnalyticsHtml();
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
        reactionControls: buildPostReactionControls(post, publicReactionsEnabled),
        linkedinSource: buildLinkedInSource(post),
        previewBanner: '',
        analytics,
      });
      return sendHtml(res, html);
    }

    if (normalizedPathname === '/about') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('about.html', { analytics }));
    }
    if (normalizedPathname === '/contact') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('contact.html', { analytics }));
    }
    if (normalizedPathname === '/pacman') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('pacman.html', { pacmanSection: await loadPacmanSection(), analytics }));
    }
    if (normalizedPathname === '/connect4') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('connect4.html', { analytics }));
    }
    if (normalizedPathname === '/snake') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('snake.html', { analytics }));
    }
    if (normalizedPathname === '/neuroedit') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('neuroedit.html', { analytics }));
    }


    if (normalizedPathname === '/resume-tutorial') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('resume-tutorial.html', { analytics }));
    }

    if (normalizedPathname === '/photography') {
      const analytics = await getAnalyticsHtml();
      return sendHtml(res, await renderTemplate('photography.html', { analytics }));
    }

    // ── Challenges listing ──
    if (normalizedPathname === '/challenges') {
      const challenges = await loadChallenges();
      const analytics = await getAnalyticsHtml();

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

      const html = await renderTemplate('challenges.html', {
        totalChallenges: challenges.length,
        totalStages: totalStagesCount,
        totalLanguages: allLangs.size,
        challengeCards,
        analytics,
      });
      return sendHtml(res, html);
    }

    // ── Challenge detail page ──
    if (normalizedPathname.startsWith('/challenges/')) {
      const slug = decodeURIComponent(normalizedPathname.slice('/challenges/'.length));
      const challenges = await loadChallenges();
      const challenge = challenges.find(c => c.slug === slug);
      if (!challenge || challenge.comingSoon) return sendText(res, 404, 'Challenge not found');

      const analytics = await getAnalyticsHtml();

      const languagePills = (challenge.languages || []).map(l =>
        `<span class="challenge-card__lang">${escapeHtml(l)}</span>`
      ).join('');

      // Build stage sidebar items
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

      // Build stage content panels
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
          <div class="stage-content__instructions">${sanitizeRichHtml(stage.instructions || '')}</div>
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
        analytics,
      });
      return sendHtml(res, html);
    }

    return false; // not handled
  }

  return handlePageRoute;
}

module.exports = { createPageRoutes };
