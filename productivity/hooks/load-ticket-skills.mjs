import { readFileSync } from 'node:fs';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const input = JSON.parse(data || '{}').tool_input ?? {};
const editedText = [input.new_string, input.content, ...(input.edits ?? []).map((edit) => edit.new_string)].join('\n');

const TRACKER_TICKET = /\/\.wayfinder\/[^/]+\/tickets\/[^/]+\.md$/;
const CLAIM = /^assignee:[ \t]*\S/m;

if (TRACKER_TICKET.test(input.file_path ?? '') && CLAIM.test(editedText)) {
    const frontmatter = readFileSync(input.file_path, 'utf8').split(/^---$/m)[1] ?? '';
    const skills = frontmatter.match(/^skills:\s*\[(.*)\]/m)?.[1].split(',').map((skill) => skill.trim()).filter(Boolean) ?? [];
    if (skills.length) {
        console.log(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PostToolUse',
                additionalContext: `Before your next tool call, call the Skill tool with: ${skills.join(', ')}.`,
            },
        }));
    }
}
