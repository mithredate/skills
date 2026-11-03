import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = fileURLToPath(new URL('./load-code-like-mehrdad-on-code-edit.mjs', import.meta.url));
const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOAD_CODE_LIKE_MEHRDAD = 'A code file changed. If `personal:code-like-mehrdad` is not loaded, call the Skill tool with it before your next tool call.';
const READ_TESTING = `If you have not read the testing rubric in this session, read \`${join(PLUGIN_ROOT, 'skills/code-like-mehrdad/references/testing.md')}\`.`;
const READ_TYPESCRIPT = `If you have not read the TypeScript rubric in this session, read \`${join(PLUGIN_ROOT, 'skills/code-like-mehrdad/references/typescript.md')}\`.`;
const RUBRIC_PATH = /`(\/[^`]+\.md)`/g;

function hookOutput(input) {
    const { status, stdout } = spawnSync('node', [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input) });
    assert.equal(status, 0);
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput : { additionalContext: '' };
}

function editContext(toolName, toolInput, extra = {}) {
    return hookOutput({ hook_event_name: 'PostToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 'toolu_file', cwd: '/repo', ...extra }).additionalContext;
}

test('reminds to load code-like-mehrdad after an Edit of a code file', () => {
    assert.deepEqual(hookOutput({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: '/repo/src/app.py', old_string: 'a', new_string: 'b' } }), { hookEventName: 'PostToolUse', additionalContext: LOAD_CODE_LIKE_MEHRDAD });
});

test('reminds after an Edit of a file with each source-code extension that is not TypeScript', () => {
    for (const ext of ['js', 'jsx', 'mjs', 'cjs', 'vue', 'py', 'go', 'java', 'kt', 'kts', 'php', 'rb', 'rs', 'swift', 'c', 'h', 'cpp', 'cs', 'sh']) {
        assert.equal(editContext('Edit', { file_path: `/repo/src/app.${ext}`, old_string: 'a', new_string: 'b' }), LOAD_CODE_LIKE_MEHRDAD, ext);
    }
});

test('reminds after a MultiEdit of a code file', () => {
    assert.equal(editContext('MultiEdit', { file_path: '/repo/src/app.go', edits: [{ old_string: 'a', new_string: 'b' }] }), LOAD_CODE_LIKE_MEHRDAD);
});

test('names only the matching rubric after an Edit of a code file inside an agent', () => {
    const inAgent = { agent_id: 'agent-1', agent_type: 'general-purpose' };

    assert.equal(editContext('Edit', { file_path: '/repo/src/app.test.js', old_string: 'a', new_string: 'b' }, inAgent), READ_TESTING);
    assert.equal(editContext('Write', { file_path: '/repo/src/app.test.ts', content: 'test()\n' }, inAgent), `${READ_TESTING} ${READ_TYPESCRIPT}`);
});

test('stays silent inside an agent after an Edit of a code file with no rubric', () => {
    const edit = { file_path: '/repo/src/app.py', old_string: 'a', new_string: 'b' };

    assert.equal(editContext('Edit', edit, { agent_id: 'agent-1', agent_type: 'claude' }), '');
    assert.equal(editContext('Edit', edit), LOAD_CODE_LIKE_MEHRDAD);
});

test('also names the testing rubric after an Edit of a test file', () => {
    for (const path of ['/repo/tests/test_app.py', '/repo/src/app.test.js']) {
        assert.equal(editContext('Edit', { file_path: path, old_string: 'a', new_string: 'b' }), `${LOAD_CODE_LIKE_MEHRDAD} ${READ_TESTING}`, path);
    }
});

test('names the testing rubric for each test name and each test folder', () => {
    for (const path of ['/repo/src/app.spec.js', '/repo/pkg/app_test.go', '/repo/test_app.py', '/repo/src/AppTest.java', '/repo/Sources/AppTests.swift', '/repo/src/__tests__/app.jsx', '/repo/spec/app_spec.rb', '/repo/test/helper.sh', '/repo/tests/fixtures/users.py']) {
        assert.equal(editContext('Edit', { file_path: path, old_string: 'a', new_string: 'b' }), `${LOAD_CODE_LIKE_MEHRDAD} ${READ_TESTING}`, path);
    }
});

test('does not name the testing rubric for a code file whose name only looks like a test name', () => {
    for (const path of ['/repo/src/latest.js', '/repo/src/contest.py', '/repo/src/test_app.go', '/repo/src/testing/app.py', '/repo/src/specs.rb']) {
        assert.equal(editContext('Edit', { file_path: path, old_string: 'a', new_string: 'b' }), LOAD_CODE_LIKE_MEHRDAD, path);
    }
});

test('also names the TypeScript rubric after an Edit of a TypeScript file', () => {
    assert.equal(editContext('Edit', { file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' }), `${LOAD_CODE_LIKE_MEHRDAD} ${READ_TYPESCRIPT}`);
});

test('names the TypeScript rubric for each TypeScript extension', () => {
    for (const ext of ['ts', 'tsx', 'mts', 'cts']) {
        assert.equal(editContext('Edit', { file_path: `/repo/src/app.${ext}`, old_string: 'a', new_string: 'b' }), `${LOAD_CODE_LIKE_MEHRDAD} ${READ_TYPESCRIPT}`, ext);
    }
});

test('names both rubrics after a Write of a TypeScript test file', () => {
    assert.equal(editContext('Write', { file_path: '/repo/src/app.test.ts', content: 'test()\n' }), `${LOAD_CODE_LIKE_MEHRDAD} ${READ_TESTING} ${READ_TYPESCRIPT}`);
});

test('each rubric path in the message exists on disk', () => {
    const paths = [...editContext('Edit', { file_path: '/repo/src/app.test.ts', old_string: 'a', new_string: 'b' }).matchAll(RUBRIC_PATH)].map((match) => match[1]);

    assert.equal(paths.length, 2);
    for (const path of paths) assert.ok(existsSync(path), path);
});

test('stays silent after an Edit of a file that is not code', () => {
    for (const path of ['/repo/README.md', '/repo/package.json', '/repo/config.yaml', '/repo/pyproject.toml', '/repo/notes.txt', '/repo/yarn.lock', '/repo/Makefile', '/repo/tests/README.md', '/repo/tests/fixtures/data.json', '/repo/app.py/README']) {
        assert.equal(editContext('Edit', { file_path: path, old_string: 'a', new_string: 'b' }), '', path);
    }
});

test('stays silent and exits 0 for input it cannot read', () => {
    for (const input of ['not json', '', 'null', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: {} }), JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 42 } })]) {
        assert.equal(hookOutput(input).additionalContext, '', input);
    }
});

test('hooks.json starts the hook after an Edit, Write, or MultiEdit only', () => {
    const { hooks } = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));
    const runsHook = (entry) => entry.hooks.some((handler) => handler.type === 'command' && handler.command === 'node "${CLAUDE_PLUGIN_ROOT}/hooks/load-code-like-mehrdad-on-code-edit.mjs"');

    assert.deepEqual(Object.entries(hooks).flatMap(([event, entries]) => entries.filter(runsHook).map((entry) => [event, entry.matcher])), [['PostToolUse', 'Edit|Write|MultiEdit']]);
});
