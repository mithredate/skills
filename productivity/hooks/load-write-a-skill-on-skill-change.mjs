import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const SKILL_OR_AGENT_FILE = /^[^/]+\/(skills\/[^/]+\/.+|agents\/[^/]+\.md)$/;
const SKILL_AND_AGENT_FILES = [':(glob)*/skills/*/**', ':(glob)*/agents/*.md'];

function git(dir, args) {
    const { status, stdout } = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    return status === 0 ? stdout : '';
}

// A walk up to .git costs less than a git call, and the hook runs twice for each Bash call.
function marketplaceTop(dir) {
    for (; dir !== dirname(dir); dir = dirname(dir)) {
        if (existsSync(join(dir, '.git'))) return existsSync(join(dir, 'productivity/skills/write-a-skill/SKILL.md')) ? dir : null;
    }
    return null;
}

// A command can commit its change, which leaves git status clean, so the snapshot hashes the file contents.
function snapshot(top) {
    const hash = createHash('sha1');
    for (const file of git(top, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SKILL_AND_AGENT_FILES]).split('\0').sort()) {
        hash.update(`${file}\0`);
        try {
            hash.update(readFileSync(join(top, file)));
        } catch {
            hash.update('\0deleted\0');
        }
    }
    return hash.digest('hex');
}

try {
    const input = JSON.parse(data || '{}');
    // Without an id, all Bash calls would share one state file.
    if (!input.tool_use_id) process.exit(0);
    // ponytail: a Bash call is checked only in the repo of its cwd, and a change that a background command makes after the call returns is missed.
    const state = join(tmpdir(), `load-write-a-skill-${input.tool_use_id}`);
    let changed = false;

    if (input.tool_name !== 'Bash') {
        const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '';
        const top = marketplaceTop(dirname(path));
        changed = top && SKILL_OR_AGENT_FILE.test(relative(top, path));
    } else if (input.hook_event_name === 'PreToolUse') {
        const top = marketplaceTop(input.cwd);
        if (top) writeFileSync(state, `${top}\0${snapshot(top)}`);
    } else if (existsSync(state)) {
        const [top, before] = readFileSync(state, 'utf8').split('\0');
        rmSync(state);
        changed = snapshot(top) !== before;
    }

    if (changed) {
        console.log(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: input.hook_event_name,
                additionalContext: 'A skill or agent file of this marketplace changed. If `productivity:write-a-skill` is not loaded, call the Skill tool with it before your next tool call. Then check each changed file against it.',
            },
        }));
    }
} catch {
    // The hook never fails a tool call.
}
