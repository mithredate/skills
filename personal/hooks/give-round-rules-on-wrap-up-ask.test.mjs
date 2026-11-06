import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = fileURLToPath(new URL('./give-round-rules-on-wrap-up-ask.mjs', import.meta.url));
const ROUND_RULES = 'You put a question in the next-step box. The box shows only the question. Before you write your closing message, apply the rule **Report to Mehrdad.** of `personal:work-like-mehrdad` and the section "The round" of `productivity:settle-decisions`. Do not ask the question again in the message. Give its context: the facts, each option with its gain and its cost, and your recommendation.';

function hookOutput(input) {
    const { status, stdout } = spawnSync('node', [HOOK], { input });
    assert.equal(status, 0);
    return stdout.toString();
}

function wrapUp(toolInput) {
    return JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'mcp__ccd_turn__wrap_up', tool_input: toolInput });
}

test('a wrap-up with a question gets the round rules', () => {
    const output = JSON.parse(hookOutput(wrapUp({ recap: 'The map is closed.', ask: 'Publish the assessment in Confluence AA?' })));

    assert.deepEqual(output, { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: ROUND_RULES } });
});

test('a wrap-up with no question gets nothing', () => {
    for (const toolInput of [{ recap: 'The map is closed.' }, { recap: 'The map is closed.', ask: '  ' }, { recap: 'The map is closed.', ask: null }, { recap: 'The map is closed.', ask: 42 }]) {
        assert.equal(hookOutput(wrapUp(toolInput)), '', JSON.stringify(toolInput));
    }
});

test('stays silent and exits 0 for input it cannot read', () => {
    for (const input of ['not json', '', 'null', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'mcp__ccd_turn__wrap_up' })]) {
        assert.equal(hookOutput(input), '', input);
    }
});

test('the rules that the hook names still exist in their skills', () => {
    const workLikeMehrdad = readFileSync(new URL('../skills/work-like-mehrdad/SKILL.md', import.meta.url), 'utf8');
    const settleDecisions = readFileSync(new URL('../../productivity/skills/settle-decisions/SKILL.md', import.meta.url), 'utf8');

    assert.match(workLikeMehrdad, /^- \*\*Report to Mehrdad\.\*\* /m);
    assert.match(settleDecisions, /^## The round$/m);
});

test('hooks.json starts the hook after a wrap_up call only', () => {
    const { hooks } = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));
    const runsHook = (entry) => entry.hooks.some((handler) => handler.type === 'command' && handler.command === 'node "${CLAUDE_PLUGIN_ROOT}/hooks/give-round-rules-on-wrap-up-ask.mjs"');

    assert.deepEqual(Object.entries(hooks).flatMap(([event, entries]) => entries.filter(runsHook).map((entry) => [event, entry.matcher])), [['PostToolUse', 'mcp__ccd_turn__wrap_up']]);
});
