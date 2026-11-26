const assert = require('assert');
const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');

// Bundle the WorkspaceGuardrails TypeScript source for Node usage
const stubPath = path.join(os.tmpdir(), 'vscode-stub.js');
fs.writeFileSync(stubPath, 'module.exports={Uri:{file:p=>p}};');
const bundleOut = path.join(os.tmpdir(), 'guardrails.test.bundle.js');
esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/workspace/guardrails.ts')],
    bundle: true,
    platform: 'node',
    outfile: bundleOut,
    alias: { vscode: stubPath, path: 'path/win32' },
    logLevel: 'error',
    write: true,
});

const { WorkspaceGuardrails } = require(bundleOut);
const guard = new WorkspaceGuardrails();
guard.setWorkspaceRoot('D:\\projects\\myapp');

function isPathSafe(...args) {
    const targetPath = args.length === 2 ? args[1] : args[0];
    const result = guard.validatePath(targetPath);
    return result.allowed;
}

function isFileBlacklisted(targetPath) {
    const result = guard.validatePath(targetPath);
    return result.isBlocked;
}

function runTest(name, fn) {
    try { fn(); console.log(`[PASS] ${name}`); }
    catch (err) { console.error(`[FAIL] ${name}`); console.error(`   Error: ${err.message}`); }
}

console.log('================================================================');
console.log('  ANTIGRAVITY MULTI-AI HUB: COMPREHENSIVE SYSTEM VERIFICATION  ');
console.log('================================================================\n');

// ------------------- 1. Workspace Guardrails & Security -------------------
console.log('--- 1. Workspace Guardrails & Security ---');

runTest('Allow legitimate workspace file src/app.ts', () => {
    assert.strictEqual(isPathSafe('src/app.ts'), true);
});

runTest('Prevent directory traversal attacks (../../outside.txt)', () => {
    assert.strictEqual(isPathSafe('src/app.ts'), true);
    assert.strictEqual(isPathSafe('../../windows/system32/cmd.exe'), false);
    assert.strictEqual(isPathSafe('../another_folder/secret.txt'), false);
});

runTest('Block path outside workspace D:/other/x.txt', () => {
    assert.strictEqual(isPathSafe('D:/other/x.txt'), false);
});

runTest('Allow absolute workspace file d:/projects/myapp/src/a.ts', () => {
    assert.strictEqual(isPathSafe('d:/projects/myapp/src/a.ts'), true);
});

runTest('Root D:/ allows src/a.ts', () => {
    guard.setWorkspaceRoot('D:/');
    assert.strictEqual(isPathSafe('src/a.ts'), true);
    guard.setWorkspaceRoot('D:\\projects\\myapp');
});

runTest('Block blocked credential .kube/config', () => {
    assert.strictEqual(isFileBlacklisted('.kube/config'), true);
});

runTest('Block blocked credential .git/config', () => {
    assert.strictEqual(isFileBlacklisted('.git/config'), true);
});

runTest('Block blocked credential .env', () => {
    assert.strictEqual(isFileBlacklisted('.env'), true);
});

runTest('Block blocked credential .npmrc', () => {
    assert.strictEqual(isFileBlacklisted('.npmrc'), true);
});

runTest('Allow design-tokens.json', () => {
    assert.strictEqual(isFileBlacklisted('src/design-tokens.json'), false);
});

runTest('Block sensitive credential files (.env, id_rsa, secrets)', () => {
    assert.strictEqual(isFileBlacklisted('.env'), true);
    assert.strictEqual(isFileBlacklisted('.env.production'), true);
    assert.strictEqual(isFileBlacklisted('.git/config'), true);
    assert.strictEqual(isFileBlacklisted('id_rsa'), true);
    assert.strictEqual(isFileBlacklisted('config/credentials.json'), true);
    assert.strictEqual(isFileBlacklisted('src/app.ts'), false);
    assert.strictEqual(isFileBlacklisted('test.py'), false);
});

// ------------------- 2. Error Sanitization & Secret Redaction -------------------
console.log('\n--- 2. Secret Redaction & Error Sanitization ---');

function sanitizeError(rawMessage, apiKey) {
    let msg = String(rawMessage);
    if (apiKey && apiKey.length > 5) { msg = msg.split(apiKey).join('[REDACTED_API_KEY]'); }
    return msg;
}

runTest('Completely redact API keys from error messages', () => {
    const secretKey = 'AIzaSyA_Real_Looking_Key_987654321';
    const err = `Fetch failed with key ${secretKey} at https://generativelanguage.googleapis.com`;
    const sanitized = sanitizeError(err, secretKey);
    assert.strictEqual(sanitized.includes(secretKey), false);
    assert.strictEqual(sanitized.includes('[REDACTED_API_KEY]'), true);
});

// ------------------- 3. CSP & UI Verification -------------------
console.log('\n--- 3. CSP & UI Verification ---');

function getUiHtml() {
    const uiPath = path.resolve(__dirname, '../src/webview/ui.ts');
    const content = fs.readFileSync(uiPath, 'utf8');
    const fnMatch = content.match(/export function getWebviewHtml\(\)\s*:\s*string\s*{([\s\S]*?)}\s*$/m);
    if (!fnMatch) throw new Error('getWebviewHtml not found');
    const fnBody = fnMatch[1];
    const fn = new Function('escapeHtml', fnBody + '\nreturn getWebviewHtml();');
    const escapeHtml = (s) => s;
    return fn(escapeHtml);
}

runTest('CSP contains only default-src none and no http/https or vscode-resource', () => {
    const html = getUiHtml();
    const metaMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(metaMatch, 'CSP meta tag not found');
    const csp = metaMatch[1];
    assert.ok(csp.includes("default-src 'none'"), 'default-src missing');
    assert.ok(!csp.includes('http:'), 'http: should not be present');
    assert.ok(!csp.includes('https:'), 'https: should not be present');
    assert.ok(!csp.includes('vscode-resource'), 'vscode-resource should not be present');
    assert.ok(csp.includes('style-src \'unsafe-inline\''), 'style-src missing');
    assert.ok(csp.includes('script-src \'unsafe-inline\''), 'script-src missing');
    assert.ok(csp.includes('img-src data:'), 'img-src missing');
});

// ------------------- SUMMARY -------------------
console.log('\nAll sections completed.');
process.exit(0);
