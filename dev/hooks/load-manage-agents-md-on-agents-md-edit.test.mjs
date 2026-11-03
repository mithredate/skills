import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./load-manage-agents-md-on-agents-md-edit.mjs', import.meta.url).pathname;
const LOAD_MANAGE_AGENTS_MD = 'An agent instruction file changed. If `dev:manage-agents-md` is not loaded, call the Skill tool with it before your next tool call. Then check each changed file against it.';

function hookOutput(input) {
    const { status, stdout } = spawnSync('node', [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input) });
    assert.equal(status, 0);
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput : { additionalContext: '' };
}

function editOutput(toolName, toolInput, extra = {}) {
    return hookOutput({ hook_event_name: 'PostToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 'toolu_file', cwd: '/repo', ...extra });
}

test('reminds after an Edit of an AGENTS.md', () => {
    const expected = { hookEventName: 'PostToolUse', additionalContext: LOAD_MANAGE_AGENTS_MD };

    const output = editOutput('Edit', { file_path: '/repo/AGENTS.md', old_string: 'a', new_string: 'b' });

    assert.deepEqual(output, expected);
});
