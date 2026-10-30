PR title: fix(watch-discussions): watch only what Claude passes to a watch tool, and repeat any connector call

## Brief

- Why: A session reads a discussion, and other people reply while the session works. The session never sees those replies, so it acts on old facts. On 2026-10-28 a session read a Teams thread at 08:59 UTC. At 09:15 the reporter said the suspected cause was wrong. At 09:20, inside the same turn, the session opened a PR built on that cause. The mod also picks what to watch by itself. It watches every PR that a `gh` command names, so unrelated PRs start turns in the user's session. The first build of PR 109 added the same automatic pick for Teams threads, with Teams-only code.
- Goal: The `watch-discussions` mod watches only what Claude picks with a `watch` tool, plus each PR that the session opens. A watched item is a PR or any connector read. A new item reaches the main session at its next tool call, also during a turn.
- Targets: `mithredate-skills`, base branch `main`. Rework the existing branch `feat/watch-discussions` and its draft PR https://github.com/mithredate/skills/pull/109.
- Decisions:
  - Claude picks what to watch through a `watch` tool that the mod registers. Nothing joins by itself, except a PR that the session opens with `gh pr create`. Because: the user does not want the mod to pick, and `fire` depends on its own PR being watched.
  - Only the main session can call `watch`. Because: the main session holds the task.
  - A connector call is repeated without a question only when core marks it read-only. For any other call, the mod asks the user once, Run or Cancel. Because: a repeated write would post every minute, and no one has confirmed that the Microsoft 365 connector declares its reads read-only.
  - News is an `id` or `ts` value, at any depth of the result, that the baseline does not have. An edit keeps its ID, so it is not news. Hypothesis: Teams replies, Slack messages, Jira comments, and GitHub comments all carry one. Check: the first watch of each source.
  - A reply by the user is news. A post by Claude is not: the `id` and `ts` values in the result of Claude's own write call to the same server join the baseline. Because: the user asked for their own replies, and a new read after the write would also hide another person's reply from that moment.
  - The mod never repeats a shell command. The PR part keeps its own `gh` calls.
  - The rename to `watch-discussions`, the delivery during a turn, the cap of 5 turns per item, the 20-second limit per call, and the one toast per failure streak from the first build of PR 109 stay.
- FR:
  - The mod registers a tool `watch`. Its description tells Claude to watch only a discussion that the task depends on, such as a thread, an issue, or a PR that the user gave or that the task acts on. It also tells Claude never to watch a page that it read only for reference.
  - `watch` with a PR URL watches that PR with the PR rules of today.
  - `watch` with the tool name and input of a connector call watches that call. The main session must have made that call in this session. The baseline is the result of that call, so a reply that arrived between the read and the `watch` call is news at the first check.
  - `watch` refuses, and gives the reason, when a subagent calls it, when the call was not made in this session, when the user cancels, when the result has no `id` or `ts` value, or when 20 items are watched.
  - A PR that the session opens with `gh pr create` is watched. A `gh` command that names another PR does not add it. A connector read does not add anything by itself.
  - Every 60 seconds, also while a turn runs, the mod repeats each watched connector call and finds the news.
  - The news text names the watched call and holds the new items, cut to a fixed size, and it gives the call to repeat for the full text. During a turn, it goes into the next tool result of the main loop, once, and never into a subagent's. When the session is idle, it starts a turn. After 5 turns for one item, the mod only shows a toast. A prompt that the user types carries the news and one live-state row for each watched item.
  - A call that fails or passes 20 seconds counts as a failed check. The mod shows one toast per failure streak and keeps the item watched. A later check that works resumes normally.
  - `/watch-discussions` lists each watched item with a number. `/unwatch-discussions <number|all>` stops it.
  - The PR rules for Copilot reviews, reviews and comments from other people, checks, and merges stay as they are. PR polls do not wait on a connector call.
- NFR:
  - No new runtime dependency.
  - No code for one source. The mod holds no connector name, tool name, or link format of Teams, Slack, or another source. The Teams-only code of the first build goes. Tests can use such names as data.
  - At most one repeat of each watched call per minute.
  - Tests use invented IDs and names, never real tenant IDs or real people.
  - `plugin.json` stays at 0.1.3, because no version of `watch-discussions` has shipped. The `README.md` line and the `marketplace.json` description state the new behavior.
- Verification:
  - Write the failing mod tests first, in their own commit. They prove these rules:
    1. `gh pr create` watches its PR, and `gh pr view` of another PR watches nothing.
    2. A `watch` of a connector call that the main session made reports a new item in the next tool result of the main loop, once. A tool result of a subagent gets nothing.
    3. An item that arrived between the read and the `watch` call is news at the first check.
    4. `watch` refuses a call from a subagent, a call that was not made, and a result with no `id` or `ts`.
    5. A call that core does not mark read-only asks the user. Cancel refuses the watch, and Run watches it.
    6. An item whose ID came from Claude's own write to the same server is not news. An item by the user is news. An edit is not news.
    7. An idle session starts a turn, and the sixth turn for one item is only a toast.
    8. A hung call returns after 20 seconds, with one toast, and a later check resumes.
    9. `/unwatch-discussions 1` stops item 1.
  - `command claude plugin test watch-discussions` passes.
  - `./scripts/validate.sh` passes.
  - After `validate.sh`, lay the types and run `npx --yes -p typescript@7.0.2 tsc -p watch-discussions`. It passes.
  - The user runs the live check after the install. In a new session, Claude reads a Teams thread for a task and calls `watch`. Another person replies, and the reply reaches Claude at its next tool call.

