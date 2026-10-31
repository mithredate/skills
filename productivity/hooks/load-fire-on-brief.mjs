import { readFileSync } from 'node:fs';

let data = '';
for await (const chunk of process.stdin) data += chunk;

const event = JSON.parse(data || '{}');
const input = event.tool_input ?? {};
const path = input.file_path ?? '';

const BRIEF = /^## Brief$/m;
const BRIEF_FILE = /\/scratchpad\/brief\.md$/;
// The orchestrator repo can name its tracker `wayfinder/` or `.wayfinder/`.
const TRACKER_BRIEF = /\/\.?wayfinder\/briefs\/[^/]+\.md$/;
const READY = /^status:[ \t]*ready[ \t]*$/m;
const IN_PROGRESS = /^status:[ \t]*in-progress[ \t]*$/m;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

// A claim is an Edit from `ready` to `in-progress` that leaves the frontmatter, not a body line, at `in-progress`.
const claimsBrief = () => event.tool_name === 'Edit'
    && TRACKER_BRIEF.test(path)
    && READY.test(input.old_string ?? '')
    && IN_PROGRESS.test(input.new_string ?? '')
    && IN_PROGRESS.test(readFileSync(path, 'utf8').match(FRONTMATTER)?.[1] ?? '');

let context = '';
if (BRIEF_FILE.test(path) && BRIEF.test(input.content ?? '')) {
    context = 'Before your next tool call, call the Skill tool with: dev:fire.';
} else if (claimsBrief()) {
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
