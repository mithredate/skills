let data = '';
for await (const chunk of process.stdin) data += chunk;

// The rules live in the two skills. The test checks that both anchors still exist there.
const ROUND_RULES = 'You put a question in the next-step box. The box shows only the question. Before you write your closing message, apply the rule **Report to Mehrdad.** of `personal:work-like-mehrdad` and the section "The round" of `productivity:settle-decisions`. Do not ask the question again in the message. Give its context: the facts, each option with its gain and its cost, and your recommendation.';

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
