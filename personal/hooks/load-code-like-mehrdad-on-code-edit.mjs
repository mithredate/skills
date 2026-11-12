import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|py|go|java|kt|kts|php|rb|rs|swift|c|h|cpp|cs|sh)$/;
const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts)$/;
const TEST_NAME =/\.test\.|\.spec\.|_test\.|Tests?\.|^test_.*\.py$/;
const TEST_FOLDER = /(^|\/)(test|tests|__tests__|spec)\//;

// fileURLToPath decodes a space in the install path, such as "Application Support".
const rubric = (name) => fileURLToPath(new URL(`../skills/code-like-mehrdad/references/${name}.md`, import.meta.url));

try {
    const input = JSON.parse(data);
    const path = input.tool_input.file_path;

    if (CODE_FILE.test(path)) {
        // An agent ignores the load line, and an agent that obeys it loads about 7.2K tokens.
        const lines = input.agent_id ? [] : ['A code file changed. If `personal:code-like-mehrdad` is not loaded, call the Skill tool with it before your next tool call.'];
        lines.push(`If you have not read the code rubric in this session, read \`${rubric('code')}\`.`);
        if (TEST_NAME.test(basename(path)) || TEST_FOLDER.test(path)) lines.push(`If you have not read the testing rubric in this session, read \`${rubric('testing')}\`.`);
        if (TYPESCRIPT_FILE.test(path)) lines.push(`If you have not read the TypeScript rubric in this session, read \`${rubric('typescript')}\`.`);

        console.log(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PostToolUse',
                additionalContext: lines.join(' '),
            },
        }));
    }
} catch {
    // The hook never fails a tool call.
}
