const { connectDatabase } = require('./database');
const Post = require('./models/Post');

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

async function loadPosts(options = {}) {
  await connectDatabase();

  const includeUnpublished = Boolean(options.includeUnpublished);
  const includeArchived = Boolean(options.includeArchived);
  const status = String(options.status || 'all').toLowerCase();
  const q = String(options.q || '').trim().toLowerCase();
  const sortField = POST_SORT_FIELDS.has(options.sort) ? options.sort : 'publishedAt';
  const order = options.order === 'asc' ? 1 : -1;

  // Build MongoDB query
  const query = {};

  if (status !== 'all' && POST_STATUSES.has(status)) {
    query.status = status;
  } else {
    const statusConditions = [];
    if (!includeUnpublished) {
      statusConditions.push({ status: 'published' });
    }
    if (!includeArchived) {
      if (statusConditions.length > 0) {
        query.status = 'published';
      } else {
        query.status = { $ne: 'archived' };
      }
    }
  }

  // Text search
  if (q) {
    query.$or = [
      { title: { $regex: q, $options: 'i' } },
      { excerpt: { $regex: q, $options: 'i' } },
      { slug: { $regex: q, $options: 'i' } }
    ];
  }

  const posts = await Post.find(query)
    .sort({ [sortField]: order })
    .lean();

  return posts.map(post => ({
    ...post,
    _id: undefined, // Remove MongoDB _id field
  }));
}

async function updatePosts(mutator) {
  await connectDatabase();

  // Load all posts
  const posts = await Post.find({}).lean();
  const working = posts.map(post => ({
    ...post,
    _id: undefined,
  }));

  // Run the mutator function
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

  // Sync changes to MongoDB
  // This is a simple approach: delete all and re-insert
  // For production, you'd want to diff and update only changed posts
  const existingIds = posts.map(p => p.id);
  const nextIds = new Set(nextPosts.map(p => p.id));

  // Delete removed posts
  const removedIds = existingIds.filter(id => !nextIds.has(id));
  if (removedIds.length > 0) {
    await Post.deleteMany({ id: { $in: removedIds } });
  }

  // Update or insert posts
  for (const post of nextPosts) {
    await Post.updateOne(
      { id: post.id },
      { $set: post },
      { upsert: true }
    );
  }

  return {
    posts: nextPosts,
    result,
  };
}

module.exports = {
  loadPosts,
  updatePosts,
  POST_SORT_FIELDS,
  POST_STATUSES,
};
