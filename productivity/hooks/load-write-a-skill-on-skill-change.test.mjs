import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./load-write-a-skill-on-skill-change.mjs', import.meta.url).pathname;
const LOAD_WRITE_A_SKILL = 'A skill or agent file of this marketplace changed. If `productivity:write-a-skill` is not loaded, call the Skill tool with it before your next tool call. Then check each changed file against it.';

function makeRepo({ marketplace = true } = {}) {
    const repo = mkdtempSync(join(tmpdir(), 'write-a-skill-'));
    const files = {
        'README.md': '# Skills\n',
        '.gitignore': '.worktrees/\n',
        '.claude-plugin/marketplace.json': '{}\n',
        'guard-worktree/hooks/register.ts': 'export {};\n',
        'dev/skills/tdd/SKILL.md': '# tdd\n',
        'dev/skills/tdd/references/mocking.md': '# mocking\n',
        'dev/agents/verifier.md': '# verifier\n',
    };
    if (marketplace) files['productivity/skills/write-a-skill/SKILL.md'] = '# write-a-skill\n';
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(join(repo, path, '..'), { recursive: true });
        writeFileSync(join(repo, path), content);
    }
    // An old date keeps the first commit out of the commits of each Bash call.
    for (const args of [
        ['init', '-q'],
        ['config', 'user.email', 'a@b'],
        ['config', 'user.name', 'a'],
        ['config', 'commit.gpgsign', 'false'],
        ['add', '-A'],
        ['commit', '-qm', 'init'],
    ]) spawnSync('git', args, { cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' } });
    return repo;
}

function addWorktree(repo) {
    spawnSync('git', ['worktree', 'add', '-q', '-b', 'feature', '.worktrees/feature'], { cwd: repo });
    return join(repo, '.worktrees/feature');
}

function hookOutput(input) {
    const { status, stdout } = spawnSync('node', [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input) });
    assert.equal(status, 0);
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput : { additionalContext: '' };
}

function fileToolContext(repo, toolName, toolInput, extra = {}) {
    return hookOutput({ hook_event_name: 'PostToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 'toolu_file', cwd: repo, ...extra }).additionalContext;
}

// Runs the command, then the hook, as Claude Code does for one Bash call.
function bashCall(repo, command, extra = {}) {
    const start = Date.now();
    const { status } = spawnSync('sh', ['-c', command], { cwd: extra.cwd ?? repo });
    return hookOutput({ hook_event_name: status === 0 ? 'PostToolUse' : 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command }, tool_use_id: 'toolu_bash', duration_ms: Date.now() - start, cwd: repo, ...extra });
}

// A commit that fails also gets no reminder, so a silent test checks that its commit landed.
function headSubject(dir) {
    return spawnSync('git', ['log', '-1', '--format=%s'], { cwd: dir }).stdout.toString().trim();
}

test('reminds after an Edit of a SKILL.md', () => {
    const repo = makeRepo();

    const context = fileToolContext(repo, 'Edit', { file_path: join(repo, 'dev/skills/tdd/SKILL.md'), old_string: 'tdd', new_string: 'TDD' });

    assert.equal(context, LOAD_WRITE_A_SKILL);
});

test('reminds after a Write of a file in references/ and in scripts/', () => {
    const repo = makeRepo();

    for (const path of ['dev/skills/tdd/references/seams.md', 'dev/skills/tdd/scripts/check.sh']) {
        mkdirSync(join(repo, path, '..'), { recursive: true });
        writeFileSync(join(repo, path), 'new\n');
        assert.equal(fileToolContext(repo, 'Write', { file_path: join(repo, path), content: 'new\n' }), LOAD_WRITE_A_SKILL, path);
    }
});

test('reminds after a MultiEdit of any other file in the skill folder', () => {
    const repo = makeRepo();

    const context = fileToolContext(repo, 'MultiEdit', { file_path: join(repo, 'dev/skills/tdd/notes.txt'), edits: [{ old_string: 'a', new_string: 'b' }] });

    assert.equal(context, LOAD_WRITE_A_SKILL);
});

test('reminds after a NotebookEdit of a notebook in the skill folder', () => {
    const repo = makeRepo();

    const context = fileToolContext(repo, 'NotebookEdit', { notebook_path: join(repo, 'dev/skills/tdd/demo.ipynb'), new_source: 'print(1)' });

    assert.equal(context, LOAD_WRITE_A_SKILL);
});

test('reminds after an Edit of an agent file', () => {
    const repo = makeRepo();

    const context = fileToolContext(repo, 'Edit', { file_path: join(repo, 'dev/agents/verifier.md'), old_string: 'verifier', new_string: 'Verifier' });

    assert.equal(context, LOAD_WRITE_A_SKILL);
});

test('stays silent after an Edit of a file that is not a skill or agent file', () => {
    const repo = makeRepo();

    for (const path of ['README.md', '.claude-plugin/marketplace.json', 'guard-worktree/hooks/register.ts', 'dev/skills/README.md', 'dev/agents/notes/verifier.md', '.claude/skills/tdd/SKILL.md']) {
        assert.equal(fileToolContext(repo, 'Edit', { file_path: join(repo, path), old_string: 'a', new_string: 'b' }), '', path);
    }
});

test('stays silent after an Edit of a SKILL.md in a repo with no write-a-skill', () => {
    const repo = makeRepo({ marketplace: false });

    const context = fileToolContext(repo, 'Edit', { file_path: join(repo, 'dev/skills/tdd/SKILL.md'), old_string: 'tdd', new_string: 'TDD' });

    assert.equal(context, '');
});

test('reminds after an Edit of a SKILL.md inside a subagent', () => {
    const repo = makeRepo();

    const context = fileToolContext(repo, 'Edit', { file_path: join(repo, 'dev/skills/tdd/SKILL.md'), old_string: 'tdd', new_string: 'TDD' }, { agent_id: 'agent-1', agent_type: 'general-purpose' });

    assert.equal(context, LOAD_WRITE_A_SKILL);
});

test('stays silent and exits 0 for a file outside a git repo or for input it cannot read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'write-a-skill-'));

    assert.equal(fileToolContext(dir, 'Edit', { file_path: join(dir, 'dev/skills/tdd/SKILL.md'), old_string: 'a', new_string: 'b' }), '');
    assert.equal(hookOutput('not json').additionalContext, '');
});

test('reminds after a Bash call that changes a skill file and commits it', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/references/mocking.md && git commit -qam x').additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a Bash call that commits an added, deleted, or changed skill or agent file', () => {
    for (const command of [
        'mkdir -p dev/skills/tdd/scripts && echo x > dev/skills/tdd/scripts/check.sh && git add -A && git commit -qm x',
        'git rm -q dev/skills/tdd/references/mocking.md && git commit -qm x',
        'echo x >> dev/agents/verifier.md && git commit -qam x',
    ]) {
        assert.equal(bashCall(makeRepo(), command).additionalContext, LOAD_WRITE_A_SKILL, command);
    }
});

test('reminds after a Bash call that commits with git -C <dir> or git -c <key>=<value>', () => {
    for (const command of [
        'echo x >> dev/skills/tdd/SKILL.md && git -C dev commit -qam x',
        'echo x >> dev/skills/tdd/SKILL.md && git -c user.name=b commit -qam x',
    ]) {
        assert.equal(bashCall(makeRepo(), command).additionalContext, LOAD_WRITE_A_SKILL, command);
    }
});

test('reminds after a Bash call that fails after it commits a skill file', () => {
    const repo = makeRepo();

    assert.deepEqual(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md && git commit -qam x && false'), { hookEventName: 'PostToolUseFailure', additionalContext: LOAD_WRITE_A_SKILL });
});

test('stays silent after a Bash call that changes a skill file and does not commit it', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md && git add -A && git status -s').additionalContext, '');
});

test('stays silent after a Bash call that commits no skill or agent file', () => {
    for (const command of [
        'echo x >> README.md && echo x >> .claude-plugin/marketplace.json && echo x >> guard-worktree/hooks/register.ts && git commit -qam x',
        'echo x >> dev/skills/tdd/SKILL.md && echo x >> README.md && git commit -qm x README.md',
    ]) {
        const repo = makeRepo();
        assert.equal(bashCall(repo, command).additionalContext, '', command);
        assert.equal(headSubject(repo), 'x', command);
    }
});

test('stays silent after a Bash call that commits a skill file in a repo with no write-a-skill', () => {
    const repo = makeRepo({ marketplace: false });

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md && git commit -qam x').additionalContext, '');
    assert.equal(headSubject(repo), 'x');
});

test('reminds after a Bash call that commits a skill file inside a subagent', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md && git commit -qam x', { agent_id: 'agent-1', agent_type: 'general-purpose' }).additionalContext, LOAD_WRITE_A_SKILL);
});

test('stays silent and exits 0 after a Bash call that commits outside a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'write-a-skill-'));

    assert.equal(bashCall(dir, 'echo x > notes.md && git commit -qam x').additionalContext, '');
});

test('reminds after a Bash call that commits a skill file from a subdirectory of the repo', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> skills/tdd/SKILL.md && git commit -qam x', { cwd: join(repo, 'dev') }).additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after an Edit and a Bash commit in a linked worktree, where .git is a file', () => {
    const worktree = addWorktree(makeRepo());

    assert.equal(fileToolContext(worktree, 'Edit', { file_path: join(worktree, 'dev/skills/tdd/SKILL.md'), old_string: 'tdd', new_string: 'TDD' }), LOAD_WRITE_A_SKILL);
    assert.equal(bashCall(worktree, 'echo x >> dev/skills/tdd/SKILL.md && git commit -qam x').additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a Bash call from the main checkout that commits a skill file in a linked worktree', () => {
    const repo = makeRepo();
    addWorktree(repo);

    assert.equal(bashCall(repo, 'echo x >> .worktrees/feature/dev/skills/tdd/SKILL.md && git -C .worktrees/feature commit -qam x').additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a Bash call from a linked worktree that commits an agent file in the main checkout', () => {
    const worktree = addWorktree(makeRepo());

    assert.equal(bashCall(worktree, 'echo x >> ../../dev/agents/verifier.md && git -C ../.. commit -qam x').additionalContext, LOAD_WRITE_A_SKILL);
});

test('stays silent after a Bash call from the main checkout that commits other files in a linked worktree', () => {
    const repo = makeRepo();
    addWorktree(repo);

    assert.equal(bashCall(repo, 'echo x >> .worktrees/feature/README.md && echo x >> .worktrees/feature/dev/skills/README.md && git -C .worktrees/feature add -A && git -C .worktrees/feature commit -qm x').additionalContext, '');
    assert.equal(headSubject(join(repo, '.worktrees/feature')), 'x');
});

test('counts back the run time of the Bash call from duration_ms', () => {
    const command = 'echo x >> dev/skills/tdd/SKILL.md && GIT_COMMITTER_DATE="@$(($(date +%s) - 60)) +0000" git commit -qam x';

    assert.equal(bashCall(makeRepo(), command, { duration_ms: 61000 }).additionalContext, LOAD_WRITE_A_SKILL);
    const repo = makeRepo();
    assert.equal(bashCall(repo, command, { duration_ms: undefined }).additionalContext, '');
    assert.equal(headSubject(repo), 'x');
});

test('hooks.json starts the hook for a Bash call only after the call, and only with a git subcommand', () => {
    const { hooks } = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));
    const runsHook = (handler) => handler.command.includes('load-write-a-skill-on-skill-change.mjs');

    for (const event of ['PostToolUse', 'PostToolUseFailure']) {
        const handlers = hooks[event].filter((entry) => entry.matcher.split('|').includes('Bash')).flatMap((entry) => entry.hooks).filter(runsHook);
        assert.ok(handlers.length > 0, event);
        for (const handler of handlers) assert.equal(handler.if, 'Bash(git *)', event);
    }
    assert.ok(!(hooks.PreToolUse ?? []).some((entry) => entry.hooks.some(runsHook)));
});
