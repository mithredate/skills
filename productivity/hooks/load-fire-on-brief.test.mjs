import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./load-fire-on-brief.mjs', import.meta.url).pathname;
const LOAD_FIRE = 'Before your next tool call, call the Skill tool with: dev:fire.';
const TAKE = 'node /plugins/productivity/scripts/brief-queue.mjs take /Users/me/discovery';

function writeFile(relativePath, content) {
    const path = join(mkdtempSync(join(tmpdir(), 'fire-on-brief-')), relativePath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
    return path;
}

function contextFor(toolName, toolInput, toolResponse = {}) {
    const { stdout } = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, tool_response: toolResponse }) });
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput.additionalContext : '';
}

test('names fire when brief-queue take claims a brief', () => {
    const stdout = '{"outcome":"claimed","brief":"wayfinder/briefs/2026-10-30-0900-return-date.md","title":"Show the return date","copy":"/tmp/brief-x/2026-10-30-0900-return-date.md","stuck":[]}\n';

    const context = contextFor('Bash', { command: TAKE }, { stdout, stderr: '' });

    assert.equal(context, LOAD_FIRE);
});

test('stays silent when brief-queue take reports busy', () => {
    const context = contextFor('Bash', { command: TAKE }, { stdout: '{"outcome":"busy","stuck":[]}\n', stderr: '' });

    assert.equal(context, '');
});

test('stays silent when another command prints a claim', () => {
    const stdout = '{"outcome":"claimed","brief":"wayfinder/briefs/2026-10-30-0900-return-date.md"}\n';

    const context = contextFor('Bash', { command: 'cat /tmp/old-take.json' }, { stdout, stderr: '' });

    assert.equal(context, '');
});

test('stays silent when an edit sets a queued brief to in-progress', () => {
    const path = writeFile('wayfinder/briefs/2026-10-30-0900-return-date.md', '---\nstatus: in-progress\n---\n## Brief');

    const context = contextFor('Edit', { file_path: path, old_string: 'status: ready', new_string: 'status: in-progress' });

    assert.equal(context, '');
});

test('names fire when prep writes a brief file', () => {
    const content = [
        '## Brief',
        '',
        '- Goal: the booking page shows the return date',
    ].join('\n');
    const path = writeFile('scratchpad/brief.md', content);

    const context = contextFor('Write', { file_path: path, content });

    assert.equal(context, LOAD_FIRE);
});

test('stays silent when an edit changes a brief file that fire already took', () => {
    const path = writeFile('scratchpad/brief.md', '## Brief\n\n- Goal: the booking page shows the return date and time');

    const context = contextFor('Edit', { file_path: path, old_string: 'return date', new_string: 'return date and time' });

    assert.equal(context, '');
});

test('stays silent for a brief file outside the scratchpad', () => {
    const content = '## Brief\n\n- Goal: the booking page shows the return date';
    const path = writeFile('docs/brief.md', content);

    const context = contextFor('Write', { file_path: path, content });

    assert.equal(context, '');
});

test('stays silent when a Write creates a brief file with no brief section', () => {
    const content = 'Notes for a brief';
    const path = writeFile('scratchpad/brief.md', content);

    const context = contextFor('Write', { file_path: path, content });

    assert.equal(context, '');
});
