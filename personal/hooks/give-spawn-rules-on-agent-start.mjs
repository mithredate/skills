import { readFileSync } from 'node:fs';

// The dev plugin installs in its own folder, so the test checks this copy against dev:ponytail.
const PONYTAIL_RULE = '- **Smallest complete change.** You solve the whole problem with the least new code. Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.';

const bullet = (skill, label) => readFileSync(new URL(`../skills/${skill}/SKILL.md`, import.meta.url), 'utf8').split('\n').find((line) => line.startsWith(`- **${label}`));

try {
    const rules = [
        bullet('work-like-mehrdad', 'Parallel sessions.'),
        PONYTAIL_RULE,
        bullet('code-like-mehrdad', 'Comments.'),
        bullet('work-like-mehrdad', 'Clean up before you report.'),
        bullet('work-like-mehrdad', 'Privileged commands'),
        bullet('work-like-mehrdad', 'Sandbox blocks a write.'),
        bullet('work-like-mehrdad', 'Read the part, not the file'),
    ];

    console.log(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'SubagentStart',
            additionalContext: ["Mehrdad's spawn rules. They apply to the whole task.", ...rules].join('\n'),
        },
    }));
} catch {
    // The hook never fails an agent start.
}
