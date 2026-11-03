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

function contextFor(toolName, toolInput) {
    return hookOutput(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: toolName, tool_input: toolInput }));
}

test('reminds after an Edit inside the brief of a ticket', () => {
    const path = writeFile('.wayfinder/2026-10-01-braze/tickets/brz-17.md', TICKET);

    const context = contextFor('Edit', { file_path: path, old_string: 'the new address', new_string: 'the sandbox sends from the new address' });

    assert.equal(context, LOAD_PREP);
});

test('hooks.json runs the hook after each Edit, Write, and MultiEdit', () => {
    const { hooks } = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));

    const entries = hooks.PostToolUse.filter((entry) => entry.hooks.some((handler) => handler.command.includes('load-prep-on-brief-edit.mjs')));

    assert.deepEqual(entries.map((entry) => entry.matcher), ['Edit|Write|MultiEdit']);
});
