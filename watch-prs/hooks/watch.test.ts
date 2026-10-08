import { test, expect, mock } from 'claude-code/testing'
import { changes, summarizeChecks, toSnapshot, newActivity } from './state.ts'

const URL = 'https://github.com/acme/api/pull/74'

function pr(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    number: 74, title: 'Add export', url: URL, state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED', headRefOid: 'abc',
    reviews: [], comments: [], statusCheckRollup: [{ status: 'IN_PROGRESS' }], ...over,
  })
}

test('summarizes checks', async () => {
  expect(summarizeChecks([])).toBe('none')
  expect(summarizeChecks([{ status: 'IN_PROGRESS' }])).toBe('pending')
  expect(summarizeChecks([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('pass')
  expect(summarizeChecks([{ status: 'COMPLETED', conclusion: 'FAILURE' }, { status: 'IN_PROGRESS' }])).toBe('fail')
})

test('finds a Copilot review, a new decision, and settled checks', async () => {
  const before = toSnapshot(pr(), 0)
  const json = pr({
    reviewDecision: 'APPROVED',
    reviews: [{ id: 'r1', author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' }],
    statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
  })
  const found = changes(before, toSnapshot(json, 1), newActivity(json, before, 'me'))
  expect(found).toEqual([
    { kind: 'decision', from: 'REVIEW_REQUIRED', to: 'APPROVED' },
    { kind: 'review', author: 'copilot-pull-request-reviewer', state: 'COMMENTED', isCopilot: true },
    { kind: 'checks', to: 'pass' },
  ])
})

test('reports a merge once', async () => {
  const merged = toSnapshot(pr({ state: 'MERGED' }), 1)
  const none = { reviews: [], comments: [] }
  expect(changes(toSnapshot(pr(), 0), merged, none)).toEqual([{ kind: 'merged' }])
  expect(changes(merged, merged, none)).toEqual([])
})

test('watches a PR that gh opens, and starts a turn when Copilot reviews it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let current = pr()
  const submitted: string[] = []
  const world = on as any
  world('session.id', async () => ({ value: 's1' }))
  world('process.run', async (_$: unknown, e: { argv: string[] }) => ({ value: { exitCode: 0, stdout: e.argv.includes('user') ? 'me\n' : current, stderr: '' } }))
  world('prompt.submit', async (_$: unknown, e: { text: string; context?: string[] }) => {
    submitted.push(e.text)
    return { text: e.text, context: e.context }
  })
  world('tool.call', async () => ({ result: 'ok', text: URL + '\n' }))
  world('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  world('command.register', async () => ({ value: undefined }))
  world('ui.status', async () => ({ value: undefined }))
  world('ui.toast', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' } as any)
  const listed = await $.command.run({ command: 'watch-prs', args: '' } as any)
  expect((listed as { text: string }).text).toContain('#74 review required · checks pending')

  current = pr({ reviews: [{ id: 'r1', author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' }] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Copilot review round 1 of 3')
  expect(submitted[0]).toContain('gh api repos/acme/api/pulls/74/comments')

  current = pr({ reviews: [{ id: 'r1', author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' }], comments: [{ id: 'c1', author: { login: 'sara' } }] })
  await clock.advance(60_000)
  expect(submitted.length).toBe(2)
  expect(submitted[1]).toContain('sara commented')
  expect(submitted[1]).toContain(`gh pr view ${URL} --comments`)

  current = pr({ reviewDecision: 'APPROVED', reviews: [{ id: 'r1', author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' }], comments: [{ id: 'c1', author: { login: 'sara' } }] })
  const typed = await $.prompt.submit({ text: 'is it approved?', wait: false, origin: { kind: 'composer' } } as any)
  const context = ((typed as { context?: string[] }).context ?? []).join('\n')
  expect(context).toContain('review decision APPROVED')
  expect(context).toContain('review decision is now APPROVED')
  expect(submitted.length).toBe(3)
})

test('skips polls during a turn, so a failure fixed in that turn is never reported', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let current = pr()
  const submitted: string[] = []
  const world = on as any
  world('session.id', async () => ({ value: 's2' }))
  world('process.run', async (_$: unknown, e: { argv: string[] }) => ({ value: { exitCode: 0, stdout: e.argv.includes('user') ? 'me\n' : current, stderr: '' } }))
  world('prompt.submit', async (_$: unknown, e: { text: string }) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  world('tool.call', async () => ({ result: 'ok', text: URL + '\n' }))
  world('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  world('turn.start', async (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  world('turn.complete', async () => ({ text: '' }))
  world('command.register', async () => ({ value: undefined }))
  world('ui.status', async () => ({ value: undefined }))
  world('ui.toast', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' } as any)

  await $.turn.start({ text: 'fix CI', turnId: 't1' })
  current = pr({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] })
  await clock.advance(60_000)
  current = pr({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] })
  await $.turn.complete({ turnId: 't1', answer: 'fixed', reason: 'answer', isAborted: false, durationMs: 1 } as any)
  await clock.advance(60_000)
  expect(submitted).toEqual([])
})

test('ignores the user\'s own reviews and comments, reports a person\'s', async () => {
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
