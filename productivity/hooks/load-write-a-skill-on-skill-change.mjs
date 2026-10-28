import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const SKILL_OR_AGENT_FILE = /^[^./][^/]*\/(skills\/[^/]+\/.+|agents\/[^/]+\.md)$/;

// A walk up to .git costs less than a git call, and the hook runs twice for each Bash call.
function marketplaceTop(dir) {
    for (; dir !== dirname(dir); dir = dirname(dir)) {
        if (existsSync(join(dir, '.git'))) return existsSync(join(dir, 'productivity/skills/write-a-skill/SKILL.md')) ? dir : null;
    }
    return null;
}

// Imports and refreshes edit in a linked worktree under .worktrees/, which a call from the main checkout can change.
function worktrees(top) {
    const dotGit = join(top, '.git');
    const common = statSync(dotGit).isFile() ? resolve(top, readFileSync(dotGit, 'utf8').replace(/^gitdir: /, '').trim(), '../..') : dotGit;
    const linked = existsSync(join(common, 'worktrees')) ? readdirSync(join(common, 'worktrees')) : [];
    return [dirname(common), ...linked.map((name) => dirname(resolve(common, 'worktrees', name, readFileSync(join(common, 'worktrees', name, 'gitdir'), 'utf8').trim())))];
}

function list(dir, recursive = false) {
    try {
        return readdirSync(dir, { recursive }).sort();
    } catch {
        return [];
    }
}

// A command can commit its change, which leaves git status clean, so the snapshot hashes the file contents.
function snapshot(roots) {
    const hash = createHash('sha1');
    for (const root of roots) {
        const dirs = list(root).flatMap((plugin) => [`${plugin}/skills`, `${plugin}/agents`]);
        for (const path of dirs.flatMap((dir) => list(join(root, dir), true).map((file) => `${dir}/${file}`))) {
            if (!SKILL_OR_AGENT_FILE.test(path)) continue;
            hash.update(`${root}/${path}\0`);
            try {
                hash.update(readFileSync(join(root, path)));
            } catch {
                // A directory has no content.
            }
        }
    }
    return hash.digest('hex');
}

try {
    const input = JSON.parse(data || '{}');
    // Without an id, all Bash calls would share one state file.
    if (!input.tool_use_id) process.exit(0);
    // ponytail: a Bash call is checked only in the worktrees of the repo that holds its cwd, and a change that a background command makes after the call returns is missed.
    const state = join(tmpdir(), `load-write-a-skill-${input.tool_use_id}`);
    let changed = false;

    if (input.tool_name !== 'Bash') {
        const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '';
        const top = marketplaceTop(dirname(path));
        changed = top && SKILL_OR_AGENT_FILE.test(relative(top, path));
    } else if (input.hook_event_name === 'PreToolUse') {
        const top = marketplaceTop(input.cwd);
        if (top) {
            // Post compares the same worktrees, so a worktree that the command adds is not a change.
            const roots = worktrees(top);
            writeFileSync(state, JSON.stringify({ roots, before: snapshot(roots) }));
        }
    } else if (existsSync(state)) {
        const { roots, before } = JSON.parse(readFileSync(state, 'utf8'));
        rmSync(state);
        changed = snapshot(roots) !== before;
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
