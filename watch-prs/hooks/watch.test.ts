import { test, expect, mock } from 'claude-code/testing'
import { changes, summarizeChecks, toSnapshot, newReviews } from './state.ts'

const URL = 'https://github.com/acme/api/pull/74'

function pr(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    number: 74, title: 'Add export', url: URL, state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED', headRefOid: 'abc',
    reviews: [], statusCheckRollup: [{ status: 'IN_PROGRESS' }], ...over,
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
  const found = changes(before, toSnapshot(json, 1), newReviews(json, before.reviewIds))
  expect(found).toEqual([
    { kind: 'decision', from: 'REVIEW_REQUIRED', to: 'APPROVED' },
    { kind: 'review', author: 'copilot-pull-request-reviewer', state: 'COMMENTED', isCopilot: true },
    { kind: 'checks', to: 'pass' },
  ])
})

test('reports a merge once', async () => {
  const merged = toSnapshot(pr({ state: 'MERGED' }), 1)
  expect(changes(toSnapshot(pr(), 0), merged, [])).toEqual([{ kind: 'merged' }])
  expect(changes(merged, merged, [])).toEqual([])
})

test('watches a PR that gh opens, and starts a turn when Copilot reviews it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let current = pr()
  const submitted: string[] = []
  const world = on as any
  world('session.id', async () => ({ value: 's1' }))
  world('process.run', async () => ({ value: { exitCode: 0, stdout: current, stderr: '' } }))
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

  current = pr({ reviewDecision: 'APPROVED', reviews: [{ id: 'r1', author: { login: 'copilot-pull-request-reviewer' }, state: 'COMMENTED' }] })
  const typed = await $.prompt.submit({ text: 'is it approved?', wait: false, origin: { kind: 'composer' } } as any)
  const context = ((typed as { context?: string[] }).context ?? []).join('\n')
  expect(context).toContain('review decision APPROVED')
  expect(context).toContain('review decision is now APPROVED')
  expect(submitted.length).toBe(2)
})
