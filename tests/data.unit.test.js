const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeUrl, sanitizeRichHtml } = require('../lib/data');

test('sanitizeUrl blocks unsafe schemes and keeps safe URLs', () => {
  assert.equal(sanitizeUrl('javascript:alert(1)'), '#');
  assert.equal(sanitizeUrl('data:text/html;base64,abc'), '#');
  assert.equal(sanitizeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(sanitizeUrl('/relative/path'), '/relative/path');
  assert.equal(sanitizeUrl('mailto:test@example.com'), 'mailto:test@example.com');
});

test('sanitizeRichHtml removes scripts, inline handlers, and javascript URLs', () => {
  const output = sanitizeRichHtml(
    `<p onclick="alert(1)">Hello</p><script>alert(2)</script><a href="javascript:alert(3)">Click</a>`
  );
  assert.equal(output.includes('<script'), false);
  assert.equal(/on[a-z]+\s*=/.test(output), false);
  assert.equal(output.includes('javascript:'), false);
});
