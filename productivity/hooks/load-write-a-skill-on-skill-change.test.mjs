import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
    for (const args of [
        ['init', '-q'],
        ['config', 'user.email', 'a@b'],
        ['config', 'user.name', 'a'],
        ['config', 'commit.gpgsign', 'false'],
        ['add', '-A'],
        ['commit', '-qm', 'init'],
    ]) spawnSync('git', args, { cwd: repo });
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

// Runs the hook before and after the command, as Claude Code does for one Bash call.
function bashCall(repo, command, extra = {}) {
    const call = { tool_name: 'Bash', tool_input: { command }, tool_use_id: `toolu_${randomUUID()}`, cwd: repo, ...extra };
    assert.equal(hookOutput({ ...call, hook_event_name: 'PreToolUse' }).additionalContext, '');
    const { status } = spawnSync('sh', ['-c', command], { cwd: call.cwd });
    return hookOutput({ ...call, hook_event_name: status === 0 ? 'PostToolUse' : 'PostToolUseFailure' });
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

test('reminds after a Bash call that changes a skill file', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md').additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a Bash call that adds, deletes, or renames a skill or agent file', () => {
    for (const command of [
        'mkdir -p dev/skills/tdd/scripts && echo x > dev/skills/tdd/scripts/check.sh',
        'rm dev/skills/tdd/references/mocking.md',
        'git mv dev/agents/verifier.md dev/agents/checker.md',
        'mv dev/skills/tdd dev/skills/test-first',
        'echo x >> dev/agents/verifier.md',
    ]) {
        assert.equal(bashCall(makeRepo(), command).additionalContext, LOAD_WRITE_A_SKILL, command);
    }
});

test('reminds when the same Bash call commits the change', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/references/mocking.md && git commit -qam x').additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds when a script writes a skill file that the command does not name', () => {
    const repo = makeRepo();
    const script = join(mkdtempSync(join(tmpdir(), 'write-a-skill-script-')), 'touch-skills.sh');
    writeFileSync(script, 'for f in $(git ls-files "*.md"); do echo x >> "$f"; done\n');

    assert.equal(bashCall(repo, `sh ${script}`).additionalContext, LOAD_WRITE_A_SKILL);
});

test('stays silent after a Bash call that only reads skill files', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'cat dev/skills/tdd/SKILL.md && grep -r tdd dev/skills && git log -1 -- dev/agents').additionalContext, '');
});

test('reminds when a Bash call rewrites a skill file with the same content and commits', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, "perl -pi -e 's/tdd/tdd/' dev/skills/tdd/SKILL.md && git commit -q --allow-empty -am x").additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a Bash call that only changes the mode of a skill script', () => {
    const repo = makeRepo();
    mkdirSync(join(repo, 'dev/skills/tdd/scripts'));
    writeFileSync(join(repo, 'dev/skills/tdd/scripts/check.sh'), 'echo ok\n');

    assert.equal(bashCall(repo, 'chmod +x dev/skills/tdd/scripts/check.sh').additionalContext, LOAD_WRITE_A_SKILL);
});

test('stays silent after a Bash call that changes and commits other files', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> README.md && echo x >> .claude-plugin/marketplace.json && echo x >> guard-worktree/hooks/register.ts && git commit -qam x').additionalContext, '');
});

test('stays silent after a Bash call that changes a skill file in a repo with no write-a-skill', () => {
    const repo = makeRepo({ marketplace: false });

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md').additionalContext, '');
});

test('reminds after a Bash call inside a subagent', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md', { agent_id: 'agent-1', agent_type: 'general-purpose' }).additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a failed Bash call that changed a skill file', () => {
    const repo = makeRepo();

    assert.deepEqual(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md && false'), { hookEventName: 'PostToolUseFailure', additionalContext: LOAD_WRITE_A_SKILL });
});

test('stays silent and exits 0 after a Bash call outside a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'write-a-skill-'));

    assert.equal(bashCall(dir, 'echo x > notes.md').additionalContext, '');
});

test('reminds after a Bash call from a subdirectory of the repo', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> skills/tdd/SKILL.md', { cwd: join(repo, 'dev') }).additionalContext, LOAD_WRITE_A_SKILL);
});

test('stays silent after a Bash PostToolUse with no PreToolUse before it', () => {
    const repo = makeRepo();
    const command = 'echo x >> dev/skills/tdd/SKILL.md';
    spawnSync('sh', ['-c', command], { cwd: repo });

    const context = hookOutput({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_use_id: `toolu_${randomUUID()}`, cwd: repo }).additionalContext;

    assert.equal(context, '');
});

test('stays silent after a call with no tool_use_id', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'echo x >> dev/skills/tdd/SKILL.md', { tool_use_id: undefined }).additionalContext, '');
    assert.equal(fileToolContext(repo, 'Edit', { file_path: join(repo, 'dev/skills/tdd/SKILL.md'), old_string: 'tdd', new_string: 'TDD' }, { tool_use_id: undefined }), '');
});

test('reminds after an Edit and a Bash call in a linked worktree, where .git is a file', () => {
    const worktree = addWorktree(makeRepo());

    assert.equal(fileToolContext(worktree, 'Edit', { file_path: join(worktree, 'dev/skills/tdd/SKILL.md'), old_string: 'tdd', new_string: 'TDD' }), LOAD_WRITE_A_SKILL);
    assert.equal(bashCall(worktree, 'echo x >> dev/skills/tdd/SKILL.md && git commit -qam x').additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a Bash call from the main checkout that changes a skill file in a linked worktree', () => {
    const repo = makeRepo();
    addWorktree(repo);

    assert.equal(bashCall(repo, 'echo x >> .worktrees/feature/dev/skills/tdd/SKILL.md && git -C .worktrees/feature commit -qam x').additionalContext, LOAD_WRITE_A_SKILL);
});

test('reminds after a Bash call from a linked worktree that changes an agent file in the main checkout', () => {
    const worktree = addWorktree(makeRepo());

    assert.equal(bashCall(worktree, 'echo x >> ../../dev/agents/verifier.md').additionalContext, LOAD_WRITE_A_SKILL);
});

test('stays silent after a Bash call from the main checkout that changes other files in a linked worktree', () => {
    const repo = makeRepo();
    addWorktree(repo);

    assert.equal(bashCall(repo, 'echo x >> .worktrees/feature/README.md && echo x >> .worktrees/feature/dev/skills/README.md').additionalContext, '');
});

test('stays silent after a Bash call that only adds a linked worktree', () => {
    const repo = makeRepo();

    assert.equal(bashCall(repo, 'git worktree add -q -b other .worktrees/other').additionalContext, '');
});
