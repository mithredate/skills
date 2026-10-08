import { test, expect, mock } from 'claude-code/testing'
import { MAX_TURNS_PER_PR, changes, instructions, newActivity, summarizeChecks, toSnapshot } from './state.ts'

const URL = 'https://github.com/acme/api/pull/74'
const OTHER = 'https://github.com/acme/api/pull/80'
const COPILOT = { id: 'r1', author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' }

function pr(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    number: 74, title: 'Add export', url: URL, state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED',
    reviews: [], comments: [], statusCheckRollup: [{ status: 'IN_PROGRESS' }], ...over,
  })
}

// The world beneath the plugin: gh answers `pr` for any PR and `me` for the user; prompts are recorded.
async function startSession($: any, on: any, gh: { pr: string; toolOutput?: string; login?: string }) {
  const clock = mock.clock(on)
  mock.store(on)
  const submitted: string[] = []
  on('session.id', async () => ({ value: 's1' }))
  on('process.run', async (_$: unknown, e: { argv: string[] }) =>
    e.argv.includes('user')
      ? { value: { exitCode: gh.login === undefined ? 0 : 1, stdout: 'me\n', stderr: '' } }
      : { value: { exitCode: 0, stdout: gh.pr, stderr: '' } })
  on('prompt.submit', async (_$: unknown, e: { text: string; context?: string[] }) => {
    submitted.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('tool.call', async () => ({ result: 'ok', text: gh.toolOutput ?? URL + '\n' }))
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('turn.start', async (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('command.register', async () => ({ value: undefined }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  return { clock, submitted }
}

test('summarizes checks', async () => {
  expect(summarizeChecks([])).toBe('none')
  expect(summarizeChecks([{ status: 'IN_PROGRESS' }])).toBe('pending')
  expect(summarizeChecks([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('pass')
  expect(summarizeChecks([{ status: 'COMPLETED', conclusion: 'FAILURE' }, { status: 'IN_PROGRESS' }])).toBe('fail')
})

test('finds a Copilot review, a new decision, and settled checks', async () => {
  const before = toSnapshot(pr(), 0)
  const json = pr({ reviewDecision: 'APPROVED', reviews: [COPILOT], statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] })
  expect(changes(before, toSnapshot(json, 1), newActivity(json, before, 'me'))).toEqual([
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
  const json = pr({
    reviews: [{ id: 'r1', author: { login: 'me' }, state: 'COMMENTED' }, { id: 'r2', author: { login: 'amin' }, state: 'CHANGES_REQUESTED' }],
    comments: [{ id: 'c1', author: { login: 'me' } }, { id: 'c2', author: { login: 'sara' } }],
  })
  expect(changes(before, toSnapshot(json, 1), newActivity(json, before, 'me'))).toEqual([
    { kind: 'review', author: 'amin', state: 'CHANGES_REQUESTED', isCopilot: false },
    { kind: 'comment', author: 'sara' },
  ])
})

test("counts only Copilot while the user's login is unknown", async () => {
  const before = toSnapshot(pr(), 0)
  const json = pr({ reviews: [COPILOT], comments: [{ id: 'c1', author: { login: 'me' } }] })
  expect(newActivity(json, before, '')).toEqual({ reviews: [COPILOT], comments: [] })
})

test('tells Claude where to read a person\'s comments', async () => {
  const { steps } = instructions(toSnapshot(pr(), 0), [{ kind: 'comment', author: 'sara' }], 1)
  expect(steps.join('\n')).toContain(`gh pr view ${URL} --comments`)
  expect(steps.join('\n')).toContain('gh api repos/acme/api/pulls/74/comments')
})

test('stops acting on a PR after the turn cap, except for its merge', async () => {
  const snap = toSnapshot(pr(), 0)
  const capped = instructions(snap, [{ kind: 'checks', to: 'fail' }], MAX_TURNS_PER_PR + 1)
  expect(capped.steps).toEqual([])
  expect(capped.what).toContain(`started ${MAX_TURNS_PER_PR} turns`)
  expect(instructions(snap, [{ kind: 'merged' }], MAX_TURNS_PER_PR + 1).steps.length).toBe(1)
})

test('watches a PR that gh opens, and starts a turn for Copilot and for a person', async ($, on) => {
  const gh = { pr: pr() }
  const { clock, submitted } = await startSession($, on, gh)

  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' } as any)
  const listed = await $.command.run({ command: 'watch-prs', args: '' } as any)
  expect((listed as { text: string }).text).toContain('#74 review required · checks pending')

  gh.pr = pr({ reviews: [COPILOT] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Copilot reviewed')

  gh.pr = pr({ reviews: [COPILOT], comments: [{ id: 'c1', author: { login: 'sara' } }] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(2)
  expect(submitted[1]).toContain('sara commented')

  gh.pr = pr({ reviewDecision: 'APPROVED', reviews: [COPILOT], comments: [{ id: 'c1', author: { login: 'sara' } }] })
  const typed = await $.prompt.submit({ text: 'is it approved?', wait: false, origin: { kind: 'composer' } } as any)
  const context = ((typed as { context?: string[] }).context ?? []).join('\n')
  expect(context).toContain('review decision APPROVED')
  expect(context).toContain('review decision is now APPROVED')
})

test('skips polls during a turn, so a failure fixed in that turn is never reported', async ($, on) => {
  const gh = { pr: pr() }
  const { clock, submitted } = await startSession($, on, gh)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' } as any)

  await $.turn.start({ text: 'fix CI', turnId: 't1' })
  gh.pr = pr({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] })
  await clock.advance(60_000)
  gh.pr = pr({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] })
  await $.turn.complete({ turnId: 't1', answer: 'fixed', reason: 'answer', isAborted: false, durationMs: 1 } as any)
  await clock.advance(60_000)
  expect(submitted).toEqual([])
})

test('watches only the PR a command names, and keeps an unwatched PR unwatched', async ($, on) => {
  const gh = { pr: pr(), toolOutput: `${URL}\n${OTHER}\n` }
  await startSession($, on, gh)

  await $.tool.call({ tool: 'Bash', command: 'gh pr list --json url' } as any)
  expect(((await $.command.run({ command: 'watch-prs', args: '' } as any)) as { text: string }).text).toContain('No PRs watched')

  await $.tool.call({ tool: 'Bash', command: `gh pr view ${URL}` } as any)
  await $.command.run({ command: 'unwatch-prs', args: URL } as any)
  await $.tool.call({ tool: 'Bash', command: `gh pr view ${URL}` } as any)
  expect(((await $.command.run({ command: 'watch-prs', args: '' } as any)) as { text: string }).text).toContain('No PRs watched')
})
