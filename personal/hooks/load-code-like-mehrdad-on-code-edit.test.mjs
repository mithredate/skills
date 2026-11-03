import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = fileURLToPath(new URL('./load-code-like-mehrdad-on-code-edit.mjs', import.meta.url));
const LOAD_CODE_LIKE_MEHRDAD = 'A code file changed. If `personal:code-like-mehrdad` is not loaded, call the Skill tool with it before your next tool call.';

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

test('reminds after an Edit of a code file inside a subagent', () => {
    assert.equal(editContext('Edit', { file_path: '/repo/src/app.py', old_string: 'a', new_string: 'b' }, { agent_id: 'agent-1', agent_type: 'general-purpose' }), LOAD_CODE_LIKE_MEHRDAD);
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
