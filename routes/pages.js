const { sendHtml, sendText } = require('../lib/http');

function createPageRoutes(deps) {
  const { auth, loaders, renderTemplate, htmlBuilders } = deps;
  const { loadPosts, loadProjects, loadPacmanSection, loadAnalytics, escapeHtml } = loaders;

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

    return false; // not handled
  }

  return handlePageRoute;
}

module.exports = { createPageRoutes };
