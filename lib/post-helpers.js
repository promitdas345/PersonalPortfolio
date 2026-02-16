const { createId, trim, parseIso, isIsoDate } = require('./http');
const { hasCapability } = require('./admin-store');
const { POST_STATUSES } = require('./data');

const ADMIN_STATUSES = new Set(['all', ...POST_STATUSES]);
const WORKFLOW_TRANSITIONS = {
  draft: new Set(['draft', 'in_review', 'approved', 'scheduled', 'published', 'archived']),
  in_review: new Set(['draft', 'in_review', 'approved', 'archived']),
  approved: new Set(['draft', 'approved', 'scheduled', 'published', 'archived']),
  scheduled: new Set(['draft', 'scheduled', 'published', 'archived']),
  published: new Set(['draft', 'published', 'archived']),
  archived: new Set(['draft', 'archived']),
};

function normalizePublicUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (value.startsWith('/public/')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return '';
}

function normalizeHashtags(rawHashtags) {
  if (Array.isArray(rawHashtags)) {
    return Array.from(
      new Set(
        rawHashtags
          .map(item => String(item || '').trim().replace(/^#/, '').toLowerCase())
          .filter(Boolean)
          .map(item => item.slice(0, 40))
      )
    );
  }
  if (typeof rawHashtags === 'string') {
    return normalizeHashtags(rawHashtags.split(',').map(item => item.trim()));
  }
  return [];
}

function normalizeReactions(rawReactions) {
  const source = rawReactions && typeof rawReactions === 'object' ? rawReactions : {};
  const read = key => {
    const value = Number(source[key]);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  };
  return {
    like: read('like'),
    celebrate: read('celebrate'),
    support: read('support'),
    insightful: read('insightful'),
  };
}

function normalizeMedia(rawMedia) {
  if (!Array.isArray(rawMedia)) return [];
  return rawMedia
    .map((item, index) => ({
      id: String(item.id || '').trim() || createId(),
      assetId: item.assetId ? String(item.assetId).trim() : null,
      type: String(item.type || 'image').trim().toLowerCase() === 'video' ? 'video' : 'image',
      url: normalizePublicUrl(item.url),
      alt: trim(item.alt, 300),
      caption: trim(item.caption, 500),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    }))
    .filter(item => item.url)
    .sort((left, right) => left.order - right.order)
    .slice(0, 20)
    .map((item, index) => ({ ...item, order: index }));
}

function parsePostPayload(body, isCreate) {
  const payload = {};
  if (isCreate || Object.prototype.hasOwnProperty.call(body, 'title')) {
    payload.title = trim(body.title, 140);
    if (isCreate && !payload.title) throw new Error('Post title is required.');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'slug')) {
    payload.slugRaw = trim(body.slug, 140);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'excerpt')) payload.excerpt = trim(body.excerpt, 260);
  if (Object.prototype.hasOwnProperty.call(body, 'contentHtml')) {
    payload.contentHtml = String(body.contentHtml || '').trim();
  }
  if (isCreate || Object.prototype.hasOwnProperty.call(body, 'contentMarkdown')) {
    payload.contentMarkdown = String(body.contentMarkdown !== undefined ? body.contentMarkdown : body.content || '').trim();
    if (isCreate && !payload.contentMarkdown && !payload.contentHtml) throw new Error('Post content is required.');
  }
  if (isCreate || Object.prototype.hasOwnProperty.call(body, 'date')) {
    const date = trim(body.date || new Date().toISOString().slice(0, 10), 10);
    if (date && !isIsoDate(date)) throw new Error('Date must use YYYY-MM-DD format.');
    payload.date = date;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = String(body.status || '').trim().toLowerCase();
    if (!POST_STATUSES.has(status)) throw new Error('Invalid status value.');
    payload.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'scheduledAt')) {
    const scheduledAt = String(body.scheduledAt || '').trim();
    payload.scheduledAt = scheduledAt ? parseIso(scheduledAt) : null;
    if (scheduledAt && !payload.scheduledAt) throw new Error('scheduledAt must be a valid datetime.');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'linkedinSourceUrl')) {
    const linkedIn = trim(body.linkedinSourceUrl, 500);
    if (linkedIn && !/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(linkedIn)) {
      throw new Error('LinkedIn source URL must be a linkedin.com URL.');
    }
    payload.linkedinSourceUrl = linkedIn;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hashtags')) payload.hashtags = normalizeHashtags(body.hashtags);
  if (Object.prototype.hasOwnProperty.call(body, 'coverImage')) payload.coverImage = normalizePublicUrl(body.coverImage);
  if (Object.prototype.hasOwnProperty.call(body, 'media')) payload.media = normalizeMedia(body.media);
  if (Object.prototype.hasOwnProperty.call(body, 'reactions')) payload.reactions = normalizeReactions(body.reactions);
  if (Object.prototype.hasOwnProperty.call(body, 'commentsCount')) {
    const value = Number(body.commentsCount);
    payload.commentsCount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'reposts')) {
    const value = Number(body.reposts);
    payload.reposts = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'featured')) payload.featured = Boolean(body.featured);
  if (Object.prototype.hasOwnProperty.call(body, 'visibility')) {
    payload.visibility = String(body.visibility || '').trim().toLowerCase() === 'connections' ? 'connections' : 'public';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'allowComments')) payload.allowComments = body.allowComments !== false;
  return payload;
}

const deriveExcerpt = markdown =>
  String(markdown || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

function canEditPost(context, post) {
  if (hasCapability(context.capabilities, 'content.posts.edit.any')) return true;
  if (hasCapability(context.capabilities, 'content.posts.edit.own') && post.authorId === context.user.id) {
    return true;
  }
  return false;
}

function requiredCapabilityForStatus(status) {
  if (status === 'in_review') return 'content.posts.submit_review';
  if (status === 'approved') return 'content.posts.approve';
  if (status === 'scheduled') return 'content.posts.schedule';
  if (status === 'published') return 'content.posts.publish';
  if (status === 'archived') return 'content.posts.archive';
  return 'content.posts.edit.any';
}

function ensureTransition(fromStatus, toStatus) {
  const allowed = WORKFLOW_TRANSITIONS[fromStatus] || new Set([fromStatus]);
  if (!allowed.has(toStatus)) throw new Error(`Cannot move post from ${fromStatus} to ${toStatus}.`);
}

module.exports = {
  POST_STATUSES,
  ADMIN_STATUSES,
  WORKFLOW_TRANSITIONS,
  normalizePublicUrl,
  normalizeHashtags,
  normalizeReactions,
  normalizeMedia,
  parsePostPayload,
  deriveExcerpt,
  canEditPost,
  requiredCapabilityForStatus,
  ensureTransition,
};
