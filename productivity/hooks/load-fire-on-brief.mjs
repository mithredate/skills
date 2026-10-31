let data = '';
for await (const chunk of process.stdin) data += chunk;

const input = JSON.parse(data || '{}').tool_input ?? {};
const path = input.file_path ?? '';

const BRIEF = /^## Brief$/m;
const BRIEF_FILE = /\/scratchpad\/brief\.md$/;
// The orchestrator repo can name its tracker `wayfinder/` or `.wayfinder/`.
const QUEUED_BRIEF = /\/briefs\/[^/]+\.md$/;
const CLAIM = /^status:[ \t]*in-progress[ \t]*$/m;

let context = '';
if (BRIEF_FILE.test(path) && BRIEF.test(input.content ?? '')) {
    context = 'Before your next tool call, call the Skill tool with: dev:fire.';
} else if (QUEUED_BRIEF.test(path) && CLAIM.test(input.new_string ?? input.content ?? '')) {
    context = 'When the push of this claim succeeds, call the Skill tool with: dev:fire.';
}

if (context) {
    console.log(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: context,
        },
    }));
}
