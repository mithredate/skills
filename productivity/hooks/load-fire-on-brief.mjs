let data = '';
for await (const chunk of process.stdin) data += chunk;

const input = JSON.parse(data || '{}').tool_input ?? {};

const BRIEF = /^## Brief$/m;
const BRIEF_FILE = /\/scratchpad\/brief\.md$/;

if (BRIEF_FILE.test(input.file_path ?? '') && BRIEF.test(input.content ?? '')) {
    console.log(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: 'Before your next tool call, call the Skill tool with: dev:fire.',
        },
    }));
}
