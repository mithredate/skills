PR title: feat(watch-discussions): rename watch-prs and watch the Teams threads a session reads

## Brief

- Why: A session reads a Teams channel thread, and then other people reply while the session works. The session never sees those replies, so it acts on old facts until the user tells it to read again. On 2026-10-28, a session read a thread at 08:59 UTC. At 09:15 the reporter replied that the suspected cause was wrong. At 09:20, inside the same 10-minute turn, the session opened a PR built on that cause.
- Goal: The `watch-prs` mod is renamed to `watch-discussions`. It watches each Teams channel thread that a session reads, as well as PRs. A new reply from another person reaches the main session at its next tool call, mid-turn too.
- Targets: `mithredate-skills`, base branch `main`.
- Decisions:
  - Teams channel threads only. Jira issues, GitHub issues, Slack, and Teams chats stay unbuilt. Because: the user chose the smallest scope, and the connector has no tool that lists the messages of a chat.
  - Rename the plugin to `watch-discussions`, and the commands to `/watch-discussions` and `/unwatch-discussions`. Because: the user chose a name that says what the mod does, at the cost of one reinstall per machine.
  - News found during a turn goes into the main loop's next tool result as `context`, not into a subagent's. Because: the user confirmed it, and a turn that starts only once the session is idle came after the PR in the 2026-10-28 case.
  - A thread joins the watch when the session reads it with the Microsoft 365 connector. A Teams link in a prompt that no tool reads does not join.
  - News is a new reply from anyone but the user. An edit or a reaction is not news. Because: Claude can post as the user, so the user's own replies can loop. This is the same rule as for PR comments.
  - PR behavior stays as it is, with no mid-turn delivery for PRs.
- FR:
  - When the main session or a subagent calls `teams_list_channel_messages` with `parentMessageId`, the mod watches that thread. A `read_resource` call on a `teams:///teams/{teamId}/channels/{channelId}/messages/{messageId}` URI does the same. If the URI names a reply, the mod watches the thread of that reply.
  - Every 60 seconds the mod checks each watched thread for replies that the last check did not have. The checks continue while a turn runs.
  - A reply from the user does not count. The user is the account that `get_me` on the `claude.ai Microsoft 365` server returns.
  - When a check finds news during a turn, the next tool result of the main loop carries one `context` text. A tool result of a subagent carries none. Each piece of news is delivered once.
  - The news text names the thread, and the author and time of each new reply. It gives the exact `teams_list_channel_messages` arguments to read the replies. It says to read a full body with `read_resource` when the preview is truncated. It tells Claude to check whether the replies change a fact or a decision that the session acted on. If they do, Claude tells the user and changes course before its next step outside the session, for example a push, a PR, or a message.
  - When the session is idle, news about a thread starts a turn with the same text. After 5 such turns for one thread, the mod only shows a toast.
  - A prompt that the user types carries the news since the last check. Its live-state block lists each watched thread with its reply count and the age of the last check.
  - If a check fails, for example because the Microsoft 365 sign-in expired, the mod shows one toast and starts no turn. The thread stays watched, and a later check that works resumes normally.
  - `/watch-discussions` with no argument lists the watched PRs and threads. `/watch-discussions <Teams link>` watches that thread, also after an unwatch. `/unwatch-discussions <PR URL | Teams link | all>` stops the watch.
  - The limit of 20 watched items counts PRs and threads together.
  - Every PR behavior of today's `watch-prs` works the same under the new name.
- NFR:
  - No new runtime dependency. The mod reads Teams through `$.mcp.call` on the `claude.ai Microsoft 365` server.
  - At most one connector call per watched thread per minute, and one `get_me` per session.
  - The rename uses `git mv`. It updates the plugin entry in `.claude-plugin/marketplace.json`, the plugin line in `README.md`, and the mod example in `AGENTS.md`. `plugin.json` goes to version 0.1.3.
  - Tests use invented team, channel, message, and user IDs and names, not the IDs of a real tenant or real people.
  - Mod tests and the mod type check skip in GitHub Actions. The local run is the gate.
- Verification:
  - Write the failing mod tests first. They prove the FR rules in this order:
    1. After a fake `teams_list_channel_messages` call, a new reply from another user puts `context` on the next main-loop tool result.
    2. A tool call that carries an `agentId` gets no `context`.
    3. A reply from the user's own `get_me` id starts nothing.
    4. An idle session starts a turn, and the sixth turn for one thread is only a toast.
    5. A failed connector call shows one toast.
    6. `/watch-discussions` and `/unwatch-discussions` take a Teams link.
  - `command claude plugin test watch-discussions` passes. Use `command`, because a shell alias breaks plain `claude plugin test`.
  - `./scripts/validate.sh` passes.
  - After `validate.sh`, never before, run the type check by hand. In the sandbox, `validate.sh` deletes the laid types and skips the check. Copy a `.claude-plugin/types/` folder into the mod. Put the current build's `claude-code.d.ts` from `/private/tmp/claude-501/bundled-skills/<version>/<hash>/plugin-authoring/types/` at `claude-code/index.d.ts`. Then run `npx --yes -p typescript@7.0.2 tsc -p watch-discussions`, and make sure it passes.
  - The PR body tells the user to enable `watch-discussions@skills` and remove `watch-prs@skills` on both machines. A live check needs another person to reply in a thread, so the user runs it after the install.

