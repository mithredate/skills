import { test, expect } from 'claude-code/testing'

// Answers the events the tests raise, as the engine would, and records the effort each step reached.
function bottom(on: any) {
  const seen: unknown[] = []
  on('skill.prompt', async (_$: unknown, e: any) => ({ text: e.text }))
  on('session.end', async () => ({ sessionId: 's' }))
  on('turn.step', async function* (_$: unknown, e: any) {
    seen.push(e.effort)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
  return seen
}

// Sends one step through the plugin.
async function step($: any, effort: string, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort, messageCount: 1, agentId })
  for await (const _ of stream) { /* drain */ }
}

test('passes effort through before a listed skill loads', async ($, on) => {
  const seen = bottom(on)
  await step($, 'medium')
  expect(seen).toEqual(['medium'])
})

test('raises a lower effort after grilling loads, in main and in a subagent', async ($, on) => {
  const seen = bottom(on)
  await $.skill.prompt({ skill: 'productivity:grilling', text: '' })
  await step($, 'medium')
  await step($, 'low', 'agent-1')
  expect(seen).toEqual(['high', 'high'])
})

test('never lowers an effort above the floor', async ($, on) => {
  const seen = bottom(on)
  await $.skill.prompt({ skill: 'grilling', text: '' })
  await step($, 'xhigh')
  expect(seen).toEqual(['xhigh'])
})

test('clears the floor when the session ends', async ($, on) => {
  const seen = bottom(on)
  await $.skill.prompt({ skill: 'grilling', text: '' })
  await $.session.end({ reason: 'clear' })
  await $.skill.prompt({ skill: 'dev:ponytail', text: '' })
  await step($, 'low')
  expect(seen).toEqual(['low'])
})
