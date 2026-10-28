import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const SKILL_OR_AGENT_FILE = /^[^/]+\/(skills\/[^/]+\/.+|agents\/[^/]+\.md)$/;

function git(dir, args) {
    const { status, stdout } = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    return status === 0 ? stdout : '';
}

// The path in the repo comes from the prefix, because git resolves symlinks in the top and file_path can hold one.
function marketplace(dir) {
    const [top, prefix] = git(dir, ['rev-parse', '--show-toplevel', '--show-prefix']).split('\n');
    return top && existsSync(join(top, 'productivity/skills/write-a-skill/SKILL.md')) ? { top, prefix } : null;
}

try {
    const input = JSON.parse(data || '{}');
    const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '';
    const repo = marketplace(dirname(path));

    if (repo && SKILL_OR_AGENT_FILE.test(repo.prefix + basename(path))) {
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
