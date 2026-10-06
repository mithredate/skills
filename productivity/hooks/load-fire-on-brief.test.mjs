import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./load-fire-on-brief.mjs', import.meta.url).pathname;
const LOAD_FIRE = 'Before your next tool call, call the Skill tool with: dev:fire.';

function writeTicket(relativePath, content) {
    const path = join(mkdtempSync(join(tmpdir(), 'fire-on-brief-')), relativePath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
    return path;
}

function contextFor(toolInput) {
    const { stdout } = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_name: 'Edit', tool_input: toolInput }) });
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput.additionalContext : '';
}

test('names fire when the edit claims a ticket with a brief', () => {
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-17.md', [
        '---',
        'id: brz-17',
        'type: task',
        'status: open',
        'assignee: claude',
        '---',
        '## Brief',
        '',
        '- Goal: the sandbox sends from the new address',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'assignee:', new_string: 'assignee: claude' });

    assert.equal(context, LOAD_FIRE);
});

test('stays silent when the edit claims a ticket with no brief', () => {
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-03.md', [
        '---',
        'type: grilling',
        'status: open',
        'assignee: claude',
        '---',
        'Which From address do we use?',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'assignee:', new_string: 'assignee: claude' });

    assert.equal(context, '');
});

test('stays silent when the edit does not set the assignee', () => {
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-17.md', [
        '---',
        'status: open',
        'assignee: claude',
        '---',
        '## Brief',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'old note', new_string: 'new note' });

    assert.equal(context, '');
});

test('stays silent for a file outside a tracker tickets directory', () => {
    const path = writeTicket('docs/tickets/brz-17.md', [
        '---',
        'assignee: claude',
        '---',
        '## Brief',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'assignee:', new_string: 'assignee: claude' });

    assert.equal(context, '');
});

test('names fire when a Write creates a claimed ticket with a brief', () => {
    const content = [
        '---',
        'status: open',
        'assignee: claude',
        '---',
        '## Brief',
    ].join('\n');
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-20.md', content);

    const context = contextFor({ file_path: path, content });

    assert.equal(context, LOAD_FIRE);
});
