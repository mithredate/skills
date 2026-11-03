import { readFileSync } from 'node:fs';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const TRACKER_TICKET = /\/\.orchestrate\/[^/]+\/tickets\/[^/]+\.md$/;
const BRIEF = /^## Brief$/m;
const NEXT_SECTION = /^## /m;

// The text under the brief heading up to the next section, or null for a file with no brief.
function briefOf(file) {
    const heading = file.search(BRIEF);
    if (heading < 0) return null;
    const body = file.slice(heading + '## Brief'.length);
    const next = body.search(NEXT_SECTION);
    return (next < 0 ? body : body.slice(0, next)).trim();
}

try {
    const { tool_input: input, tool_response: response } = JSON.parse(data);
    if (TRACKER_TICKET.test(input.file_path)) {
        // A new file has a null originalFile. A tool response without it counts as a new file too.
        const before = briefOf(response?.originalFile ?? '');
        const after = briefOf(readFileSync(input.file_path, 'utf8'));

        if (before !== after) {
            console.log(JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: 'PostToolUse',
                    additionalContext: 'A brief changed. If `productivity:prep` is not loaded, call the Skill tool with it before your next tool call. Then check the brief against it.',
                },
            }));
        }
    }
} catch {
    // The hook never fails a tool call.
}
