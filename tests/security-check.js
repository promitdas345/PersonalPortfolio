const assert = require('assert');
// Use path.join to avoid any ambiguity, though require('./lib/data') should work
const path = require('path');
const { createLoaders } = require(path.join(__dirname, 'lib/data'));
const { createAuthSystem } = require(path.join(__dirname, 'lib/auth'));
const crypto = require('crypto');

console.log('Running Security Verification Tests...');

const fs = require('fs');

function log(msg) {
    fs.appendFileSync('test_results.log', msg + '\n');
    console.log(msg); // Keep console for backup
}

try {
    // Clear previous log
    fs.writeFileSync('test_results.log', '');

    // 1. Verify HTML Sanitization
    const loaders = createLoaders({
        postsFile: 'mock',
        projectsFile: 'mock',
        pacmanSectionFile: 'mock',
        analyticsPartialFile: 'mock'
    });

    const unsafeHtml = '<script>alert(1)</script><b>Bold</b><img src="x" onerror="alert(1)">';
    const sanitized = loaders.sanitizeRichHtml(unsafeHtml);

    log('--- Sanitization Output ---');
    log(sanitized);
    log('---------------------------');

    if (sanitized.includes('<script>')) log('FAIL: Script tag present');
    else log('PASS: Script tag removed');

    if (sanitized.includes('onerror=')) log('FAIL: onerror attribute present');
    else log('PASS: onerror attribute removed');

    if (!sanitized.includes('<b>Bold</b>')) log('FAIL: Bold tag missing');
    else log('PASS: Bold tag preserved');

    log('Refined HTML Sanitization Verified (Manual Check)');

    // 2. Verify Password Hashing (Scrypt)
    const auth = createAuthSystem({
        adminAuthFile: 'mock',
        adminStoreFile: 'mock'
    });

    // Test V2 Verification (Manually create hash since access is private)
    const password = 'testpassword';
    const salt = crypto.randomBytes(16).toString('hex');
    const hashContent = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashV2 = `v2:${salt}:${hashContent}`;

    log(`Generated Manual Hash: ${hashV2}`);

    const valid = auth.verifyPassword(password, hashV2);
    if (valid) log('PASS: V2 verification successful');
    else log('FAIL: V2 verification failed');

    const invalid = auth.verifyPassword('wrong', hashV2);
    if (!invalid) log('PASS: Invalid password rejected');
    else log('FAIL: Invalid password accepted');

    log('Refined Scrypt Hashing Verified (Manual Check)');

    // 3. Verify Legacy (PBKDF2) Verification
    const legacySalt = crypto.randomBytes(16).toString('hex');
    const legacyHashContent = crypto.pbkdf2Sync(password, legacySalt, 120000, 64, 'sha512').toString('hex');
    const legacyHash = `${legacySalt}:${legacyHashContent}`;

    const legacyValid = auth.verifyPassword(password, legacyHash);
    if (legacyValid) log('PASS: Legacy verification successful');
    else log('FAIL: Legacy verification failed');

    log('🎉 Verification Complete');

} catch (err) {
    log('❌ Test Script Error: ' + err.stack);
}
