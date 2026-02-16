const fs = require('fs/promises');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'dist');

async function fixPathsInFile(filePath, depth) {
  let content = await fs.readFile(filePath, 'utf8');
  
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  
  // Fix navigation links
  content = content.replace(/href="\/(about|contact|blog|projects|pacman)"/g, `href="${prefix}$1/"`);
  content = content.replace(/href="\/"/g, `href="${prefix}"`);
  
  // Fix blog post links
  content = content.replace(/href="\/blog\/([^"]+)"/g, `href="${prefix}blog/$1/"`);
  
  // Fix project links  
  content = content.replace(/href="\/projects\/([^"]+)"/g, `href="${prefix}projects/$1/"`);
  
  await fs.writeFile(filePath, content, 'utf8');
}

async function processDirectory(dir, depth = 0) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && entry.name !== 'public') {
      await processDirectory(fullPath, depth + 1);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      await fixPathsInFile(fullPath, depth);
    }
  }
}

async function main() {
  console.log('Fixing paths in generated HTML...');
  await processDirectory(DIST_DIR);
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
