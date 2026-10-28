import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { changes, instructions, newActivity, summarizeChecks, toSnapshot } from './state.js'
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

const TEAM = 'team-0001'
const CHANNEL = '19:general0001@thread.tacv2'
const ROOT = '1700000000000'
const THREAD = `teams:///teams/${TEAM}/channels/${CHANNEL}/messages/${ROOT}`
const LIST = 'mcp__claude_ai_Microsoft_365__teams_list_channel_messages'
const READ_ARGS = { tool: LIST, teamId: TEAM, channelId: CHANNEL, parentMessageId: ROOT } as const
const ME = { userId: 'user-robin', displayName: 'Robin Vale' }
const SARA = { userId: 'user-sara', displayName: 'Sara Lind' }
const AMIN = { userId: 'user-amin', displayName: 'Amin Noor' }
// A link to a reply: the path names the reply, `parentMessageId` the thread, and the channel ID is URL-encoded.
const LINK = `https://teams.microsoft.com/l/message/${encodeURIComponent(CHANNEL)}/1700000000500?tenantId=tenant-0001&groupId=${TEAM}&parentMessageId=${ROOT}&teamName=Crew&channelName=General&createdTime=1700000000500`

function reply(id: string, from: { userId: string; displayName: string }) {
  return {
    id, replyToId: ROOT, messageType: 'message', from, createdDateTime: '2026-10-28T09:15:00Z', lastModifiedDateTime: '2026-10-28T09:15:00Z',
    bodyPreview: 'The cause is elsewhere.', bodyTruncated: false, webUrl: `https://teams.microsoft.com/l/message/${CHANNEL}/${id}`,
  }
}

// `isFailing` fails every connector call, `failingTool` only that tool's, `isHanging` leaves every call unanswered,
// and `gate` holds every call until it resolves.
type Teams = { replies: object[]; isFailing?: boolean; failingTool?: string; isHanging?: boolean; gate?: Promise<void> }

// The world beneath the plugin: gh prints `pr` for any PR and `me` for the user; the Microsoft 365 connector lists
// `teams.replies` for the thread ROOT, one JSON object per block, and `get_me` is Robin; prompts and toasts are recorded.
async function startSession($: Engine, on: On, gh: { pr: PrJson; toolOutput?: string }, teams: Teams = { replies: [] }) {
  const clock = mock.clock(on)
  mock.store(on)
  const submitted: string[] = []
  const toasts: string[] = []
  on('session.id', async () => ({ value: 's1' }))
  on('process.run', async (_$, e) =>
    e.argv.includes('user')
      ? { value: { exitCode: 0, stdout: 'me\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      : { value: { exitCode: 0, stdout: JSON.stringify(gh.pr), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('mcp.call', async (_$, e) => {
    if (teams.isHanging) await new Promise<void>(() => {})
    if (teams.gate) await teams.gate
    if (teams.isFailing || e.tool === teams.failingTool) return { value: { content: [{ type: 'text', text: 'The sign-in expired.' }], isError: true } }
    const items = e.tool === 'get_me'
      ? [{ id: ME.userId, displayName: ME.displayName, mail: 'robin@example.com', userPrincipalName: 'robin@example.com' }]
      : e.args.parentMessageId === ROOT ? teams.replies : []
    return { value: { content: items.map(item => ({ type: 'text', text: JSON.stringify(item) })), isError: false } }
  })
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('tool.call', async (_$, e) => ({ result: 'ok', text: e.tool.endsWith('read_resource') ? JSON.stringify(reply('1700000000500', SARA)) : gh.toolOutput ?? URL + '\n' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  return { clock, submitted, toasts }
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

test('watches only the PR a command names, and keeps an unwatched PR unwatched', async ($, on) => {
  const gh = { pr: pr(), toolOutput: `${URL}\n${OTHER}\n` }
  await startSession($, on, gh)

  await $.tool.call({ tool: 'Bash', command: 'gh pr list --json url' })
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')

  await $.tool.call({ tool: 'Bash', command: `gh pr view ${URL}` })
  await $.command.run({ command: 'unwatch-discussions', args: URL, ...TYPED })
  await $.tool.call({ tool: 'Bash', command: `gh pr view ${URL}` })
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')
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

test("puts another person's reply into the main loop's next tool result, mid-turn, once", async ($, on) => {
  const teams: Teams = { replies: [reply('1700000000100', ME)] }
  const { clock, submitted } = await startSession($, on, { pr: pr() }, teams)
  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  await $.tool.call(READ_ARGS)

  teams.replies = [reply('1700000000200', SARA), ...teams.replies]
  await clock.advance(60_000)
  const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(ran.context?.length).toBe(1)
  const news = ran.context?.[0] ?? ''
  expect(news).toContain(THREAD)
  expect(news).toContain('Sara Lind at 2026-10-28T09:15:00Z')
  expect(news).toContain(`teams_list_channel_messages ${JSON.stringify({ teamId: TEAM, channelId: CHANNEL, parentMessageId: ROOT })}`)
  expect(news).toContain('read_resource')
  expect(news).toContain('change course')
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).context ?? []).toEqual([])
  expect(submitted).toEqual([])
  await $.turn.complete({ turnId: 't1', answer: 'done', reason: 'answer', isAborted: false, durationMs: 1 })
})

test("keeps the news out of a subagent's tool result and gives it to the main loop's", async ($, on) => {
  const teams: Teams = { replies: [] }
  const { clock } = await startSession($, on, { pr: pr() }, teams)
  await $.turn.start({ text: 'look into it', turnId: 't1' })
  await $.tool.call({ ...READ_ARGS, agentId: 'agent-1' })

  teams.replies = [reply('1700000000200', SARA)]
  await clock.advance(60_000)
  expect((await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' })).context ?? []).toEqual([])
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).context?.[0]).toContain('Sara Lind')
  await $.turn.complete({ turnId: 't1', answer: 'done', reason: 'answer', isAborted: false, durationMs: 1 })
})

test("watches the thread of a reply that read_resource reads, and starts nothing for the user's own reply", async ($, on) => {
  const teams: Teams = { replies: [] }
  const { clock, submitted, toasts } = await startSession($, on, { pr: pr() }, teams)
  await $.tool.call({ tool: 'mcp__claude_ai_Microsoft_365__read_resource', uri: `teams:///teams/${TEAM}/channels/${CHANNEL}/messages/1700000000500` })

  teams.replies = [reply('1700000000600', ME)]
  await clock.advance(60_000)
  expect(submitted).toEqual([])
  expect(toasts).toEqual([])

  teams.replies = [reply('1700000000700', SARA), ...teams.replies]
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Sara Lind')
  expect(submitted[0]).not.toContain('Robin Vale')
})

test('starts a turn on news while idle, and only shows a toast from the sixth turn for one thread', async ($, on) => {
  const teams: Teams = { replies: [] }
  const { clock, submitted, toasts } = await startSession($, on, { pr: pr() }, teams)
  await $.tool.call(READ_ARGS)

  for (let i = 1; i <= 6; i++) {
    teams.replies = [reply(`17000000010${i}0`, SARA), ...teams.replies]
    await clock.advance(60_000)
  }
  expect(submitted.length).toBe(5)
  expect(submitted[0]).toContain(THREAD)
  expect(submitted[0]?.endsWith('If nothing is left to do, reply in one line.')).toBe(true)
  expect(toasts.length).toBe(6)
  expect(toasts[5]).toContain('started 5 turns')
})

test('shows one toast while the connector fails, starts no turn, and resumes once it works', async ($, on) => {
  const teams: Teams = { replies: [] }
  const { clock, submitted, toasts } = await startSession($, on, { pr: pr() }, teams)
  await $.tool.call(READ_ARGS)

  teams.isFailing = true
  teams.replies = [reply('1700000000200', SARA)]
  await clock.advance(60_000)
  await clock.advance(60_000)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('could not read')
  expect(submitted).toEqual([])

  teams.isFailing = false
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Sara Lind')
})

test('watches and unwatches a thread by its Teams link, and watches it again after an unwatch', async ($, on) => {
  await startSession($, on, { pr: pr() })
  const plainLink = `https://teams.microsoft.com/l/message/${CHANNEL}/${ROOT}?tenantId=tenant-0001&groupId=${TEAM}&parentMessageId=${ROOT}`

  expect((await $.command.run({ command: 'watch-discussions', args: LINK, ...TYPED })).text).toContain(THREAD)
  await $.command.run({ command: 'unwatch-discussions', args: plainLink, ...TYPED })
  await $.tool.call(READ_ARGS)
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')
  expect((await $.command.run({ command: 'watch-discussions', args: LINK, ...TYPED })).text).toContain(THREAD)
})

test("puts a thread's live state and the news a turn missed into the user's next prompt, once", async ($, on) => {
  const teams: Teams = { replies: [reply('1700000000100', ME)] }
  const { clock } = await startSession($, on, { pr: pr() }, teams)
  await $.tool.call(READ_ARGS)
  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  teams.replies = [reply('1700000000200', SARA), ...teams.replies]
  await clock.advance(60_000)
  await $.turn.complete({ turnId: 't1', answer: 'done', reason: 'answer', isAborted: false, durationMs: 1 })
  await clock.advance(30_000)

  const typed = (await $.prompt.submit({ text: 'what next?', wait: false, origin: { kind: 'composer' } })).context ?? []
  expect(typed.join('\n')).toContain(`Teams thread ${THREAD}: 2 replies (checked 30s ago)`)
  expect(typed.join('\n')).toContain(`Since the last check, Teams thread ${THREAD} got 1 new reply: Sara Lind at 2026-10-28T09:15:00Z.`)
  const again = (await $.prompt.submit({ text: 'and now?', wait: false, origin: { kind: 'composer' } })).context ?? []
  expect(again.join('\n')).toContain(`Teams thread ${THREAD}: 2 replies`)
  expect(again.join('\n')).not.toContain('Since the last check')
})

test('polls PRs on time while a Teams check hangs', async ($, on) => {
  const gh = { pr: pr() }
  const teams: Teams = { replies: [] }
  const { clock, submitted } = await startSession($, on, gh, teams)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.tool.call(READ_ARGS)

  teams.isHanging = true
  gh.pr = pr({ reviews: [COPILOT] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Copilot reviewed')
})

test('keeps a thread whose fetch failed, shows one toast, and then reports the replies since the last good check', async ($, on) => {
  const teams: Teams = { replies: [reply('1700000000100', AMIN)] }
  const { clock, submitted, toasts } = await startSession($, on, { pr: pr() }, teams)
  await $.tool.call(READ_ARGS)
  await clock.advance(60_000)

  teams.failingTool = 'teams_list_channel_messages'
  teams.replies = [reply('1700000000200', SARA), ...teams.replies]
  await clock.advance(60_000)
  await clock.advance(60_000)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('could not read')
  expect(submitted).toEqual([])

  teams.failingTool = undefined
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('got 1 new reply: Sara Lind')
  expect(submitted[0]).not.toContain('Amin Noor')
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain(THREAD)
})

test('says why /watch-discussions could not watch a Teams link', async ($, on) => {
  await startSession($, on, { pr: pr() }, { replies: [], isFailing: true })
  const text = (await $.command.run({ command: 'watch-discussions', args: LINK, ...TYPED })).text
  expect(text).toContain(`Could not watch ${LINK}: the Microsoft 365 connector could not read the thread.`)
})

test("returns Claude's Teams read and /watch-discussions once a hung connector call passes 20 seconds", async ($, on) => {
  const { clock } = await startSession($, on, { pr: pr() }, { replies: [], isHanging: true })
  let read: string | undefined
  void $.tool.call(READ_ARGS).then(ran => (read = ran.text))
  await clock.advance(19_000)
  expect(read).toBe(undefined)
  await clock.advance(1_000)
  expect(read).toBe(URL + '\n')

  let listed: string | undefined
  void $.command.run({ command: 'watch-discussions', args: LINK, ...TYPED }).then(ran => (listed = ran.text))
  await clock.advance(20_000)
  expect(listed).toContain(`Could not watch ${LINK}: the Microsoft 365 connector could not read the thread.`)
})

test("shows one toast when the threads Claude reads cannot be fetched, and watches once a read works", async ($, on) => {
  const teams: Teams = { replies: [], isFailing: true }
  const { toasts } = await startSession($, on, { pr: pr() }, teams)
  await $.tool.call(READ_ARGS)
  await $.tool.call(READ_ARGS)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('could not read Teams')

  teams.isFailing = false
  await $.tool.call(READ_ARGS)
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain(THREAD)
})

test('keeps a thread unwatched when /unwatch-discussions runs while its check waits on the connector', async ($, on) => {
  const teams: Teams = { replies: [] }
  const { clock, submitted } = await startSession($, on, { pr: pr() }, teams)
  await $.tool.call(READ_ARGS)
  await clock.advance(60_000)

  let release = () => {}
  teams.gate = new Promise<void>(resolve => (release = () => resolve()))
  teams.replies = [reply('1700000000200', SARA)]
  await clock.advance(60_000)
  await $.command.run({ command: 'unwatch-discussions', args: LINK, ...TYPED })
  release()
  await clock.advance(60_000)
  expect(submitted).toEqual([])
  expect((await $.command.run({ command: 'watch-discussions', args: '', ...TYPED })).text).toContain('Nothing watched')
})
