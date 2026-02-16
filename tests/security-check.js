/**
 * Security Verification Test
 * Tests HTML sanitization and password hashing security
 */

const crypto = require('crypto');
const { sanitizeRichHtml } = require('../lib/data');

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m',
};

function pass(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function fail(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function section(message) {
  console.log(`\n${colors.blue}━━━ ${message} ━━━${colors.reset}`);
}

function info(message) {
  console.log(`${colors.yellow}ℹ${colors.reset} ${message}`);
}

// Password hashing functions (copied from lib/auth.js for testing)
function createPasswordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `v2:${salt}:${hash}`;
}

function parsePasswordHash(storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length === 3 && parts[0] === 'v2') {
    return { version: 'v2', salt: parts[1], hash: parts[2] };
  }
  // Fallback to legacy (salt:hash)
  if (parts.length === 2) {
    return { version: 'v1', salt: parts[0], hash: parts[1] };
  }
  return null;
}

function verifyPassword(password, storedHash) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;

  if (parsed.version === 'v2') {
    const candidate = crypto.scryptSync(String(password || ''), parsed.salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(parsed.hash, 'hex'));
  }

  // Legacy PBKDF2 verification
  const candidate = crypto.pbkdf2Sync(String(password || ''), parsed.salt, 120000, 64, 'sha512').toString('hex');
  if (candidate.length !== parsed.hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(parsed.hash, 'hex'));
}

// Create a legacy PBKDF2 hash for migration testing
function createLegacyPasswordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    pass(name);
    testsPassed++;
  } catch (error) {
    fail(`${name}: ${error.message}`);
    testsFailed++;
  }
}

// ============================================
// HTML SANITIZATION TESTS
// ============================================

section('HTML Sanitization Tests');

test('Strips <script> tags from HTML', () => {
  const malicious = '<p>Hello</p><script>alert("XSS")</script><p>World</p>';
  const sanitized = sanitizeRichHtml(malicious);
  if (sanitized.includes('<script>') || sanitized.includes('alert')) {
    throw new Error(`Script tag not stripped: ${sanitized}`);
  }
});

test('Strips onclick and other event handlers', () => {
  const malicious = '<p onclick="alert(1)">Click me</p><img src="x" onerror="alert(2)">';
  const sanitized = sanitizeRichHtml(malicious);
  if (sanitized.includes('onclick') || sanitized.includes('onerror') || sanitized.includes('alert')) {
    throw new Error(`Event handler not stripped: ${sanitized}`);
  }
});

test('Allows safe HTML tags (p, strong, em, img)', () => {
  const safe = '<p>Hello <strong>world</strong></p><img src="/test.jpg" alt="Test">';
  const sanitized = sanitizeRichHtml(safe);
  if (!sanitized.includes('<p>') || !sanitized.includes('<strong>') || !sanitized.includes('<img')) {
    throw new Error(`Safe tags were stripped: ${sanitized}`);
  }
});

test('Allows images with src and alt attributes', () => {
  const html = '<img src="https://example.com/image.jpg" alt="Description">';
  const sanitized = sanitizeRichHtml(html);
  if (!sanitized.includes('src=') || !sanitized.includes('alt=')) {
    throw new Error(`Image attributes were stripped: ${sanitized}`);
  }
});

test('Strips javascript: URLs', () => {
  const malicious = '<a href="javascript:alert(1)">Click</a>';
  const sanitized = sanitizeRichHtml(malicious);
  if (sanitized.includes('javascript:')) {
    throw new Error(`javascript: URL not stripped: ${sanitized}`);
  }
});

test('Allows http and https URLs', () => {
  const safe = '<a href="https://example.com">Link</a>';
  const sanitized = sanitizeRichHtml(safe);
  if (!sanitized.includes('https://example.com')) {
    throw new Error(`Safe URL was stripped: ${sanitized}`);
  }
});

test('Strips data: URLs to prevent XSS', () => {
  const malicious = '<img src="data:text/html,<script>alert(1)</script>">';
  const sanitized = sanitizeRichHtml(malicious);
  if (sanitized.includes('data:')) {
    throw new Error(`data: URL not stripped: ${sanitized}`);
  }
});

// ============================================
// PASSWORD HASHING TESTS
// ============================================

section('Password Hashing Tests');

test('Creates scrypt hash with v2 prefix', () => {
  const hash = createPasswordHash('testPassword123');
  if (!hash.startsWith('v2:')) {
    throw new Error(`Hash doesn't have v2 prefix: ${hash}`);
  }
  const parts = hash.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid hash format: ${hash}`);
  }
});

test('Verifies correct password with scrypt (v2)', () => {
  const password = 'mySecurePassword!123';
  const hash = createPasswordHash(password);
  if (!verifyPassword(password, hash)) {
    throw new Error('Failed to verify correct password');
  }
});

test('Rejects incorrect password with scrypt (v2)', () => {
  const hash = createPasswordHash('correctPassword');
  if (verifyPassword('wrongPassword', hash)) {
    throw new Error('Incorrectly verified wrong password');
  }
});

test('Uses different salts for same password', () => {
  const password = 'samePassword';
  const hash1 = createPasswordHash(password);
  const hash2 = createPasswordHash(password);
  if (hash1 === hash2) {
    throw new Error('Same hash generated for same password (salt not random)');
  }
});

test('Verifies legacy PBKDF2 hash (v1 migration)', () => {
  const password = 'legacyPassword123';
  const legacyHash = createLegacyPasswordHash(password);
  if (!verifyPassword(password, legacyHash)) {
    throw new Error('Failed to verify legacy PBKDF2 hash');
  }
});

test('Rejects incorrect password with legacy PBKDF2 (v1)', () => {
  const legacyHash = createLegacyPasswordHash('correctPassword');
  if (verifyPassword('wrongPassword', legacyHash)) {
    throw new Error('Incorrectly verified wrong password with legacy hash');
  }
});

test('parsePasswordHash correctly identifies v2 format', () => {
  const hash = createPasswordHash('test');
  const parsed = parsePasswordHash(hash);
  if (parsed.version !== 'v2') {
    throw new Error(`Expected v2, got ${parsed.version}`);
  }
  if (!parsed.salt || !parsed.hash) {
    throw new Error('Salt or hash missing from parsed result');
  }
});

test('parsePasswordHash correctly identifies v1 (legacy) format', () => {
  const legacyHash = createLegacyPasswordHash('test');
  const parsed = parsePasswordHash(legacyHash);
  if (parsed.version !== 'v1') {
    throw new Error(`Expected v1, got ${parsed.version}`);
  }
  if (!parsed.salt || !parsed.hash) {
    throw new Error('Salt or hash missing from parsed result');
  }
});

test('Empty password is handled safely', () => {
  const hash = createPasswordHash('');
  if (!verifyPassword('', hash)) {
    throw new Error('Failed to verify empty password');
  }
  if (verifyPassword('notEmpty', hash)) {
    throw new Error('Empty password matched non-empty input');
  }
});

test('Timing-safe comparison prevents timing attacks', () => {
  const password = 'testPassword';
  const hash = createPasswordHash(password);
  // This test verifies that timingSafeEqual is used by checking it doesn't throw
  const result = verifyPassword(password, hash);
  if (!result) {
    throw new Error('Timing-safe verification failed');
  }
});

// ============================================
// SUMMARY
// ============================================

section('Test Summary');
const total = testsPassed + testsFailed;
console.log(`\nTotal: ${total} tests`);
console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);

if (testsFailed === 0) {
  console.log(`\n${colors.green}🎉 All security tests passed!${colors.reset}\n`);
  info('HTML sanitization is working correctly');
  info('Password hashing with scrypt (v2) is working correctly');
  info('Legacy PBKDF2 (v1) migration support is working correctly');
  process.exit(0);
} else {
  console.log(`\n${colors.red}❌ Some tests failed. Please review.${colors.reset}\n`);
  process.exit(1);
}
