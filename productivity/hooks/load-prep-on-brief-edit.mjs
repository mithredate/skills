import { readFileSync } from 'node:fs';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const TRACKER_TICKET = /\/\.wayfinder\/[^/]+\/tickets\/[^/]+\.md$/;
const BRIEF = /^## Brief$/m;
const NEXT_SECTION = /^## /m;

// True when an occurrence of the text in the file overlaps the range from start to end.
function overlaps(file, text, start, end) {
    for (let at = file.indexOf(text); at >= 0; at = file.indexOf(text, at + 1)) {
        if (at < end && at + text.length > start) return true;
    }
    return false;
}

try {
    const input = JSON.parse(data).tool_input;
    if (TRACKER_TICKET.test(input.file_path)) {
        const file = readFileSync(input.file_path, 'utf8');
        const start = file.search(BRIEF);
        const rest = file.slice(start + '## Brief'.length).search(NEXT_SECTION);
        const end = rest < 0 ? file.length : start + '## Brief'.length + rest;
        // ponytail: a deletion leaves no text to find, so it gets no reminder.
        const editedTexts = [input.new_string, input.content, ...(input.edits ?? []).map((edit) => edit.new_string)].filter(Boolean);

        if (start >= 0 && editedTexts.some((text) => overlaps(file, text, start, end))) {
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
