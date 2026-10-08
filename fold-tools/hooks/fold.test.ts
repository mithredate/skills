import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { addFailure, addToolUse, endThread, rowView, threadLine } from './threads.js'
import type { Threads } from './threads.js'

const OWN_ROW = 'drawn by Claude Code'

// Claude Code beneath the mod: it stores each row as given, and draws its own tool rows as one Text.
function claudeCode(on: On) {
  const clock = mock.clock(on)
  on('session.append', async (_$, e, next) => next(e))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: [OWN_ROW] }))
  return clock
}

async function reply($: Engine, uuid: string, content: { type: string; [field: string]: unknown }[], agentId?: string) {
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model', model: 'claude-test' },
    uuid,
    agentId,
  })
}

function drawToolRow($: Engine, id: string, tool: string, isRunning: boolean) {
  return $.ui.mount({
    plugin: 'fold-tools',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool, input: {}, isRunning, isErrored: false, isInterrupted: false },
  })
}

test('names each tool once with its count, the failures, and the time a finished thread took', async () => {
  const threads: Threads = { byId: new Map() }
  addToolUse(threads, 't1', 'Bash', 1_000)
  addToolUse(threads, 't2', 'Read', 2_000)
  addToolUse(threads, 't3', 'Bash', 3_000)
  addFailure(threads, 't3')
  const thread = threads.byId.get('t1')
  expect(thread && threadLine(thread)).toBe('▾ Bash ×2 · Read · 1 failed')
  endThread(threads, 42_000)
  expect(thread && threadLine(thread)).toBe('▸ Bash ×2 · Read · 1 failed  41s')
})

test('draws the line on the first row and nothing on the others, except a row that still runs', async () => {
  const threads: Threads = { byId: new Map() }
  addToolUse(threads, 't1', 'Bash', 0)
  addToolUse(threads, 't2', 'Bash', 0)
  expect(rowView(threads, 't1', true)).toBe('line-and-own')
  expect(rowView(threads, 't1', false)).toBe('line')
  expect(rowView(threads, 't2', true)).toBe('own')
  expect(rowView(threads, 't2', false)).toBe('nothing')
  expect(rowView(threads, 'unknown', false)).toBe('own')
})

test("never folds a question or a plan, and starts a new thread after one", async () => {
  const threads: Threads = { byId: new Map() }
  addToolUse(threads, 't1', 'Bash', 0)
  addToolUse(threads, 'q1', 'AskUserQuestion', 0)
  addToolUse(threads, 't2', 'Bash', 0)
  expect(rowView(threads, 'q1', false)).toBe('own')
  expect(rowView(threads, 't2', false)).toBe('line')
})

test('folds a finished run of tools into one line on its first row', async ($, on) => {
  const clock = claudeCode(on)
  await reply($, 'r1', [{ type: 'text', text: 'I will build the image.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }])
  await reply($, 'r2', [{ type: 'tool_use', id: 't2', name: 'Read', input: {} }])
  await clock.advance(41_000)
  await reply($, 'r3', [{ type: 'text', text: 'The build passed.' }])

  const first = await drawToolRow($, 't1', 'Bash', false)
  expect(await first.find({ type: 'Text', text: '▸ Bash · Read  41s' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: OWN_ROW })).toBeUndefined()
  await first.unmount()

  const second = await drawToolRow($, 't2', 'Read', false)
  expect(await second.find({ type: 'Text' })).toBeUndefined()
  await second.unmount()
})

test("keeps Claude Code's own row, with its live output, under the open line while the first call runs", async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'docker build .' } }])

  const running = await drawToolRow($, 't1', 'Bash', true)
  expect(await running.find({ type: 'Text', text: '▾ Bash' })).toBeDefined()
  expect(await running.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await running.unmount()
})

test('ends the open thread when the turn ends', async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }])
  await $.turn.complete({ turnId: 'turn-1', answer: '', reason: 'answer', isAborted: false, durationMs: 1 })

  const row = await drawToolRow($, 't1', 'Bash', false)
  expect(await row.find({ type: 'Text', text: '▸ Bash  0s' })).toBeDefined()
  await row.unmount()
})

test("leaves a subagent's tool rows alone", async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [{ type: 'tool_use', id: 'sub-1', name: 'Bash', input: {} }], 'agent-1')

  const row = await drawToolRow($, 'sub-1', 'Bash', false)
  expect(await row.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await row.unmount()
})
