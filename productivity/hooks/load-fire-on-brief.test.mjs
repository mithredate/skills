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

const LOAD_FIRE_AFTER_PUSH = 'When the push of this claim succeeds, call the Skill tool with: dev:fire.';

test('names fire after the push when fire claims a queued brief', () => {
    const path = writeTicket('wayfinder/briefs/2026-10-30-0900-return-date.md', [
        '---',
        'title: Show the return date',
        'status: ready',
        'updated: 2026-10-30T09:00Z',
        '---',
        '## Brief',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'status: ready', new_string: 'status: in-progress' });

    assert.equal(context, LOAD_FIRE_AFTER_PUSH);
});

test('stays silent when fire sets a queued brief to stuck', () => {
    const path = writeTicket('.wayfinder/briefs/2026-10-30-0900-return-date.md', '---\nstatus: in-progress\n---\n## Brief');

    const context = contextFor({ file_path: path, old_string: 'status: in-progress', new_string: 'status: stuck' });

    assert.equal(context, '');
});

test('stays silent when prep writes a ready brief whose text names in-progress', () => {
    const content = [
        '---',
        'title: Show the return date',
        'status: ready',
        '---',
        '## Brief',
        '',
        '- FR: a booking with status: in-progress shows its return date',
    ].join('\n');
    const path = writeTicket('.wayfinder/briefs/2026-10-30-0900-return-date.md', content);

    const context = contextFor({ file_path: path, content });

    assert.equal(context, '');
});

test('stays silent when cook claims a ticket that links to a brief', () => {
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-17.md', [
        '---',
        'id: brz-17',
        'type: task',
        'status: open',
        'assignee: claude',
        'brief: briefs/2026-10-30-0900-sender-address.md',
        '---',
        'Send from the new address.',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'assignee:', new_string: 'assignee: claude' });

    assert.equal(context, '');
});

test('names fire when prep writes a brief file', () => {
    const content = [
        '## Brief',
        '',
        '- Goal: the booking page shows the return date',
    ].join('\n');
    const path = writeTicket('scratchpad/brief.md', content);

    const context = contextFor({ file_path: path, content });

    assert.equal(context, LOAD_FIRE);
});

test('stays silent when an edit changes a brief file that fire already took', () => {
    const path = writeTicket('scratchpad/brief.md', '## Brief\n\n- Goal: the booking page shows the return date');

    const context = contextFor({ file_path: path, old_string: 'return date', new_string: 'return date and time' });

    assert.equal(context, '');
});

test('stays silent for a brief file outside the scratchpad', () => {
    const content = '## Brief\n\n- Goal: the booking page shows the return date';
    const path = writeTicket('docs/brief.md', content);

    const context = contextFor({ file_path: path, content });

    assert.equal(context, '');
});

test('stays silent when a Write creates a brief file with no brief section', () => {
    const content = 'Notes for a brief';
    const path = writeTicket('scratchpad/brief.md', content);

    const context = contextFor({ file_path: path, content });

    assert.equal(context, '');
});
