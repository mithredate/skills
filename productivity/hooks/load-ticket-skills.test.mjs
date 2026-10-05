import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./load-ticket-skills.mjs', import.meta.url).pathname;

function writeTicket(relativePath, content) {
    const path = join(mkdtempSync(join(tmpdir(), 'ticket-skills-')), relativePath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
    return path;
}

function contextFor(toolInput) {
    const { stdout } = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_name: 'Edit', tool_input: toolInput }) });
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput.additionalContext : '';
}

test('names the skills of a ticket when the edit claims it', () => {
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-17.md', [
        '---',
        'id: brz-17',
        'type: grilling',
        'status: open',
        'assignee: claude',
        'skills: [productivity:grilling, productivity:domain-modeling]',
        '---',
        'Which From address do we use?',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'assignee:', new_string: 'assignee: claude' });

    assert.equal(context, 'Before your next tool call, call the Skill tool with: productivity:grilling, productivity:domain-modeling.');
});

test('stays silent when the edit does not set the assignee', () => {
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-17.md', [
        '---',
        'status: open',
        'assignee: claude',
        'skills: [productivity:grilling]',
        '---',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'old note', new_string: 'new note' });

    assert.equal(context, '');
});

test('stays silent for a ticket with no skills field', () => {
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-03.md', [
        '---',
        'status: open',
        'assignee: claude',
        '---',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'assignee:', new_string: 'assignee: claude' });

    assert.equal(context, '');
});

test('stays silent for a file outside a tracker tickets directory', () => {
    const path = writeTicket('docs/tickets/brz-17.md', [
        '---',
        'assignee: claude',
        'skills: [productivity:grilling]',
        '---',
    ].join('\n'));

    const context = contextFor({ file_path: path, old_string: 'assignee:', new_string: 'assignee: claude' });

    assert.equal(context, '');
});

test('names the skills when a Write creates a claimed ticket', () => {
    const content = [
        '---',
        'status: open',
        'assignee: claude',
        'skills: [productivity:research]',
        '---',
    ].join('\n');
    const path = writeTicket('.wayfinder/2026-10-01-braze/tickets/brz-20.md', content);

    const context = contextFor({ file_path: path, content });

    assert.equal(context, 'Before your next tool call, call the Skill tool with: productivity:research.');
});
