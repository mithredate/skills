import { readFileSync } from 'node:fs';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const input = JSON.parse(data || '{}').tool_input ?? {};
const editedText = [input.new_string, input.content, ...(input.edits ?? []).map((edit) => edit.new_string)].join('\n');

const TRACKER_TICKET = /\/\.wayfinder\/[^/]+\/tickets\/[^/]+\.md$/;
const CLAIM = /^assignee:[ \t]*\S/m;
const BRIEF = /^## Brief$/m;

if (TRACKER_TICKET.test(input.file_path ?? '') && CLAIM.test(editedText) && BRIEF.test(readFileSync(input.file_path, 'utf8'))) {
    console.log(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: 'Before your next tool call, call the Skill tool with: dev:fire.',
        },
    }));
}
