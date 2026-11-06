let data = '';
for await (const chunk of process.stdin) data += chunk;

const ROUND_RULES = [
    'The next-step box shows your question without context. Your closing message must give that context.',
    'Start it with the digest of `personal:work-like-mehrdad`: line 1 says why this session exists, line 2 says what is true now, line 3 says what the user must do and what happens on a yes.',
    'Then give the question as a round of `productivity:settle-decisions`: the facts, each option with its gain and its cost, and your recommendation with its reason.',
].join(' ');

try {
    const { tool_input: input } = JSON.parse(data);
    if (typeof input?.ask === 'string' && input.ask.trim() !== '') {
        console.log(JSON.stringify({
            hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: ROUND_RULES },
        }));
    }
} catch {
    // The hook never fails a tool call.
}
