let data = '';
for await (const chunk of process.stdin) data += chunk;

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|py|go|java|kt|kts|php|rb|rs|swift|c|h|cpp|cs|sh)$/;

try {
    const path = JSON.parse(data).tool_input.file_path;

    if (CODE_FILE.test(path)) {
        console.log(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PostToolUse',
                additionalContext: 'A code file changed. If `personal:code-like-mehrdad` is not loaded, call the Skill tool with it before your next tool call.',
            },
        }));
    }
} catch {
    // The hook never fails a tool call.
}
