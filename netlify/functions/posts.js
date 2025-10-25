const fs = require('fs').promises;
const path = require('path');

const POSTS_FILE = path.join(__dirname, '../../data/posts.json');

function estimateReadingTime(html) {
  const stripped = html.replace(/<[^>]*>/g, ' ');
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 200));
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    const posts = JSON.parse(data).map(post => ({
      ...post,
      readingTime: estimateReadingTime(post.content),
    }));
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(posts)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to load posts' })
    };
  }
};
