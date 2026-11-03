console.log(JSON.stringify({
    hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'An agent instruction file changed. If `dev:manage-agents-md` is not loaded, call the Skill tool with it before your next tool call. Then check each changed file against it.',
    },
}));
