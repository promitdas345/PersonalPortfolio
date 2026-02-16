const fs = require('fs/promises');
const path = require('path');
require('dotenv').config();

const { connectDatabase } = require('../lib/database');
const Post = require('../lib/models/Post');

async function migratePosts() {
  try {
    console.log('🚀 Starting migration from posts.json to MongoDB...\n');

    // Connect to MongoDB
    await connectDatabase();

    // Read existing posts.json
    const postsFile = path.join(__dirname, '../data/posts.json');
    const postsData = await fs.readFile(postsFile, 'utf8');
    const posts = JSON.parse(postsData);

    console.log(`📄 Found ${posts.length} posts in posts.json\n`);

    // Posts to exclude (the test post with "ffffff" content)
    const excludedIds = ['9e837d77-edad-4f0c-a896-7e70580555ee']; // Untitled Post 1

    const postsToMigrate = posts.filter(post => {
      if (excludedIds.includes(post.id)) {
        console.log(`⏭️  Skipping: "${post.title}" (test post)`);
        return false;
      }
      return true;
    });

    console.log(`\n✅ Migrating ${postsToMigrate.length} posts...\n`);

    // Clear existing posts in MongoDB (fresh start)
    await Post.deleteMany({});
    console.log('🗑️  Cleared existing posts from MongoDB\n');

    // Insert all posts
    let successCount = 0;
    for (const post of postsToMigrate) {
      try {
        await Post.create(post);
        console.log(`✅ Migrated: "${post.title}"`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to migrate "${post.title}":`, error.message);
      }
    }

    console.log(`\n✨ Migration complete! ${successCount}/${postsToMigrate.length} posts migrated successfully.`);
    console.log('\n📝 Next steps:');
    console.log('1. Update your .env file with MONGODB_URI');
    console.log('2. Update Render environment variables');
    console.log('3. Restart your server');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migratePosts();
