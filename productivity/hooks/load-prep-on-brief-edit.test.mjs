import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./load-prep-on-brief-edit.mjs', import.meta.url).pathname;
const LOAD_PREP = 'A brief changed. If `productivity:prep` is not loaded, call the Skill tool with it before your next tool call. Then check the brief against it.';

const TICKET = [
    '---',
    'id: brz-17',
    'type: task',
    'status: open',
    'assignee: claude',
    'approved: 2026-11-03',
    '---',
    '',
    '## Brief',
    '',
    '- Goal: the sandbox sends from the new address',
    '- FR: the From header is noreply@example.com',
    '',
    '## Resolution',
    '',
    'Fire returned blocked: the sandbox has no DNS record.',
].join('\n');
const TICKET_WITHOUT_RESOLUTION = TICKET.split('\n\n## Resolution')[0];

function writeFile(relativePath, content) {
    const path = join(mkdtempSync(join(tmpdir(), 'prep-on-brief-edit-')), relativePath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
    return path;
}

function hookOutput(input) {
    const { status, stdout } = spawnSync('node', [HOOK], { input });
    assert.equal(status, 0);
    return stdout.toString() ? JSON.parse(stdout).hookSpecificOutput.additionalContext : '';
}

function contextFor(toolName, toolInput, toolResponse) {
    return hookOutput(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: toolName, tool_input: toolInput, tool_response: toolResponse }));
}

// Edits the file the way the Edit tool does, then runs the hook with the tool's input and response.
function contextAfterEdit(path, old_string, new_string) {
    const originalFile = readFileSync(path, 'utf8');
    writeFileSync(path, originalFile.replace(old_string, () => new_string));
    return contextFor('Edit', { file_path: path, old_string, new_string }, { filePath: path, oldString: old_string, newString: new_string, originalFile });
}

test('reminds after an Edit inside the brief of a ticket', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-17.md', TICKET);

    const context = contextAfterEdit(path, 'the new address', 'the sandbox sends from the new address');

    assert.equal(context, LOAD_PREP);
});

test('reminds after a Write of a ticket that holds a brief', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-20.md', TICKET);

    const context = contextFor('Write', { file_path: path, content: TICKET }, { type: 'create', filePath: path, content: TICKET, originalFile: null });

    assert.equal(context, LOAD_PREP);
});

test('reminds after a MultiEdit with one edit inside the brief', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-17.md', TICKET);

    const context = contextFor('MultiEdit', { file_path: path, edits: [
        { old_string: 'assignee:', new_string: 'assignee: claude' },
        { old_string: 'example.com', new_string: 'noreply@example.com' },
    ] });

    assert.equal(context, LOAD_PREP);
});

test('stays silent after an Edit that claims the ticket, approves it, or records a resolution', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-17.md', TICKET);

    for (const [old_string, new_string] of [
        ['assignee:', 'assignee: claude'],
        ['---\n\n## Brief', 'approved: 2026-11-03\n---\n\n## Brief'],
        ['blocked:', 'Fire returned blocked:'],
    ]) assert.equal(contextAfterEdit(path, old_string, new_string), '', new_string);
    assert.equal(contextAfterEdit(path, 'example.com', 'noreply@example.com'), LOAD_PREP);
});

test('stays silent after an Edit that anchors on the last brief line to add a resolution', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-17.md', TICKET_WITHOUT_RESOLUTION);

    const context = contextAfterEdit(path, '- FR: the From header is noreply@example.com', '- FR: the From header is noreply@example.com\n\n## Resolution\n\nBuilt in PR 12.');

    assert.equal(context, '');
});

test('stays silent after an Edit outside the brief whose new text the brief repeats', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-18.md', [
        '---',
        'id: brz-18',
        'assignee: orchestrate fire 2026-11-03T10:00Z',
        '---',
        '',
        '## Brief',
        '',
        '- FR: a claim sets assignee: to the session name',
    ].join('\n'));

    const context = contextAfterEdit(path, 'assignee: orchestrate fire 2026-11-03T10:00Z', 'assignee:');

    assert.equal(context, '');
});

test('stays silent after a Write that adds a resolution and keeps the brief', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-17.md', TICKET);

    const context = contextFor('Write', { file_path: path, content: TICKET }, { type: 'update', filePath: path, content: TICKET, originalFile: TICKET_WITHOUT_RESOLUTION });

    assert.equal(context, '');
});

test('stays silent after an Edit of a map or of a brief file outside a ticket', () => {
    for (const [relativePath, expected] of [
        ['.wayfinder/2026-10-01-braze/map.md', ''],
        ['scratchpad/brief.md', ''],
        ['.wayfinder/2026-10-01-braze/tickets/brz-17.md', LOAD_PREP],
    ]) {
        const path = writeFile(relativePath, TICKET);

        const context = contextFor('Edit', { file_path: path, old_string: 'the new address', new_string: 'the sandbox sends from the new address' });

        assert.equal(context, expected, relativePath);
    }
});

test('stays silent and exits 0 for input it cannot read', () => {
    assert.equal(hookOutput('not json'), '');
});

test('hooks.json runs the hook after each Edit, Write, and MultiEdit', () => {
    const { hooks } = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));

    const entries = hooks.PostToolUse.filter((entry) => entry.hooks.some((handler) => handler.command.includes('load-prep-on-brief-edit.mjs')));

    assert.deepEqual(entries.map((entry) => entry.matcher), ['Edit|Write|MultiEdit']);
});
