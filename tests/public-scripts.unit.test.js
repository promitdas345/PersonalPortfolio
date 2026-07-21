const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

test('every public/*.js file parses without a syntax error', () => {
  const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.js'));
  assert.ok(files.length > 0, 'expected at least one JS file in public/');

  for (const file of files) {
    const source = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: file }),
      (err) => {
        throw new Error(`${file} has a syntax error: ${err.message}`);
      }
    );
  }
});
