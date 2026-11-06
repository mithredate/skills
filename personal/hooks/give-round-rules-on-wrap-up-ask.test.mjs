import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./give-round-rules-on-wrap-up-ask.mjs', import.meta.url).pathname;

function hookOutput(input) {
    const { status, stdout } = spawnSync('node', [HOOK], { input });
    assert.equal(status, 0);
    return stdout.toString();
}

test('a wrap-up with a question gets the digest and round rules', () => {
    const output = JSON.parse(hookOutput(JSON.stringify({
        tool_name: 'mcp__ccd_turn__wrap_up',
        tool_input: { recap: 'The map is closed.', ask: 'Publish the assessment in Confluence AA?' },
    })));

    assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(output.hookSpecificOutput.additionalContext, /line 1 says why this session exists/);
    assert.match(output.hookSpecificOutput.additionalContext, /each option with its gain and its cost/);
});

test('a wrap-up with only a recap gets nothing', () => {
    const output = hookOutput(JSON.stringify({
        tool_name: 'mcp__ccd_turn__wrap_up',
        tool_input: { recap: 'The map is closed.' },
    }));

    assert.equal(output, '');
});

test('a wrap-up with a blank question gets nothing', () => {
    const output = hookOutput(JSON.stringify({
        tool_name: 'mcp__ccd_turn__wrap_up',
        tool_input: { recap: 'The map is closed.', ask: '  ' },
    }));

    assert.equal(output, '');
});

test('input that is not JSON does not fail the tool call', () => {
    assert.equal(hookOutput('not json'), '');
});
