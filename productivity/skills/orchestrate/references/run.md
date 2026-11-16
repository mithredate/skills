# run

`orchestrate run <dir> ...` runs the steps of the named initiatives in child sessions. The owner answers each question in the child session that asks it.

An **orchestrator session** is the session that runs `orchestrate run`. A **child session** is a session that it starts. A **wake-up turn** is a turn that the app starts in the orchestrator session when no child session runs a turn. A **timer turn** is a turn that the timer of the run starts.

## Rules

- The orchestrator session reads nothing in the tracker. A `cook` child session reads the index and the open tickets in its own context.
- A step adds one start call and one note to the context of the orchestrator session. Do not read the transcript of a child session.
- Run only the named initiatives. A status line that names no initiative, or another initiative, starts nothing.
- A child session is **active** until it sends its status line. An initiative has one active child session at most.
- Keep one active `fire` child session at most, because `orchestrate fire` runs one build at a time.
- Never stop a child session. If it is silent, ask it. If it stays silent, notify the owner.

## Start

1. If the session has no `mcp__ccd_session__start_session` tool, tell the user to use `cook`. Then stop.
2. If the user names no initiative, ask the user which initiatives to run. Do not read the index for a list.
3. Start a `cook` child session for each named initiative.

## Start a child session

Call `mcp__ccd_session__start_session` with `initiation: "user_asked"`, because the owner asked for the run. An offer waits for a click.

- For a `cook` child session, give the title `cook <dir>`, the prompt `orchestrate cook <dir>`, and the model `opus`.
- For a `fire` child session, give the title `fire <repo>` and the prompt `orchestrate fire <path of this repo>`. Set `cwd` to the absolute path of `../<repo>`. Set `use_worktree: true`. Keep the session model.

If the app refuses a start, send one `PushNotification` that asks the owner for one message. Do the start when the message comes.

## Notes of child sessions

The app sends a note each time a child session ends a turn. The note holds the first 400 characters of the last report. A child session can end a turn while its background work runs. Its note then holds no status line.

A **pending state** is a `step ready` or `build ready for <repo>` state that has no child session yet. Act on each note:

- A note with no status line starts nothing.
- A status line replaces the pending states of its initiative.
- For `owner needed`, `waiting <who>`, and `goal reached`, start nothing. Write one line with the initiative, the state, and a link to the child session.

Then start a child session for each initiative that has a pending state and no active child session:

- For a build, start a `fire` child session in `../<repo>`. Start a build before a step.
- If another `fire` child session is active, hold the build. Start the step, if it is pending.
- For `step ready`, start the next `cook` child session.

An initiative waits for the owner when its status line names `owner needed`. It also waits when the last note of its child session says that the session waits on the user. On a wake-up turn, if an initiative waits for the owner, send one `PushNotification`. Name each initiative that waits.

## Timer

While a child session is active, a recurring timer of 30 minutes runs in the orchestrator session. The timer fires only while the orchestrator session is idle. On a timer turn, the app refuses `start_session`.

- When you start a child session and no timer runs, create the timer with `CronCreate`. Give it the prompt `orchestrate run timer turn`.
- When no child session is active, delete the timer with `CronDelete`.

A child session is **silent** when all of these facts are true:

- It is active.
- Its `lastActivityAt` is older than 30 minutes.
- It does not wait for the owner.

On a timer turn:

1. Call `mcp__ccd_session_mgmt__list_sessions` with `linked: true`. It gives `isRunning` and `lastActivityAt` for each child session.
2. If a silent child session did not answer the question of the last timer turn, send a `PushNotification`. It holds the title of the child session.
3. Ask each other silent child session what it waits for, and since when. Use `SendMessage` with its session id.
4. If a pending state can start now, send one `PushNotification`. Ask the owner for one message. Do the starts when the message comes.

If the answer of a child session names the same work as its last answer, send a `PushNotification`. It holds the title of the child session and the answer.
