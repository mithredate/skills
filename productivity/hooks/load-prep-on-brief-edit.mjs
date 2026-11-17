import { readFileSync } from 'node:fs';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const TRACKER_TICKET = /\/\.initiatives\/[^/]+\/tickets\/[^/]+\.md$/;
const BRIEF = /^## Brief$/m;
const NEXT_SECTION = /^## /m;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const APPROVED = /^approved:.*$/m;
const BRIEF_CHANGED = 'A brief changed. If `productivity:prep` is not loaded, call the Skill tool with it before your next tool call. Then check the brief against it.';
const APPROVED_ADDED = 'An edit added `approved:` to a ticket. If `productivity:prep` is not loaded, call the Skill tool with it before your next tool call. If `dev:brief-judge` did not return `auto` for the current brief, delete `approved:`.';

// The text under the brief heading up to the next section, or null for a file with no brief.
function briefOf(file) {
    const heading = file.search(BRIEF);
    if (heading < 0) return null;
    const body = file.slice(heading + '## Brief'.length);
    const next = body.search(NEXT_SECTION);
    return (next < 0 ? body : body.slice(0, next)).trim();
}

function approvalOf(file) {
    const frontmatter = file.match(FRONTMATTER)?.[1] ?? '';
    return frontmatter.match(APPROVED)?.[0] ?? null;
}

try {
    const { tool_input: input, tool_response: response } = JSON.parse(data);
    if (TRACKER_TICKET.test(input.file_path)) {
        // A new file has a null originalFile. For the brief, a tool response without it counts as a new file too.
        const original = response?.originalFile;
        const before = original ?? '';
        const after = readFileSync(input.file_path, 'utf8');

        const contexts = [];
        if (briefOf(before) !== briefOf(after)) contexts.push(BRIEF_CHANGED);
        const approval = approvalOf(after);
        // Without originalFile, the hook cannot tell an added approved: line from an old one.
        const addsApproval = original !== undefined && approval !== null && approval !== approvalOf(before);
        if (addsApproval) contexts.push(APPROVED_ADDED);

        if (contexts.length > 0) {
            console.log(JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: 'PostToolUse',
                    additionalContext: contexts.join(' '),
                },
            }));
        }
    }
} catch {
    // The hook never fails a tool call.
}
