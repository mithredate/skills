let data = '';
for await (const chunk of process.stdin) data += chunk;

const event = JSON.parse(data || '{}');
const input = event.tool_input ?? {};

const BRIEF = /^## Brief$/m;
const BRIEF_FILE = /\/scratchpad\/brief\.md$/;
const TAKE = /\bbrief-queue\.mjs["']?\s+take\b/;
const CLAIMED = /^\{"outcome":"claimed"/m;

const writesBriefFile = BRIEF_FILE.test(input.file_path ?? '') && BRIEF.test(input.content ?? '');
const claimsBrief = event.tool_name === 'Bash' && TAKE.test(input.command ?? '') && CLAIMED.test(event.tool_response?.stdout ?? '');

if (writesBriefFile || claimsBrief) {
    console.log(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: 'Before your next tool call, call the Skill tool with: dev:fire.',
        },
    }));
}
