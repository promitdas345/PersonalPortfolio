const { normalizeReactions } = require('./post-helpers');

function createHtmlBuilders(escapeHtml) {
  function buildPostTags(post) {
    if (!post.hashtags || !post.hashtags.length) return '';
    return `<div class="blog-tags">${post.hashtags.map(tag => `<span class="blog-tag">#${escapeHtml(tag)}</span>`).join('')}</div>`;
  }

  function buildPostEngagement(post) {
    const reactions = post.reactions || { like: 0, celebrate: 0, support: 0, insightful: 0 };
    const total = reactions.like + reactions.celebrate + reactions.support + reactions.insightful;
    return `<div class="blog-engagement"><span>${total} reactions</span><span>${post.commentsCount || 0} comments</span><span>${post.reposts || 0} reposts</span></div>`;
  }

  function buildPostReactionControls(post, enabled) {
    if (!enabled) return '';
    const reactions = normalizeReactions(post.reactions);
    return `<div class="post-reactions" data-reaction-controls data-post-slug="${escapeHtml(post.slug)}">
    <button type="button" class="reaction-btn" data-reaction-button="like">Like <span data-reaction-count="like">${reactions.like}</span></button>
    <button type="button" class="reaction-btn" data-reaction-button="celebrate">Celebrate <span data-reaction-count="celebrate">${reactions.celebrate}</span></button>
    <button type="button" class="reaction-btn" data-reaction-button="support">Support <span data-reaction-count="support">${reactions.support}</span></button>
    <button type="button" class="reaction-btn" data-reaction-button="insightful">Insightful <span data-reaction-count="insightful">${reactions.insightful}</span></button>
  </div>`;
  }

  function buildPostMediaPreview(post) {
    const firstImage =
      post.coverImage ||
      (Array.isArray(post.media) ? (post.media.find(item => item && item.type === 'image' && item.url) || {}).url : '');
    if (!firstImage) return '';
    return `<div class="blog-card-media"><img src="${escapeHtml(firstImage)}" alt="${escapeHtml(post.title)}" loading="lazy" /></div>`;
  }

  function buildLinkedInSource(post) {
    if (!post.linkedinSourceUrl) return '';
    return `<p class="blog-linkedin"><a href="${escapeHtml(post.linkedinSourceUrl)}" target="_blank" rel="noopener">Originally posted on LinkedIn</a></p>`;
  }

  function buildBlogCard(post) {
    return `<article class="blog-card section" data-post-id="${escapeHtml(post.id)}">
    ${buildPostMediaPreview(post)}
    <div class="blog-card-body">
      <h3 class="text-2xl font-bold"><a href="/blog/${encodeURIComponent(post.slug)}" class="text-blue-600 hover:underline"><span data-post-field="title">${escapeHtml(post.title)}</span></a></h3>
      <p class="text-sm text-gray-600 mb-2"><span data-post-field="date">${escapeHtml(post.date)}</span> &middot; ${post.readingTime} min read</p>
      <p data-post-field="excerpt">${escapeHtml(post.excerpt)}</p>
      ${buildPostTags(post)}
      ${buildPostEngagement(post)}
      ${buildLinkedInSource(post)}
    </div>
  </article>`;
  }

  function buildPostMediaGallery(post) {
    if (!Array.isArray(post.media) || !post.media.length) return '';
    return `<section class="post-media-grid">
    ${post.media
      .map(
        item => `<figure class="post-media-item">${
          item.type === 'video'
            ? `<video controls preload="metadata" src="${escapeHtml(item.url)}"></video>`
            : `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || post.title)}" loading="lazy" />`
        }${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}</figure>`
      )
      .join('')}
  </section>`;
  }

  function buildMetricsSection(items) {
    if (!items || items.length === 0) return '';
    return `<section class="mb-6">
    <h3 class="text-2xl font-semibold mb-2">Impact & Metrics</h3>
    <ul class="list-disc list-inside space-y-1 text-gray-600" data-project-field="metrics">
      ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
  </section>`;
  }

  function buildArchitectureSection(items) {
    if (!items || items.length === 0) return '';
    return `<section class="mb-6">
    <h3 class="text-2xl font-semibold mb-2">System Architecture</h3>
    <ul class="list-disc list-inside space-y-1 text-gray-600" data-project-field="architecture">
      ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
  </section>`;
  }

  function buildOwnershipSection(text) {
    if (!text) return '';
    return `<section class="mb-6">
    <h3 class="text-2xl font-semibold mb-2">Ownership & Learnings</h3>
    <p class="text-gray-600" data-project-field="ownership">${escapeHtml(text)}</p>
  </section>`;
  }

  return {
    buildPostTags,
    buildPostEngagement,
    buildPostReactionControls,
    buildPostMediaPreview,
    buildLinkedInSource,
    buildBlogCard,
    buildPostMediaGallery,
    buildMetricsSection,
    buildArchitectureSection,
    buildOwnershipSection,
  };
}

module.exports = { createHtmlBuilders };
