import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = fileURLToPath(new URL('./give-spawn-rules-on-agent-start.mjs', import.meta.url));
const WORK_LIKE_MEHRDAD = readFileSync(new URL('../skills/work-like-mehrdad/SKILL.md', import.meta.url), 'utf8').split('\n');
const CODE_LIKE_MEHRDAD = readFileSync(new URL('../skills/code-like-mehrdad/SKILL.md', import.meta.url), 'utf8').split('\n');
const PONYTAIL = readFileSync(new URL('../../dev/skills/ponytail/SKILL.md', import.meta.url), 'utf8');
const PONYTAIL_SENTENCES = [
    'You solve the whole problem with the least new code.',
    'Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.',
];
const PONYTAIL_RULE = `- **Smallest complete change.** ${PONYTAIL_SENTENCES.join(' ')}`;

function runHook(hook, agentType) {
    const { status, stdout } = spawnSync('node', [hook], { input: JSON.stringify({ session_id: 'abc123', cwd: '/repo', hook_event_name: 'SubagentStart', agent_id: 'agent-1', agent_type: agentType }) });
    assert.equal(status, 0);
    return stdout.toString();
}

function spawnContext(agentType) {
    const output = JSON.parse(runHook(HOOK, agentType)).hookSpecificOutput;
    assert.equal(output.hookEventName, 'SubagentStart');
    return output.additionalContext;
}

test('gives a general-purpose agent each spawn rule', () => {
    const context = spawnContext('general-purpose');

    for (const sentence of [
        'Do not use `git stash`, because all worktrees of a repo share one stash list.',
        'You solve the whole problem with the least new code.',
        'Write a comment only for a reason that the code cannot show.',
        'Before you report a task done, stop each process that this session started.',
        '**Privileged commands run only when Mehrdad agrees**',
        'If the Bash sandbox blocks a file write, try the Edit or Write tool before you give Mehrdad a command.',
        '**Read the part, not the file**',
    ]) {
        assert.ok(context.includes(sentence), sentence);
    }
});

test('gives a claude agent the same spawn rules as a general-purpose agent', () => {
    assert.equal(spawnContext('claude'), spawnContext('general-purpose'));
});

test('each spawn rule except the ponytail rule is a bullet of a personal skill, word for word', () => {
    const rules = spawnContext('general-purpose').split('\n').slice(1).filter((line) => line !== PONYTAIL_RULE);

    assert.equal(rules.length, 6);
    for (const rule of rules) assert.ok(WORK_LIKE_MEHRDAD.includes(rule) || CODE_LIKE_MEHRDAD.includes(rule), rule);
});

test('the ponytail rule holds two sentences of dev:ponytail, word for word', () => {
    assert.ok(spawnContext('general-purpose').split('\n').includes(PONYTAIL_RULE));
    for (const sentence of PONYTAIL_SENTENCES) assert.ok(PONYTAIL.includes(sentence), sentence);
});

test('the spawn text is 3,200 bytes or less', () => {
    const bytes = Buffer.byteLength(spawnContext('general-purpose'));

    assert.ok(bytes <= 3200, `${bytes} bytes`);
});

test('stays silent and exits 0 when it cannot read a skill file', (t) => {
    const pluginWithNoSkills = mkdtempSync(join(tmpdir(), 'spawn-rules-'));
    t.after(() => rmSync(pluginWithNoSkills, { recursive: true }));
    mkdirSync(join(pluginWithNoSkills, 'hooks'));
    copyFileSync(HOOK, join(pluginWithNoSkills, 'hooks/give-spawn-rules-on-agent-start.mjs'));

    assert.equal(runHook(join(pluginWithNoSkills, 'hooks/give-spawn-rules-on-agent-start.mjs'), 'general-purpose'), '');
});
