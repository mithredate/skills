import { basename } from 'node:path';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const input = JSON.parse(data || '{}');
if (['AGENTS.md', 'CLAUDE.md'].includes(basename(input.tool_input?.file_path ?? ''))) {
    console.log(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: 'An agent instruction file changed. If `dev:manage-agents-md` is not loaded, call the Skill tool with it before your next tool call. Then check each changed file against it.',
        },
    }));
}
