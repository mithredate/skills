import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const SKILL_OR_AGENT_FILE = /^[^./][^/]*\/(skills\/[^/]+\/.+|agents\/[^/]+\.md)$/;
const LOAD_WRITE_A_SKILL = 'A skill or agent file of this marketplace changed. If `productivity:write-a-skill` is not loaded, call the Skill tool with it before your next tool call. Then check each changed file against it.';

// The text between the two --- lines at the top, or null for a file with none.
const frontmatterOf = (file) => file.match(/^---\n([\s\S]*?)\n---(\n|$)/)?.[1] ?? null;

// The rules live in write-a-skill, so the hook reads them there.
const frontmatterRules = () => readFileSync(new URL('../skills/write-a-skill/SKILL.md', import.meta.url), 'utf8').match(/^## Frontmatter\n([\s\S]*?)\n## /m)[1].trim();

// A walk up to .git costs less than a git call.
function marketplaceTop(dir) {
    for (; dir !== dirname(dir); dir = dirname(dir)) {
        if (existsSync(join(dir, '.git'))) return existsSync(join(dir, 'productivity/skills/write-a-skill/SKILL.md')) ? dir : null;
    }
    return null;
}

try {
    const input = JSON.parse(data || '{}');
    // ponytail: a Bash call is checked only in the repo of its cwd, and a commit that another process makes during the call also gets the reminder.
    let changed = false;
    let frontmatterChanged = false;

    if (input.tool_name !== 'Bash') {
        const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '';
        const top = marketplaceTop(dirname(path));
        changed = top && SKILL_OR_AGENT_FILE.test(relative(top, path));
        // A new file has a null originalFile. A tool response without it counts as a new file too.
        frontmatterChanged = changed && basename(path) === 'SKILL.md' && frontmatterOf(input.tool_response?.originalFile ?? '') !== frontmatterOf(readFileSync(path, 'utf8'));
    } else if (/\bcommit\b/.test(input.tool_input?.command ?? '')) {
        const top = marketplaceTop(input.cwd);
        // The margin covers the time between the end of the call and the start of the hook. --all covers every worktree.
        const since = Math.floor((Date.now() - (input.duration_ms ?? 0) - 2000) / 1000);
        changed = top && spawnSync('git', ['log', '--all', `--since=@${since}`, '--name-only', '--format='], { cwd: top, encoding: 'utf8' }).stdout.split('\n').some((path) => SKILL_OR_AGENT_FILE.test(path));
    }

    if (changed) {
        console.log(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: input.hook_event_name,
                additionalContext: frontmatterChanged ? `${LOAD_WRITE_A_SKILL}\n\nThe frontmatter of a skill changed. Check it against the frontmatter rules of \`productivity:write-a-skill\`:\n${frontmatterRules()}` : LOAD_WRITE_A_SKILL,
            },
        }));
    }
} catch {
    // The hook never fails a tool call.
}
