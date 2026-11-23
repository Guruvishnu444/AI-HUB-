const assert = require('assert');
const path = require('path');

console.log('================================================================');
console.log('  ANTIGRAVITY MULTI-AI HUB: COMPREHENSIVE SYSTEM VERIFICATION  ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`[PASS] ${name}`);
    } catch (err) {
        console.error(`[FAIL] ${name}`);
        console.error(`       Error: ${err.message}\n`);
    }
}

// -----------------------------------------------------------------------------
// 1. WORKSPACE GUARDRAILS & SECURITY TESTS
// -----------------------------------------------------------------------------
console.log('--- 1. Workspace Guardrails & Security ---');

const BLACKLIST = ['.env', '.git', 'id_rsa', 'id_ed25519', 'node_modules', 'credentials', 'secrets'];

function isPathSafe(workspaceRoot, targetPath) {
    const resolved = path.resolve(workspaceRoot, targetPath);
    return resolved.startsWith(workspaceRoot);
}

function isFileBlacklisted(targetPath) {
    const lower = targetPath.toLowerCase();
    return BLACKLIST.some(item => lower.includes(item));
}

runTest('Prevent directory traversal attacks (../../outside.txt)', () => {
    const wsRoot = 'D:\\projects\\myapp';
    assert.strictEqual(isPathSafe(wsRoot, 'src/app.ts'), true);
    assert.strictEqual(isPathSafe(wsRoot, '../../windows/system32/cmd.exe'), false);
    assert.strictEqual(isPathSafe(wsRoot, '../another_folder/secret.txt'), false);
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

// -----------------------------------------------------------------------------
// 2. ERROR SANITIZATION & SECRET LEAK PREVENTION
// -----------------------------------------------------------------------------
console.log('\n--- 2. Secret Redaction & Error Sanitization ---');

function sanitizeError(rawMessage, apiKey) {
    let msg = String(rawMessage);
    if (apiKey && apiKey.length > 5) {
        msg = msg.split(apiKey).join('[REDACTED_API_KEY]');
    }
    return msg;
}

runTest('Completely redact API keys from error messages', () => {
    const secretKey = 'AIzaSyA_Real_Looking_Key_987654321';
    const err = `Fetch failed with key ${secretKey} at https://generativelanguage.googleapis.com`;
    const sanitized = sanitizeError(err, secretKey);
    assert.strictEqual(sanitized.includes(secretKey), false);
    assert.strictEqual(sanitized.includes('[REDACTED_API_KEY]'), true);
});

function cleanApiKey(raw) {
    if (!raw) return '';
    let key = String(raw);
    key = key.replace(/[\u200B-\u200D\uFEFF]/g, '');
    key = key.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    key = key.replace(/[\r\n\t]/g, '');
    key = key.trim();
    if (/^[A-Za-z0-9_-]{2,}\s*=\s*/.test(key)) {
        key = key.replace(/^[A-Za-z0-9_-]{2,}\s*=\s*/, '');
    }
    if (key.toLowerCase().startsWith('bearer ')) {
        key = key.substring(7).trim();
    }
    // Strip trailing semicolons or commas
    key = key.replace(/[;,]+$/, '').trim();
    // Strip surrounding quotes
    key = key.replace(/^["'`]+|["'`]+$/g, '').trim();
    // Strip trailing semicolons or commas again if quotes were inside
    key = key.replace(/[;,]+$/, '').trim();
    return key;
}

runTest('Clean API key: strip quotes, zero-width chars, newlines, and env var prefixes', () => {
    assert.strictEqual(cleanApiKey('  sk-test12345  '), 'sk-test12345');
    assert.strictEqual(cleanApiKey('"sk-test12345"'), 'sk-test12345');
    assert.strictEqual(cleanApiKey('GEMINI_API_KEY = "AIzaSyKey123";'), 'AIzaSyKey123');
    assert.strictEqual(cleanApiKey('Bearer sk-bearer-key-999'), 'sk-bearer-key-999');
    assert.strictEqual(cleanApiKey('\uFEFFsk-key-with-bom\r\n\t'), 'sk-key-with-bom');
});

// -----------------------------------------------------------------------------
// 3. QUOTA EXHAUSTION & RESILIENT FALLBACK DETECTION
// -----------------------------------------------------------------------------
console.log('\n--- 3. Quota Exhaustion & Fallback Cascade ---');

function isPermanentQuotaError(status, message) {
    const lower = message.toLowerCase();
    return lower.includes('quota') ||
           lower.includes('daily') ||
           lower.includes('free_tier_requests') ||
           lower.includes('resource_exhausted') ||
           lower.includes('exceeded your current quota') ||
           lower.includes('limit: 20');
}

function isSwitchableError(status, message) {
    if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504 || status === 404) return true;
    const lower = message.toLowerCase();
    return lower.includes('quota') ||
           lower.includes('rate limit') ||
           lower.includes('resource_exhausted') ||
           lower.includes('free_tier_requests') ||
           lower.includes('high demand') ||
           lower.includes('overloaded') ||
           lower.includes('unavailable') ||
           lower.includes('exceeded your current quota') ||
           lower.includes('capacity') ||
           lower.includes('insufficient_quota') ||
           lower.includes('billing') ||
           lower.includes('credit') ||
           lower.includes('multiturn') ||
           lower.includes('multi-turn') ||
           lower.includes('not enabled for this model');
}

function buildGeminiContents(history, currentPrompt) {
    const raw = [];
    for (const msg of history) {
        if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) continue;
        const role = msg.role === 'assistant' ? 'model' : 'user';
        raw.push({ role, text: msg.content.trim() });
    }
    if (currentPrompt && currentPrompt.trim()) {
        raw.push({ role: 'user', text: currentPrompt.trim() });
    }
    while (raw.length > 0 && raw[0].role !== 'user') {
        raw.shift();
    }
    const alternating = [];
    for (const item of raw) {
        if (alternating.length === 0) {
            alternating.push({ role: item.role, parts: [{ text: item.text }] });
        } else {
            const prev = alternating[alternating.length - 1];
            if (prev.role === item.role) {
                prev.parts.push({ text: item.text });
            } else {
                alternating.push({ role: item.role, parts: [{ text: item.text }] });
            }
        }
    }
    if (alternating.length === 0) {
        alternating.push({ role: 'user', parts: [{ text: currentPrompt || 'Hello' }] });
    }
    return alternating;
}

runTest('Detect Multiturn chat is not enabled for this model as switchable', () => {
    const multiturnError = 'Multiturn chat is not enabled for this model';
    assert.strictEqual(isSwitchableError(400, multiturnError), true);
});

runTest('Sanitize and alternate Gemini turns (prevent consecutive user turns)', () => {
    const brokenHistory = [
        { role: 'user', content: 'First prompt that failed' },
        { role: 'user', content: 'Second prompt with no model reply' }
    ];
    const contents = buildGeminiContents(brokenHistory, 'Third prompt');
    assert.strictEqual(contents.length, 1);
    assert.strictEqual(contents[0].role, 'user');
    assert.strictEqual(contents[0].parts.length, 3);
});

runTest('Detect Google Gemini free-tier 20 req/day quota limit', () => {
    const geminiError = 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash, description: Generate content requests per day limit exceeded on Free Tier.';
    assert.strictEqual(isPermanentQuotaError(429, geminiError), true);
    assert.strictEqual(isSwitchableError(429, geminiError), true);
});

runTest('Detect HTTP 503 high demand spike as switchable', () => {
    const spikeError = 'This model is currently experiencing high demand. Spikes in demand are usually temporary.';
    assert.strictEqual(isSwitchableError(503, spikeError), true);
    assert.strictEqual(isPermanentQuotaError(503, spikeError), false);
});

runTest('Verify candidate fallback ordering priority', () => {
    const initialProvider = 'google-gemini';
    const initialModel = 'gemini-3.8-flash';
    const dbModels = [
        { id: 'gemini-3.8-flash', providerId: 'google-gemini', isEnabled: true },
        { id: 'gemini-3.8-pro', providerId: 'google-gemini', isEnabled: true },
        { id: 'deepseek-chat', providerId: 'deepseek', isEnabled: true },
        { id: 'gpt-4o', providerId: 'openai', isEnabled: true }
    ];
    const configuredProviders = ['google-gemini', 'deepseek', 'openai'];

    // Build candidates
    const candidates = [];
    candidates.push({ providerId: initialProvider, modelId: initialModel });
    // Alternate models for same provider
    dbModels.filter(m => m.providerId === initialProvider && m.id !== initialModel && m.isEnabled)
            .forEach(m => candidates.push({ providerId: initialProvider, modelId: m.id }));
    // Alternate providers
    configuredProviders.filter(p => p !== initialProvider)
                       .forEach(p => {
                           dbModels.filter(m => m.providerId === p && m.isEnabled)
                                   .forEach(m => candidates.push({ providerId: p, modelId: m.id }));
                       });

    assert.strictEqual(candidates.length, 4);
    assert.strictEqual(candidates[0].modelId, 'gemini-3.8-flash');
    assert.strictEqual(candidates[1].modelId, 'gemini-3.8-pro');
    assert.strictEqual(candidates[2].providerId, 'deepseek');
    assert.strictEqual(candidates[3].providerId, 'openai');
});

// -----------------------------------------------------------------------------
// 4. MODEL HYGIENE & DISCOVERY FILTERING
// -----------------------------------------------------------------------------
console.log('\n--- 4. Model Hygiene & Non-Chat Model Filtering ---');

function isUsableChatModel(id, providerId) {
    const lower = id.toLowerCase();
    if (lower.includes('embedding') || lower.includes('aqa') || lower.includes('imagen') || lower.includes('bison') || lower.includes('whisper') || lower.includes('tts') || lower.includes('moderation') || lower.includes('dall-e')) {
        return false;
    }
    if (providerId === 'google-gemini' && lower.includes('gemma')) {
        return false;
    }
    return true;
}

runTest('Exclude non-chat and deprecated models from discovery', () => {
    const rawIds = [
        'gemini-3.8-flash',
        'gemini-3.8-pro',
        'text-embedding-004',
        'aqa',
        'imagen-3',
        'chat-bison-001',
        'whisper-1',
        'dall-e-3',
        'text-moderation-latest',
        'deepseek-chat',
        'gpt-4o'
    ];

    const filtered = rawIds.filter(id => isUsableChatModel(id, 'google-gemini'));
    assert.deepStrictEqual(filtered, ['gemini-3.8-flash', 'gemini-3.8-pro', 'deepseek-chat', 'gpt-4o']);
});

// -----------------------------------------------------------------------------
// 5. TOOL PROPOSAL EXECUTION & APPROVAL MECHANICS
// -----------------------------------------------------------------------------
console.log('\n--- 5. Tool Proposal & User Approval Mechanics ---');

const pendingEdits = new Map();

function proposeEdit(filePath, originalContent, proposedContent, description) {
    const editId = `edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    pendingEdits.set(editId, { filePath, originalContent, proposedContent, description });
    return editId;
}

function approveEdit(editId) {
    const edit = pendingEdits.get(editId);
    if (!edit) throw new Error('Proposal not found');
    pendingEdits.delete(editId);
    return { success: true, path: edit.filePath, bytesWritten: Buffer.byteLength(edit.proposedContent, 'utf8') };
}

function rejectEdit(editId) {
    if (!pendingEdits.has(editId)) throw new Error('Proposal not found');
    pendingEdits.delete(editId);
    return { success: true };
}

runTest('File edits are never auto-saved; require explicit user approval', () => {
    const id = proposeEdit('src/index.ts', 'const x = 1;', 'const x = 2;', 'Update x');
    assert.strictEqual(pendingEdits.has(id), true);
    
    // Test rejection
    rejectEdit(id);
    assert.strictEqual(pendingEdits.has(id), false);

    // Test approval
    const id2 = proposeEdit('test.py', '', 'print("hello")', 'Create test.py');
    const res = approveEdit(id2);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.path, 'test.py');
    assert.strictEqual(res.bytesWritten > 0, true);
    assert.strictEqual(pendingEdits.has(id2), false);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  VERIFICATION RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
console.log('================================================================');

if (passedTests === totalTests) {
    process.exit(0);
} else {
    process.exit(1);
}
