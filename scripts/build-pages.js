/**
 * Assembles the GitHub Pages deployment into `pages-dist/`:
 *
 *   /        the simple static portfolio from `site/`
 *   /full/   the complete generated site from `dist/`
 *
 * GitHub Pages serves a project site from a subdirectory (`/PersonalPortfolio/`),
 * but `build.js` emits root-absolute links such as `/public/styles.css`, which would
 * resolve against the domain root and 404. Every root-absolute `href`/`src` is rewritten
 * to a relative path based on how deep the page sits, so the output works from any prefix.
 *
 *   node scripts/build-pages.js
 */
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_DIR = path.join(ROOT, 'site');
const DIST_DIR = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'pages-dist');
const FULL_SUBDIR = 'full';

/** Paths that are real files rather than clean routes keep their exact spelling. */
const FILE_LIKE = /\.[a-z0-9]{2,5}(\?|$)/i;

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(source, target);
    else await fs.copyFile(source, target);
  }
}

/**
 * Rewrites one root-absolute URL to a relative one.
 * @param {string} url   the value inside href="" or src="", starting with "/"
 * @param {string} prefix  "" at the root, "../" one level down, and so on
 */
function relativize(url, prefix) {
  const [pathPart, query = ''] = url.split(/(?=[?#])/, 2);
  const trimmed = pathPart.replace(/^\/+/, '');

  if (trimmed === '') return prefix === '' ? './' : prefix;

  // A clean route such as /about maps to the directory build.js wrote it into.
  const needsSlash = !FILE_LIKE.test(trimmed) && !trimmed.endsWith('/');
  return prefix + trimmed + (needsSlash ? '/' : '') + query;
}

async function rewriteHtml(filePath, depth) {
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const original = await fs.readFile(filePath, 'utf8');

  // Only root-absolute values are touched. "//host" is protocol-relative, so it is skipped.
  const rewritten = original.replace(
    /\b(href|src)="\/(?!\/)([^"]*)"/g,
    (match, attribute, rest) => `${attribute}="${relativize('/' + rest, prefix)}"`
  );

  if (rewritten !== original) await fs.writeFile(filePath, rewritten, 'utf8');
  return rewritten !== original;
}

async function rewriteTree(dir, depth = 0) {
  let changed = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      changed += await rewriteTree(full, depth + 1);
    } else if (entry.name.endsWith('.html')) {
      if (await rewriteHtml(full, depth)) changed++;
    }
  }
  return changed;
}

async function main() {
  try {
    await fs.access(DIST_DIR);
  } catch {
    throw new Error('dist/ is missing — run `npm run build` first');
  }

  await fs.rm(OUT_DIR, { recursive: true, force: true });

  await copyDir(SITE_DIR, OUT_DIR);
  await copyDir(DIST_DIR, path.join(OUT_DIR, FULL_SUBDIR));

  // Jekyll would otherwise skip directories beginning with an underscore.
  await fs.writeFile(path.join(OUT_DIR, '.nojekyll'), '');

  // Depth counts from the full site's own root: its `/public/...` means `full/public/...`,
  // so the page at full/index.html needs no prefix at all.
  const changed = await rewriteTree(path.join(OUT_DIR, FULL_SUBDIR), 0);

  console.log(`pages-dist/ ready — portfolio at /, full site at /${FULL_SUBDIR}/`);
  console.log(`rewrote absolute links in ${changed} page(s)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
