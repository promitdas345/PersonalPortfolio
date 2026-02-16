const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  authorId: String,
  lastEditedBy: String,
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  excerpt: String,
  contentMarkdown: String,
  contentHtml: String,
  status: {
    type: String,
    enum: ['draft', 'in_review', 'approved', 'scheduled', 'published', 'archived'],
    default: 'draft'
  },
  date: String,
  publishedAt: Date,
  scheduledAt: Date,
  approvedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  archivedAt: Date,
  linkedinSourceUrl: String,
  hashtags: [String],
  media: [mongoose.Schema.Types.Mixed],
  coverImage: String,
  reactions: {
    like: { type: Number, default: 0 },
    celebrate: { type: Number, default: 0 },
    support: { type: Number, default: 0 },
    insightful: { type: Number, default: 0 }
  },
  commentsCount: { type: Number, default: 0 },
  reposts: { type: Number, default: 0 },
  visibility: { type: String, default: 'public' },
  allowComments: { type: Boolean, default: true },
  featured: { type: Boolean, default: false }
}, {
  timestamps: false // We manage timestamps manually for compatibility
});

// Indexes for common queries (slug already indexed via schema)
postSchema.index({ status: 1 });
postSchema.index({ publishedAt: -1 });
postSchema.index({ updatedAt: -1 });

const Post = mongoose.model('Post', postSchema);

module.exports = Post;
