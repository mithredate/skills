# run

`orchestrate run <dir> ...` starts a `cook` child session for each named initiative. Each note of a child session can start the next child session. The owner answers each question in the child session that asks it, not in the orchestrator session.

A child session **works** while its last note holds no status line and does not say that it waits on the user. A child session with no note yet works.

A step or a build is **ready** when the last status line of its initiative names it and no child session started for it since.

## Turns

These rules of the desktop app held on 2026-11-16. They decide which turn can start a child session.

- An **owner turn** is a turn that the owner starts with a message in the orchestrator session. On it, `start_session` works, also with `cwd`.
- A **wake-up turn** is a turn that the app starts when no child session runs a turn. The app starts it once, and only after a child turn that no person started. On it, `start_session` works for this project. The app refuses a `start_session` with `cwd`.
- A **timer turn** is a turn that the timer of the run starts. On it, the app refuses each `start_session`. It also refuses each `start_session` on a turn that a message of another session starts.
- The note of a turn that the owner starts in a child session waits for the next turn of the orchestrator session.
- After 10 wake-up turns in a row with no owner turn, the app holds the wake-ups.

## Rules

- The orchestrator session reads nothing in the tracker. A `cook` child session reads the index and the open tickets in its own context.
- A step adds one start call and one note to the context of the orchestrator session. Do not read the transcript of a child session.
- Record the initiative of each child session when you start it. Take the initiative of a note from the child session that sent it, not from the text of the note.
- An initiative has one working child session at most. The run has one working `fire` child session at most, because `orchestrate fire` runs one build at a time.
- Never stop a child session. If it is silent, ask it. If it stays silent, notify the owner.

## Start

1. If the session has no `mcp__ccd_session__start_session` tool, tell the owner to use `cook`. Then stop.
2. If the owner names no initiative, ask the owner which initiatives to run. Do not read the index for a list.
3. Read the Repos table in the `AGENTS.md` of this repo. A build starts only in a repo of that table.
4. Find the main checkout of this repo. It is the parent of the directory that `git rev-parse --path-format=absolute --git-common-dir` prints.
5. Start a `cook` child session for each named initiative.

## Start a child session

Call `mcp__ccd_session__start_session` with `initiation: "user_asked"`, because the owner asked for the run. Give a `background` of 80 characters or more that names the run and the initiative. The app refuses a shorter one. End each prompt with `orchestrate run started this session.`

- For a `cook` child session, give the title `cook <dir>`, the prompt `orchestrate cook <dir>`, and the model `opus`. Set `use_worktree: false`, so that its commits land on the branch of the tracker.
- For a `fire` child session, give the title `fire <dir>` and the prompt `orchestrate fire <main checkout> <dir>`. Set `cwd` to the absolute path of `<repo>` in the parent directory of the main checkout. Set `use_worktree: true`. Keep the session model.

If the app refuses a start, send one `PushNotification`. Name the initiative and the start, and ask the owner for one message. Do the start on the next owner turn.

## Notes

The app sends a note each time a child session ends a turn. The note holds the first 400 characters of the report. A child session can end a turn while its background work runs. Its note then holds no result.

Act on each note that came since the last turn:

1. Read the status line only from the first line of the note. That line starts with `Next:`. A note with no status line starts nothing.
2. A status line replaces the ready steps and builds of its initiative.
3. If the Repos table has no row `../<repo>` for a ready build, start nothing for it. Tell the owner in one line.
4. For an `owner needed`, `waiting <who>`, `goal reached`, or `no build` state, start nothing for that initiative. Write one line with the initiative, the state, and a link to the child session.

## Starts

After the notes, start a child session for each initiative with a ready step or build. Skip an initiative that has a working child session.

- Start a build before a step. While a build of an initiative is ready, start no step for it.
- Start a `fire` child session only on an owner turn, and only when no other `fire` child session works.
- Start a `cook` child session for a ready step on an owner turn or a wake-up turn.
- On a turn that is not an owner turn, notify the owner once for each ready build. Do it when no `fire` child session works. Write one line with the initiative and the repo. Send one `PushNotification` that names them and asks the owner for one message.

When no child session works after the starts, notify the owner. Send one `PushNotification` for each initiative that waits for the owner or has `no build`. Name an initiative once for one state. An initiative waits for the owner when its last status line names `owner needed`. It also waits when the last note of its child session says that the session waits on the user.

## Timer

While a child session works, a recurring timer of 30 minutes runs in the orchestrator session. The timer fires only while the orchestrator session is idle.

- When you start a child session and no timer runs, create the timer with `CronCreate`. Give it the prompt `Timer turn. Check the child sessions.` This prompt is not an `orchestrate run` call, so it starts no new run.
- When no child session works after the starts of a turn, delete the timer with `CronDelete`.

A child session is **silent** when it works and its `lastActivityAt` is older than 30 minutes.

On a timer turn:

1. Call `mcp__ccd_session_mgmt__list_sessions` with `linked: true`. It gives `isRunning` and `lastActivityAt` for each child session.
2. If a silent child session gave no answer to the question of the last timer turn, send a `PushNotification`. It holds the title of the child session and the words `no answer`.
3. Ask each other silent child session what it waits for, and since when. Use `SendMessage` with its session id.
4. If an initiative has a ready step or build and no working child session, send one `PushNotification`. Ask the owner for one message.

The answer of a child session comes as a note. Keep it for the next comparison. If the answer names the same work as the last answer of that child session, send a `PushNotification`. It holds the title of the child session and the answer.
