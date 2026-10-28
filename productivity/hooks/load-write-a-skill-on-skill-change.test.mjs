import { spawnSync } from 'node:child_process';
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

function contextFor(input) {
    const { status, stdout } = spawnSync('node', [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input) });
    assert.equal(status, 0);
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput.additionalContext : '';
}

function fileToolContext(repo, toolName, toolInput, extra = {}) {
    return contextFor({ hook_event_name: 'PostToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 'toolu_file', cwd: repo, ...extra });
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

    for (const path of ['README.md', '.claude-plugin/marketplace.json', 'guard-worktree/hooks/register.ts', 'dev/skills/README.md', 'dev/agents/notes/verifier.md']) {
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
    assert.equal(contextFor('not json'), '');
});
