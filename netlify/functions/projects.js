const fs = require('fs').promises;
const path = require('path');

const PROJECTS_FILE = path.join(__dirname, '../../data/projects.json');

function slugify(text) {
  return text
    ? text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : 'project';
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = await fs.readFile(PROJECTS_FILE, 'utf8');
    const projects = JSON.parse(data).map((project, index) => ({
      highlights: [],
      content: '',
      ...project,
      slug: project.slug || slugify(project.title || `project-${index + 1}`),
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(projects)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to load projects' })
    };
  }
};
