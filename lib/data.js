const fs = require('fs/promises');
const crypto = require('crypto');

const POST_STATUSES = new Set([
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'archived',
]);
const POST_SORT_FIELDS = new Set([
  'updatedAt',
  'publishedAt',
  'scheduledAt',
  'createdAt',
  'title',
  'date',
]);

function slugify(text) {
  return text
    ? text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : 'post';
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function sanitizeUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '#';
  if (value.startsWith('/') || value.startsWith('#')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:/i.test(value)) return value;
  return '#';
}

function sanitizeRichHtml(rawHtml) {
  let value = String(rawHtml || '');
  value = value.replace(/<script[\s\S]*?<\/script>/gi, '');
  value = value.replace(/<style[\s\S]*?<\/style>/gi, '');
  value = value.replace(/\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)/gi, '');
  value = value.replace(/\s(href|src)\s*=\s*(\"[^\"]*\"|'[^']*')/gi, (match, attr, quotedValue) => {
    const unquoted = quotedValue.slice(1, -1).trim();
    if (/^javascript:/i.test(unquoted)) {
      return ` ${attr}="#"`;
    }
    return ` ${attr}="${escapeHtml(unquoted)}"`;
  });
  return value;
}

function renderInlineMarkdown(text) {
  let output = escapeHtml(text);
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const safeUrl = sanitizeUrl(url);
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${label}</a>`;
  });
  return output;
}

function markdownToSafeHtml(markdown) {
  const lines = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const chunks = [];
  let paragraph = [];
  let inList = false;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    const body = renderInlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br />');
    chunks.push(`<p>${body}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    chunks.push('</ul>');
    inList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeParagraph();
      closeList();
      const level = headingMatch[1].length;
      chunks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^[-*+]\s+(.+)$/);
    if (listMatch) {
      closeParagraph();
      if (!inList) {
        chunks.push('<ul>');
        inList = true;
      }
      chunks.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    if (inList) {
      closeList();
    }
    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  return chunks.join('');
}

function estimateReadingTime(html) {
  const stripped = String(html || '').replace(/<[^>]*>/g, ' ');
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 200));
}

function htmlToPlainText(html) {
  const normalized = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(normalized).replace(/\n{3,}/g, '\n\n').trim();
}

function htmlToBasicMarkdown(html) {
  let text = String(html || '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, level, content) => {
    const hashes = '#'.repeat(Number(level));
    return `\n${hashes} ${content.replace(/<[^>]+>/g, '').trim()}\n`;
  });
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  text = text.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1');
  text = text.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const lines = content.replace(/<[^>]+>/g, '').trim().split('\n');
    return lines.map(line => `> ${line}`).join('\n') + '\n';
  });
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  text = text.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function looksLikeHtml(text) {
  return /<[^>]+>/.test(String(text || ''));
}

function parseIsoOrFallback(value, fallbackIso) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackIso;
  }
  return parsed.toISOString();
}

function parseIsoOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

function normalizeDateString(value, fallbackIso) {
  const raw = String(value || '').trim();
  if (isValidDateString(raw)) return raw;
  return fallbackIso.slice(0, 10);
}

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function makeUniqueSlug(baseSlug, existingSlugs) {
  const safeBase = slugify(baseSlug) || 'post';
  let candidate = safeBase;
  let counter = 2;
  while (existingSlugs.has(candidate)) {
    candidate = `${safeBase}-${counter}`;
    counter += 1;
  }
  existingSlugs.add(candidate);
  return candidate;
}

function deriveExcerpt(rawExcerpt, markdownText) {
  const excerpt = String(rawExcerpt || '').trim();
  if (excerpt) return excerpt.slice(0, 260);
  return String(markdownText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (POST_STATUSES.has(status)) return status;
  return 'published';
}

function normalizeHashtags(rawHashtags) {
  if (!Array.isArray(rawHashtags)) return [];
  return Array.from(
    new Set(
      rawHashtags
        .map(tag => String(tag || '').trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean)
        .map(tag => tag.slice(0, 40))
    )
  );
}

function normalizeMediaItems(rawMedia) {
  if (!Array.isArray(rawMedia)) return [];
  const output = [];
  for (const item of rawMedia) {
    if (!item || typeof item !== 'object') continue;
    const url = String(item.url || '').trim();
    if (!url) continue;
    output.push({
      id: String(item.id || '').trim() || createId(),
      assetId: item.assetId ? String(item.assetId).trim() : null,
      type: String(item.type || 'image').trim().toLowerCase() === 'video' ? 'video' : 'image',
      url: sanitizeUrl(url),
      alt: String(item.alt || '').trim().slice(0, 300),
      caption: String(item.caption || '').trim().slice(0, 500),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : output.length,
    });
  }
  return output
    .sort((left, right) => left.order - right.order)
    .slice(0, 20)
    .map((item, index) => ({ ...item, order: index }));
}

function firstImageUrl(media) {
  if (!Array.isArray(media)) return '';
  const firstImage = media.find(item => item && item.type === 'image' && item.url);
  return firstImage ? firstImage.url : '';
}

function normalizeReactions(rawReactions) {
  const raw = rawReactions && typeof rawReactions === 'object' ? rawReactions : {};
  const readCount = key => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  };
  return {
    like: readCount('like'),
    celebrate: readCount('celebrate'),
    support: readCount('support'),
    insightful: readCount('insightful'),
  };
}

function toRuntimePost(post) {
  const primaryImage = post.coverImage || firstImageUrl(post.media);
  return {
    ...post,
    content: post.contentHtml,
    readingTime: estimateReadingTime(post.contentHtml),
    primaryImage,
  };
}

function normalizePost(rawPost, index, existingSlugs, nowIso) {
  const raw = rawPost && typeof rawPost === 'object' ? rawPost : {};
  const createdAtFallback = raw.date
    ? parseIsoOrFallback(`${raw.date}T00:00:00.000Z`, nowIso)
    : nowIso;
  const createdAt = parseIsoOrFallback(raw.createdAt || createdAtFallback, nowIso);
  const updatedAt = parseIsoOrFallback(raw.updatedAt || createdAt, createdAt);
  const status = normalizeStatus(raw.status);
  const date = normalizeDateString(raw.date, createdAt);

  let sourceMarkdown = String(raw.contentMarkdown || '').trim();
  if (!sourceMarkdown) {
    const legacyContent = String(raw.contentHtml || raw.content || '').trim();
    sourceMarkdown = looksLikeHtml(legacyContent) ? htmlToPlainText(legacyContent) : legacyContent;
  }

  const contentMarkdown = sourceMarkdown.trim();
  const contentHtml = markdownToSafeHtml(contentMarkdown);
  const title = String(raw.title || '').trim().slice(0, 140) || `Untitled Post ${index + 1}`;
  const excerpt = deriveExcerpt(raw.excerpt, contentMarkdown);
  const slug = makeUniqueSlug(raw.slug || title || `post-${index + 1}`, existingSlugs);

  const publishedAt =
    status === 'published'
      ? parseIsoOrFallback(raw.publishedAt || `${date}T00:00:00.000Z`, updatedAt)
      : null;
  const scheduledAt =
    status === 'scheduled'
      ? parseIsoOrFallback(raw.scheduledAt || `${date}T00:00:00.000Z`, updatedAt)
      : parseIsoOrNull(raw.scheduledAt);
  const approvedAt =
    status === 'approved' || status === 'scheduled' || status === 'published'
      ? parseIsoOrFallback(raw.approvedAt || updatedAt, updatedAt)
      : parseIsoOrNull(raw.approvedAt);
  const archivedAt =
    status === 'archived'
      ? parseIsoOrFallback(raw.archivedAt || updatedAt, updatedAt)
      : null;

  const media = normalizeMediaItems(raw.media);
  const coverImageRaw = String(raw.coverImage || '').trim();
  const coverImage = coverImageRaw ? sanitizeUrl(coverImageRaw) : firstImageUrl(media);
  const reactions = normalizeReactions(raw.reactions);
  const commentsCount = Number.isFinite(Number(raw.commentsCount))
    ? Math.max(0, Math.floor(Number(raw.commentsCount)))
    : 0;
  const reposts = Number.isFinite(Number(raw.reposts))
    ? Math.max(0, Math.floor(Number(raw.reposts)))
    : 0;

  return {
    id: String(raw.id || '').trim() || createId(),
    authorId: raw.authorId ? String(raw.authorId).trim() : null,
    lastEditedBy: raw.lastEditedBy ? String(raw.lastEditedBy).trim() : null,
    slug,
    title,
    excerpt,
    contentMarkdown,
    contentHtml,
    status,
    date,
    publishedAt,
    scheduledAt,
    approvedAt,
    createdAt,
    updatedAt,
    archivedAt,
    linkedinSourceUrl: String(raw.linkedinSourceUrl || '').trim().slice(0, 500),
    hashtags: normalizeHashtags(raw.hashtags),
    media,
    coverImage,
    reactions,
    commentsCount,
    reposts,
    visibility: String(raw.visibility || 'public').trim().toLowerCase() === 'connections'
      ? 'connections'
      : 'public',
    allowComments: raw.allowComments !== false,
    featured: Boolean(raw.featured),
  };
}

function normalizePosts(rawPosts) {
  const postsArray = Array.isArray(rawPosts) ? rawPosts : [];
  const existingSlugs = new Set();
  const nowIso = new Date().toISOString();
  const normalized = postsArray.map((post, index) =>
    normalizePost(post, index, existingSlugs, nowIso)
  );
  const changed = JSON.stringify(postsArray) !== JSON.stringify(normalized);
  return { posts: normalized, changed };
}

function comparePosts(a, b, sortField, order) {
  const direction = order === 'asc' ? 1 : -1;
  if (sortField === 'title') {
    return direction * a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  }
  if (sortField === 'date') {
    const left = new Date(`${a.date}T00:00:00.000Z`).getTime();
    const right = new Date(`${b.date}T00:00:00.000Z`).getTime();
    return direction * (left - right);
  }
  const left = a[sortField] ? new Date(a[sortField]).getTime() : 0;
  const right = b[sortField] ? new Date(b[sortField]).getTime() : 0;
  return direction * (left - right);
}

function createLoaders({ postsFile, projectsFile, pacmanSectionFile, analyticsPartialFile }) {
  const cache = {
    posts: null,
    projects: null,
    pacmanSection: null,
    analytics: null,
  };
  let postWriteChain = Promise.resolve();

  async function writePostsAtomically(posts) {
    const payload = `${JSON.stringify(posts, null, 2)}\n`;
    const tempPath = `${postsFile}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, postsFile);
  }

  async function readAndNormalizePosts() {
    const data = await fs.readFile(postsFile, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      throw new Error('Invalid posts.json content.');
    }
    return normalizePosts(parsed);
  }

  async function ensurePostsLoaded() {
    if (cache.posts) {
      return cache.posts;
    }
    const { posts, changed } = await readAndNormalizePosts();
    if (changed) {
      await writePostsAtomically(posts);
    }
    cache.posts = posts;
    return cache.posts;
  }

  function queuePostWrite(task) {
    const run = postWriteChain.then(task, task);
    postWriteChain = run.catch(() => {});
    return run;
  }

  async function loadPosts(options = {}) {
    const posts = (await ensurePostsLoaded()).map(toRuntimePost);
    const includeUnpublished = Boolean(options.includeUnpublished);
    const includeArchived = Boolean(options.includeArchived);
    const status = String(options.status || 'all').toLowerCase();
    const q = String(options.q || '').trim().toLowerCase();
    const sortField = POST_SORT_FIELDS.has(options.sort) ? options.sort : 'publishedAt';
    const order = options.order === 'asc' ? 'asc' : 'desc';

    let filtered = posts;
    if (status !== 'all' && POST_STATUSES.has(status)) {
      filtered = filtered.filter(post => post.status === status);
    } else {
      if (!includeUnpublished) {
        filtered = filtered.filter(post => post.status === 'published');
      }
      if (!includeArchived) {
        filtered = filtered.filter(post => post.status !== 'archived');
      }
    }

    if (q) {
      filtered = filtered.filter(post => {
        const searchable = `${post.title} ${post.excerpt} ${post.slug}`.toLowerCase();
        return searchable.includes(q);
      });
    }

    return filtered.sort((a, b) => comparePosts(a, b, sortField, order));
  }

  async function updatePosts(mutator) {
    return queuePostWrite(async () => {
      const { posts } = await readAndNormalizePosts();
      const working = posts.map(post => ({ ...post }));
      const mutationOutput = await mutator(working);

      let nextPosts = working;
      let result;
      if (Array.isArray(mutationOutput)) {
        nextPosts = mutationOutput;
      } else if (
        mutationOutput &&
        typeof mutationOutput === 'object' &&
        Array.isArray(mutationOutput.posts)
      ) {
        nextPosts = mutationOutput.posts;
        result = mutationOutput.result;
      } else if (
        mutationOutput &&
        typeof mutationOutput === 'object' &&
        Object.prototype.hasOwnProperty.call(mutationOutput, 'result')
      ) {
        result = mutationOutput.result;
      } else if (mutationOutput !== undefined) {
        result = mutationOutput;
      }

      const normalized = normalizePosts(nextPosts).posts;
      await writePostsAtomically(normalized);
      cache.posts = normalized;
      return {
        posts: normalized.map(toRuntimePost),
        result,
      };
    });
  }

  async function loadProjects() {
    if (!cache.projects) {
      const data = await fs.readFile(projectsFile, 'utf8');
      cache.projects = JSON.parse(data).map((project, index) => {
        const safeLink = sanitizeUrl(project.link);
        const safeImage = sanitizeUrl(project.image || '/public/images/placeholder.png');
        return {
          highlights: [],
          content: '',
          technologies: [],
          metrics: [],
          architecture: [],
          impactHeadline: '',
          ownership: '',
          ...project,
          slug: project.slug || slugify(project.title || `project-${index + 1}`),
          link: safeLink === '#' ? '' : safeLink,
          image: safeImage === '#' ? '/public/images/placeholder.png' : safeImage,
          content: sanitizeRichHtml(project.content || ''),
        };
      });
    }
    return cache.projects;
  }

  async function loadPacmanSection() {
    if (!cache.pacmanSection) {
      cache.pacmanSection = await fs.readFile(pacmanSectionFile, 'utf8');
    }
    return cache.pacmanSection;
  }

  async function loadAnalytics() {
    if (!cache.analytics) {
      cache.analytics = await fs.readFile(analyticsPartialFile, 'utf8');
    }
    return cache.analytics;
  }

  function invalidatePostsCache() {
    cache.posts = null;
  }

  function invalidateAllCaches() {
    cache.posts = null;
    cache.analytics = null;
    cache.projects = null;
    cache.pacmanSection = null;
  }

  return {
    loadPosts,
    loadProjects,
    loadPacmanSection,
    loadAnalytics,
    updatePosts,
    invalidatePostsCache,
    invalidateAllCaches,
    markdownToSafeHtml,
    htmlToBasicMarkdown,
    escapeHtml,
    sanitizeUrl,
    sanitizeRichHtml,
    POST_STATUSES,
  };
}

module.exports = {
  slugify,
  estimateReadingTime,
  markdownToSafeHtml,
  htmlToBasicMarkdown,
  sanitizeUrl,
  sanitizeRichHtml,
  createLoaders,
  POST_STATUSES,
  POST_SORT_FIELDS,
};
