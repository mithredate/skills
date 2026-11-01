import type { On, ToolCallResult } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { changes, instructions, newActivity, parse, summarizeChecks, toSnapshot } from './state.js'
import type { PrJson, Review } from './state.js'

const URL = 'https://github.com/acme/api/pull/74'
const OTHER = 'https://github.com/acme/api/pull/80'
// What a command typed at the prompt carries beside its name and arguments.
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
const COPILOT: Review = { id: 'r1', author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' }

function pr(over: Partial<PrJson> = {}): PrJson {
  return {
    number: 74, title: 'Add export', url: URL, state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED',
    reviews: [], comments: [], statusCheckRollup: [{ status: 'IN_PROGRESS' }], ...over,
  }
}

const WATCH = 'mcp__watch-discussions__watch'
// Three connectors as data: a Teams-shaped one prints one JSON object per text block, HISTORY one indented object,
// and Slack one object whose `messages` string holds the whole thread as text.
const LIST = 'mcp__claude_ai_Microsoft_365__teams_list_channel_messages'
const POST = 'mcp__claude_ai_Microsoft_365__teams_post_reply'
const HISTORY = 'mcp__acme_chat__read_thread'
const SLACK = 'mcp__plugin_slack_slack__slack_read_thread'
const ARGS = { teamId: 'team-0001', channelId: '19:general0001@thread.tacv2', parentMessageId: '1700000000000' }
const READ = { tool: LIST, ...ARGS } as const
const ME = { id: 'user-robin', displayName: 'Robin Vale' }
const SARA = { id: 'user-sara', displayName: 'Sara Lind' }
const AMIN = { id: 'user-amin', displayName: 'Amin Noor' }

function message(id: string, user: { id: string; displayName: string }, bodyPreview = 'The cause is elsewhere.') {
  return { id, replyToId: ARGS.parentMessageId, messageType: 'message', from: { user }, createdDateTime: '2026-10-28T09:15:00Z', bodyPreview }
}

// The thread that Claude's read and the mod's repeat both return. `isReadOnly` is core's mark on Claude's read, and
// `separator` joins the blocks of Claude's read, a newline when absent. `answer` is the user's pick in the mod's
// question. `isFailing` fails every repeat, `isHanging` leaves it unanswered, and `gate` holds it until it resolves.
type Chat = { items: object[]; isReadOnly: boolean; answer: string; separator?: string; isFailing?: boolean; isHanging?: boolean; gate?: Promise<void> }

const chat = (items: object[] = []): Chat => ({ items, isReadOnly: true, answer: 'Run' })

const blocks = (tool: string, items: object[]) =>
  tool === HISTORY ? [JSON.stringify({ ok: true, messages: items }, null, 2)] : items.map(item => JSON.stringify(item))

const refusal = (ran: ToolCallResult) => ran.deny ?? (ran.isError ? ran.text : undefined)

// The world beneath the plugin: gh prints `gh.pr` for any PR and `me` for the user; a read of LIST, HISTORY or SLACK, by
// Claude or by the mod, returns `c.items`; a POST adds Robin's reply and prints it; the question dialog answers
// `c.answer`; repeats, questions, prompts and toasts are recorded.
async function startSession($: Engine, on: On, gh: { pr: PrJson; toolOutput?: string }, c: Chat = chat()) {
  const clock = mock.clock(on)
  mock.store(on)
  const submitted: string[] = []
  const toasts: string[] = []
  const questions: string[] = []
  const repeats: object[] = []
  on('session.id', async () => ({ value: 's1' }))
  on('process.run', async (_$, e) =>
    e.argv.includes('user')
      ? { value: { exitCode: 0, stdout: 'me\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      : { value: { exitCode: 0, stdout: JSON.stringify(gh.pr), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('mcp.call', async (_$, e) => {
    if (c.isHanging) await new Promise<void>(() => {})
    if (c.gate) await c.gate
    const tool = `mcp__${e.server}__${e.tool}`
    if (c.isFailing || (tool !== LIST && tool !== HISTORY && tool !== SLACK)) return { value: { content: [{ type: 'text', text: 'The sign-in expired.' }], isError: true } }
    repeats.push({ server: e.server, tool: e.tool, args: e.args })
    return { value: { content: blocks(tool, c.items).map(text => ({ type: 'text', text })), isError: false } }
  })
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const asked = 'questions' in e ? e.questions : []
    const question = asked[0]?.question ?? ''
    questions.push(question)
    return { result: { questions: asked, answers: { [question]: c.answer } } }
  })
  on('tool.call', async (_$, e) => {
    if (e.tool === POST) {
      const posted = message('1700000000900', ME, 'Posted by Claude.')
      c.items = [...c.items, posted]
      return { result: 'ok', text: JSON.stringify(posted) }
    }
    if (e.tool === LIST || e.tool === HISTORY || e.tool === SLACK) return { result: 'ok', text: blocks(e.tool, c.items).join(c.separator ?? '\n'), ...(c.isReadOnly ? { isReadOnly: true as const } : {}) }
    return { result: 'ok', text: gh.toolOutput ?? URL + '\n' }
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', async (_$, e) => ({ value: { tool: `mcp__watch-discussions__${e.name}` } }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  return { clock, submitted, toasts, questions, repeats }
}

test('summarizes checks', async () => {
  expect(summarizeChecks([])).toBe('none')
  expect(summarizeChecks([{ status: 'IN_PROGRESS' }])).toBe('pending')
  expect(summarizeChecks([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('pass')
  expect(summarizeChecks([{ status: 'COMPLETED', conclusion: 'FAILURE' }, { status: 'IN_PROGRESS' }])).toBe('fail')
})

test('finds a Copilot review, a new decision, and settled checks', async () => {
  const before = toSnapshot(pr(), 0)
  const after = pr({ reviewDecision: 'APPROVED', reviews: [COPILOT], statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] })
  expect(changes(before, toSnapshot(after, 1), newActivity(after, before, 'me'))).toEqual([
    { kind: 'decision', from: 'REVIEW_REQUIRED', to: 'APPROVED' },
    { kind: 'review', author: 'copilot-pull-request-reviewer', state: 'COMMENTED', isCopilot: true },
    { kind: 'checks', to: 'pass' },
  ])
})

test('reports a merge once', async () => {
  const none = { reviews: [], comments: [] }
  const merged = toSnapshot(pr({ state: 'MERGED' }), 1)
  expect(changes(toSnapshot(pr(), 0), merged, none)).toEqual([{ kind: 'merged' }])
  expect(changes(merged, merged, none)).toEqual([])
})

test("ignores the user's own reviews and comments, reports a person's", async () => {
  const before = toSnapshot(pr(), 0)
  const after = pr({
    reviews: [{ id: 'r1', author: { login: 'me' }, state: 'COMMENTED' }, { id: 'r2', author: { login: 'amin' }, state: 'CHANGES_REQUESTED' }],
    comments: [{ id: 'c1', author: { login: 'me' } }, { id: 'c2', author: { login: 'sara' } }],
  })
  expect(changes(before, toSnapshot(after, 1), newActivity(after, before, 'me'))).toEqual([
    { kind: 'review', author: 'amin', state: 'CHANGES_REQUESTED', isCopilot: false },
    { kind: 'comment', author: 'sara' },
  ])
})

test("counts only Copilot while the user's login is unknown", async () => {
  const before = toSnapshot(pr(), 0)
  const after = pr({ reviews: [COPILOT], comments: [{ id: 'c1', author: { login: 'me' } }] })
  expect(newActivity(after, before, '')).toEqual({ reviews: [COPILOT], comments: [] })
})

test('tells Claude where to read a person\'s comments', async () => {
  const { steps } = instructions(toSnapshot(pr(), 0), [{ kind: 'comment', author: 'sara' }], 1)
  expect(steps.join('\n')).toContain(`gh pr view ${URL} --comments`)
  expect(steps.join('\n')).toContain('gh api repos/acme/api/pulls/74/comments')
})

test("asks the user before it posts a reply to a person's review", async () => {
  const { steps } = instructions(toSnapshot(pr(), 0), [{ kind: 'review', author: 'amin', state: 'CHANGES_REQUESTED', isCopilot: false }], 1)
  expect(steps.join('\n')).toContain('draft a reply with the reason, and post it only after the user agrees')
})

test("resolves each Copilot thread before it re-requests Copilot's review", async () => {
  const { steps } = instructions(toSnapshot(pr(), 0), [{ kind: 'review', author: 'copilot-pull-request-reviewer', state: 'COMMENTED', isCopilot: true }], 1)
  expect(steps.join('\n')).toContain("resolve each thread, then re-request Copilot's review")
})

test('stops acting on a PR after the turn cap, except for its merge', async () => {
  const snap = toSnapshot(pr(), 0)
  const capped = instructions(snap, [{ kind: 'checks', to: 'fail' }], 6)
  expect(capped.steps).toEqual([])
  expect(capped.what).toContain('started 5 turns')
  expect(instructions(snap, [{ kind: 'merged' }], 6).steps.length).toBe(1)
})

test('watches a PR that gh opens, and starts a turn for Copilot and for a person', async ($, on) => {
  const gh = { pr: pr() }
  const { clock, submitted } = await startSession($, on, gh)

  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  const listed = await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })
  expect(listed.text).toContain('#74 review required · checks pending')

  gh.pr = pr({ reviews: [COPILOT] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Copilot reviewed')

  gh.pr = pr({ reviews: [COPILOT], comments: [{ id: 'c1', author: { login: 'sara' } }] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(2)
  expect(submitted[1]).toContain('sara commented')

  gh.pr = pr({ reviewDecision: 'APPROVED', reviews: [COPILOT], comments: [{ id: 'c1', author: { login: 'sara' } }] })
  const typed = await $.prompt.submit({ text: 'is it approved?', wait: false, origin: { kind: 'composer' } })
  const context = (typed.context ?? []).join('\n')
  expect(context).toContain('review decision APPROVED')
  expect(context).toContain('review decision is now APPROVED')
})

test('skips polls during a turn, so a failure fixed in that turn is never reported', async ($, on) => {
  const gh = { pr: pr() }
  const { clock, submitted } = await startSession($, on, gh)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  await $.turn.start({ text: 'fix CI', turnId: 't1' })
  gh.pr = pr({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] })
  await clock.advance(60_000)
  gh.pr = pr({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] })
  await $.turn.complete({ turnId: 't1', answer: 'fixed', reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.advance(60_000)
  expect(submitted).toEqual([])
})

test('watches the PR that gh pr create opens, and not a PR that another gh command names', async ($, on) => {
  const gh = { pr: pr(), toolOutput: `${OTHER}\n` }
  await startSession($, on, gh)
  await $.tool.call({ tool: 'Bash', command: `gh pr view ${OTHER}` })
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')

  gh.toolOutput = `${URL}\n`
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toBe(`1. #74 review required · checks pending  ${URL}`)
})

test('watches a PR that Claude passes to watch', async ($, on) => {
  await startSession($, on, { pr: pr() })
  expect(refusal(await $.tool.call({ tool: WATCH, url: URL }))).toBeUndefined()
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toBe(`1. #74 review required · checks pending  ${URL}`)
})

test('starts no turn for a merge this session ran, even with no PR named, and still shows a toast', async ($, on) => {
  const gh = { pr: pr() }
  const { clock, submitted, toasts } = await startSession($, on, gh)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  gh.pr = pr({ state: 'MERGED' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge --squash --delete-branch' })
  await clock.advance(60_000)
  expect(submitted).toEqual([])
  expect(toasts).toContain('#74 was merged')
})

test("leaves the merge step out of the user's own turn after a merge this session ran", async ($, on) => {
  const gh = { pr: pr() }
  await startSession($, on, gh)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  gh.pr = pr({ state: 'MERGED' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 74 --squash' })
  const typed = await $.prompt.submit({ text: 'what next?', wait: false, origin: { kind: 'composer' } })
  const context = (typed.context ?? []).join('\n')
  expect(context).toContain('was merged')
  expect(context).not.toContain('Remove the merged worktree')
})

test('starts a turn when a merge this session asked for lands later, as with --auto', async ($, on) => {
  const gh = { pr: pr() }
  const { clock, submitted } = await startSession($, on, gh)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  await $.tool.call({ tool: 'Bash', command: 'gh pr merge 74 --auto --squash' })
  gh.pr = pr({ state: 'MERGED' })
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Remove the merged worktree and its local branch.')
  expect(submitted[0]?.endsWith('If nothing is left to do, reply in one line.')).toBe(true)
})

test("puts a new item of a watched call into the main loop's next tool result, once, and never into a subagent's", async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, submitted, questions, repeats } = await startSession($, on, { pr: pr() }, c)
  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  await $.tool.call(READ)
  const { parentMessageId, ...rest } = ARGS
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: { parentMessageId, ...rest } }))).toBeUndefined()
  expect(questions).toEqual([])

  c.items = [...c.items, message('1700000000200', SARA)]
  await clock.advance(60_000)
  expect(repeats).toEqual([{ server: 'claude_ai_Microsoft_365', tool: 'teams_list_channel_messages', args: ARGS }])
  expect((await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' })).context ?? []).toEqual([])
  const news = (await $.tool.call({ tool: 'Bash', command: 'ls' })).context ?? []
  expect(news.length).toBe(1)
  expect(news[0]).toContain(`${LIST} ${JSON.stringify(ARGS)}`)
  expect(news[0]).toContain('"id":"1700000000200"')
  expect(news[0]).toContain('Sara Lind')
  expect(news[0]).not.toContain('1700000000100')
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).context ?? []).toEqual([])
  expect(submitted).toEqual([])
  await $.turn.complete({ turnId: 't1', answer: 'done', reason: 'answer', isAborted: false, durationMs: 1 })
})

test('reports an item that arrived between the read and the watch at the first check, by its ts at any depth', async ($, on) => {
  const input = { channel: 'C-crew', thread: '1700000000.000100' }
  const c = chat([{ ts: '1700000000.000100', user: 'U-amin', text: 'Is it the cache?' }])
  const { clock, submitted } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call({ tool: HISTORY, ...input })
  c.items = [...c.items, { ts: '1700000000.000200', user: 'U-sara', text: 'It is not the cache.' }]
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: HISTORY, input }))).toBeUndefined()

  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain(`${HISTORY} ${JSON.stringify(input)}`)
  expect(submitted[0]).toContain('It is not the cache.')
  expect(submitted[0]).not.toContain('Is it the cache?')
})

test('watches a Slack thread by the ts in its text, and reports each new reply once as its own item, without the old messages or an edit of one', async ($, on) => {
  const input = { channel_id: 'C-crew', message_ts: '1700000000.000100' }
  const c = chat([{
    messages:
      '=== THREAD PARENT MESSAGE ===\nFrom: Sara Lind <sara@example.com> (U-sara)\nTime: 2026-10-04 04:10:16 CEST\nMessage TS: 1700000000.000100\nIs it the cache?\n\n' +
      '=== THREAD REPLIES (1 total) ===\n\n' +
      '--- Reply 1 of 1 ---\nFrom: Amin Noor <amin@example.com> (U-amin)\nTime: 2026-10-20 17:37:30 CEST\nMessage TS: 1700000000.000200\nIt is not the cache.\n\nThe queue is full.\nFiles: image.png (ID: F-0001, image/png, 356.9 KB)\n',
    pagination_info: 'There are no more messages in this thread.\n',
  }])
  const { clock, submitted } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call({ tool: SLACK, ...input })
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: SLACK, input }))).toBeUndefined()

  // Reply 1 gets an edit: a `TS:` label inside its text, a new file `ID:`, and a reaction. None of them is news.
  // Replies 2 and 3 are new.
  c.items = [{
    messages:
      '=== THREAD PARENT MESSAGE ===\nFrom: Sara Lind <sara@example.com> (U-sara)\nTime: 2026-10-04 04:10:16 CEST\nMessage TS: 1700000000.000100\nIs it the cache?\n\n' +
      '=== THREAD REPLIES (3 total) ===\n\n' +
      '--- Reply 1 of 3 ---\nFrom: Amin Noor <amin@example.com> (U-amin)\nTime: 2026-10-20 17:37:30 CEST\nMessage TS: 1700000000.000200\nIt is not the cache.\n\nThe queue is full.\nSee TS: 5.4 in the log.\nFiles: image.png (ID: F-0002, image/png, 356.9 KB)\nReactions: eyes (1)\n\n' +
      '--- Reply 2 of 3 ---\nFrom: Robin Vale <robin@example.com> (U-robin)\nTime: 2026-10-21 09:00:00 CEST\nMessage TS: 1700000000.000300\nThe queue drains now.\n\nIt took 4 s.\n\n' +
      '--- Reply 3 of 3 ---\nFrom: Lea Park <lea@example.com> (U-lea)\nTime: 2026-10-21 09:05:00 CEST\nMessage TS: 1700000000.000400\nThanks, closing this.\n',
    pagination_info: 'There are no more messages in this thread.\n',
  }]
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('returned 2 new items')
  expect(submitted[0]).toContain('From: Robin Vale')
  expect(submitted[0]).toContain('The queue drains now.')
  expect(submitted[0]).toContain('From: Lea Park')
  expect(submitted[0]).toContain('Thanks, closing this.')
  const reply2 = submitted[0].split('\n').find(line => line.includes('"ts":"1700000000.000300"'))
  expect(reply2).toContain('The queue drains now.')
  expect(reply2).toContain('It took 4 s.')
  expect(reply2).not.toContain('Thanks, closing this.')
  expect(submitted[0]).not.toContain('Is it the cache?')
  expect(submitted[0]).not.toContain('It is not the cache.')
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
})

test('refuses a watch from a subagent, of a call the main session did not make, and of a result with no id or ts', async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  await startSession($, on, { pr: pr() }, c)
  await $.tool.call({ ...READ, agentId: 'agent-1' })
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS }))).toContain('did not make')

  await $.tool.call(READ)
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS, agentId: 'agent-1' }))).toContain('only the main session')
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: { ...ARGS, parentMessageId: '1700000000999' } }))).toContain('did not make')

  const empty = { ...ARGS, parentMessageId: '1700000000300' }
  c.items = [{ text: 'No messages.' }]
  await $.tool.call({ tool: LIST, ...empty })
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: empty }))).toContain('no id or ts')
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')
})

test('refuses a watch when 20 items are watched', async ($, on) => {
  await startSession($, on, { pr: pr() })
  for (let i = 1; i <= 20; i++) expect(refusal(await $.tool.call({ tool: WATCH, url: `https://github.com/acme/api/pull/${i}` }))).toBeUndefined()
  expect(refusal(await $.tool.call({ tool: WATCH, url: OTHER }))).toContain('20 items')
})

test('asks before it repeats a call that core does not mark read-only, and watches it only on Run', async ($, on) => {
  const c = { ...chat([message('1700000000100', AMIN)]), isReadOnly: false, answer: 'Cancel' }
  const { questions } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS }))).toContain('the user cancelled')
  expect(questions.length).toBe(1)
  expect(questions[0]).toContain(`${LIST} ${JSON.stringify(ARGS)}`)
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')

  c.answer = 'Run'
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS }))).toBeUndefined()
  expect(questions.length).toBe(2)
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain(`1. ${LIST}`)
})

test("reports the user's own reply and Claude's post, once, but not an edit", async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, submitted } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })
  c.items = c.items.map(item => ({ ...item, bodyPreview: 'Edited: the cause is elsewhere.' }))
  await clock.advance(60_000)
  expect(submitted).toEqual([])

  c.items = [...c.items, message('1700000000300', ME, 'I checked it myself.')]
  await $.tool.call({ tool: POST, ...ARGS, content: 'Posted by Claude.' })
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('I checked it myself.')
  expect(submitted[0]).toContain('Posted by Claude.')
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
})

test('reports a reply that a call to the same server, not marked read-only, returned before the check', async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, submitted } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })
  c.items = [...c.items, message('1700000000200', SARA)]
  c.isReadOnly = false
  await $.tool.call({ ...READ, agentId: 'agent-1' })

  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Sara Lind')
})

test('watches a read whose blocks are joined with no separator, and reports only the new items', async ($, on) => {
  const c = { ...chat([message('1700000000100', AMIN), message('1700000000110', ME, 'Looking into it.')]), separator: '' }
  const { clock, submitted } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS }))).toBeUndefined()
  c.items = [...c.items, message('1700000000200', SARA), message('1700000000210', AMIN, 'Agreed, it is not the cache.')]

  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('returned 2 new items')
  expect(submitted[0]).toContain('Agreed, it is not the cache.')
  expect(submitted[0]).not.toContain('Looking into it.')
})

test('starts a turn on news while idle, and only shows a toast from the sixth turn for one call', async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, submitted, toasts } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })

  for (let i = 1; i <= 6; i++) {
    c.items = [...c.items, message(`17000000010${i}0`, SARA)]
    await clock.advance(60_000)
  }
  expect(submitted.length).toBe(5)
  expect(submitted[0]).toContain(`${LIST} ${JSON.stringify(ARGS)}`)
  expect(submitted[0]?.endsWith('If nothing is left to do, reply in one line.')).toBe(true)
  expect(toasts.length).toBe(6)
  expect(toasts[5]).toContain('started 5 turns')
})

test('ends a hung repeat after 20 seconds with one toast for the streak, keeps the call, and resumes once a repeat works', async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, submitted, toasts } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })

  c.isHanging = true
  c.items = [...c.items, message('1700000000200', SARA)]
  await clock.advance(60_000)
  await clock.advance(19_000)
  expect(toasts).toEqual([])
  await clock.advance(1_000)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('could not repeat')
  await clock.advance(60_000)
  expect(toasts.length).toBe(1)
  expect(submitted).toEqual([])

  c.isHanging = false
  await clock.advance(40_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Sara Lind')
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain(`1. ${LIST}`)
})

test('polls PRs on time while a repeat hangs', async ($, on) => {
  const gh = { pr: pr() }
  const c = chat([message('1700000000100', AMIN)])
  const { clock, submitted } = await startSession($, on, gh, c)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })

  c.isHanging = true
  gh.pr = pr({ reviews: [COPILOT] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Copilot reviewed')
})

test('/unwatch-discussions 1 stops item 1, also while its repeat waits on the connector', async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, submitted } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain(`1. ${LIST} ${JSON.stringify(ARGS)}`)

  let release = () => {}
  c.gate = new Promise<void>(resolve => (release = () => resolve()))
  c.items = [...c.items, message('1700000000200', SARA)]
  await clock.advance(60_000)
  await $.command.run({ command: 'unwatch-discussions', args: '1', ...TYPED })
  release()
  await clock.advance(60_000)
  expect(submitted).toEqual([])
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')
})

test("puts each watched item's live state and the news a turn missed into the user's next prompt, once", async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })
  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  c.items = [...c.items, message('1700000000200', SARA)]
  await clock.advance(60_000)
  await $.turn.complete({ turnId: 't1', answer: 'done', reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.advance(30_000)

  const typed = ((await $.prompt.submit({ text: 'what next?', wait: false, origin: { kind: 'composer' } })).context ?? []).join('\n')
  expect(typed).toContain(`- ${URL} "Add export": OPEN`)
  expect(typed).toContain(`- ${LIST} ${JSON.stringify(ARGS)} (checked 30s ago)`)
  expect(typed).toContain(`Since the last check, the watched call ${LIST} ${JSON.stringify(ARGS)} returned 1 new item`)
  expect(typed).toContain('Sara Lind')
  const again = ((await $.prompt.submit({ text: 'and now?', wait: false, origin: { kind: 'composer' } })).context ?? []).join('\n')
  expect(again).toContain(`- ${LIST} ${JSON.stringify(ARGS)}`)
  expect(again).not.toContain('Since the last check')
})

test('reads JSON values that follow each other with no separator, and keeps a }{ or an escaped quote inside a string', async () => {
  const a = message('1700000000100', AMIN, 'The log shows "}{" where the cause was.')
  const b = message('1700000000200', SARA, 'The log is in C:\\')
  const c = { ts: '1700000000.000300' }
  expect(parse([JSON.stringify(a) + JSON.stringify(b) + '\n ' + JSON.stringify(c)])).toEqual([a, b, c])
})

test("keeps news out of the mod's own question, so it reaches the main loop's next tool call", async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, questions } = await startSession($, on, { pr: pr() }, c)
  const other = { ...ARGS, parentMessageId: '1700000000500' }
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })
  c.isReadOnly = false
  await $.tool.call({ tool: LIST, ...other })
  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  c.items = [...c.items, message('1700000000200', SARA)]
  await clock.advance(60_000)

  expect(refusal(await $.tool.call({ tool: WATCH, toolName: LIST, input: other }))).toBeUndefined()
  expect(questions.length).toBe(1)
  const news = (await $.tool.call({ tool: 'Bash', command: 'ls' })).context ?? []
  expect(news.length).toBe(1)
  expect(news[0]).toContain('Sara Lind')
  await $.turn.complete({ turnId: 't1', answer: 'done', reason: 'answer', isAborted: false, durationMs: 1 })
})

test('tells the user and Claude why gh pr create opened a PR that cannot join the watch', async ($, on) => {
  const { toasts } = await startSession($, on, { pr: pr(), toolOutput: `${OTHER}\n` })
  for (let i = 1; i <= 20; i++) await $.tool.call({ tool: WATCH, url: `https://github.com/acme/api/pull/${i}` })
  const ran = await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain(`could not watch ${OTHER}`)
  expect(toasts[0]).toContain('20 items')
  expect(toasts[0]).not.toContain('The user can stop one')
  const context = (ran.context ?? []).join('\n')
  expect(context).toContain(`could not watch ${OTHER}`)
  expect(context).toContain('20 items')
})

test('starts a new failure streak, with its own toast, after /unwatch-discussions all', async ($, on) => {
  const c = chat([message('1700000000100', AMIN)])
  const { clock, toasts } = await startSession($, on, { pr: pr() }, c)
  await $.tool.call(READ)
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })
  c.isFailing = true
  await clock.advance(60_000)
  expect(toasts.length).toBe(1)

  await $.command.run({ command: 'unwatch-discussions', args: 'all', ...TYPED })
  await $.tool.call({ tool: WATCH, toolName: LIST, input: ARGS })
  await clock.advance(60_000)
  expect(toasts.length).toBe(2)
  expect(toasts[1]).toContain('could not repeat')
})
