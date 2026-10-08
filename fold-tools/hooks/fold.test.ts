import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { addFailure, addToolUse, endThread, threadLine } from './threads.js'
import type { Threads } from './threads.js'

const OWN_ROW = 'drawn by Claude Code'

type Block = { type: string; [field: string]: unknown }

// Claude Code beneath the mod: it keeps each row as given, and draws its own rows as one Text.
function claudeCode(on: On) {
  const clock = mock.clock(on)
  on('session.append', async (_$, e, next) => next(e))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: [OWN_ROW] }))
  return clock
}

async function reply($: Engine, uuid: string, content: Block[], agentId?: string) {
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model', model: 'claude-test' },
    uuid,
    agentId,
  })
}

async function toolResult($: Engine, uuid: string, content: Block[]) {
  await $.session.append({ message: { type: 'user', role: 'user', content }, door: 'tool-result', origin: { kind: 'tool', tool: 'Bash' }, uuid })
}

const useOf = (id: string, name: string): Block => ({ type: 'tool_use', id, name, input: {} })
const textOf = (text: string): Block => ({ type: 'text', text })

function drawToolRow($: Engine, id: string, tool: string, isRunning: boolean) {
  return $.ui.mount({
    plugin: 'fold-tools',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool, input: {}, isRunning, isErrored: false, isInterrupted: false },
  })
}

function drawToolResult($: Engine, id: string) {
  return $.ui.mount({
    plugin: 'fold-tools',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: id,
    props: { tool_use_id: id, tool: 'Bash', output: { stdout: 'ok', stderr: '' }, isErrored: false },
  })
}

function drawGroup($: Engine, ids: string[], isExpanded: boolean) {
  const calls = ids.map(id => ({ tool_use_id: id, tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }))
  return $.ui.mount({ plugin: 'fold-tools', surface: 'terminal', component: 'ToolGroup', requestId: ids[0] ?? 'group', props: { calls, isActive: false, isExpanded } })
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

test('folds a finished run of tools into one line on its first row, and draws nothing for the rest', async ($, on) => {
  const clock = claudeCode(on)
  await reply($, 'r1', [textOf('I will build the image.'), useOf('t1', 'Bash')])
  await reply($, 'r2', [useOf('t2', 'Read')])
  await clock.advance(41_000)
  await reply($, 'r3', [textOf('The build passed.')])

  const first = await drawToolRow($, 't1', 'Bash', false)
  expect(await first.find({ type: 'Text', text: '▸ Bash · Read  41s' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: OWN_ROW })).toBeUndefined()
  await first.unmount()

  const second = await drawToolRow($, 't2', 'Read', false)
  expect(await second.find({ type: 'Text' })).toBeUndefined()
  await second.unmount()

  const secondResult = await drawToolResult($, 't2')
  expect(await secondResult.find({ type: 'Text' })).toBeUndefined()
  await secondResult.unmount()
})

test('redraws a row that drew while its thread was open, once the thread ends', async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('t1', 'Bash')])
  const row = await drawToolRow($, 't1', 'Bash', false)
  expect(await row.find({ type: 'Text', text: '▾ Bash' })).toBeDefined()

  await reply($, 'r2', [textOf('Done.')])
  expect(await row.find({ type: 'Text', text: '▸ Bash  0s' })).toBeDefined()
  await row.unmount()
})

test("keeps Claude Code's own row, with its live output, for each call that runs", async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('t1', 'Bash'), useOf('t2', 'Bash')])

  const first = await drawToolRow($, 't1', 'Bash', true)
  expect(await first.find({ type: 'Text', text: '▾ Bash ×2' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await first.unmount()

  const second = await drawToolRow($, 't2', 'Bash', true)
  expect(await second.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await second.unmount()
})

test('counts a call whose result is an error', async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('t1', 'Bash')])
  await toolResult($, 'u1', [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'exit 1' }])
  await reply($, 'r2', [textOf('The build failed.')])

  const row = await drawToolRow($, 't1', 'Bash', false)
  expect(await row.find({ type: 'Text', text: '▸ Bash · 1 failed  0s' })).toBeDefined()
  await row.unmount()
})

test('never folds a question or a plan, and starts a new thread after one', async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('t1', 'Bash'), useOf('q1', 'AskUserQuestion')])
  await reply($, 'r2', [useOf('p1', 'ExitPlanMode'), useOf('t2', 'Read')])
  await reply($, 'r3', [textOf('Starting.')])

  for (const [id, tool] of [['q1', 'AskUserQuestion'], ['p1', 'ExitPlanMode']] as const) {
    const row = await drawToolRow($, id, tool, false)
    expect(await row.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
    await row.unmount()
  }
  const after = await drawToolRow($, 't2', 'Read', false)
  expect(await after.find({ type: 'Text', text: '▸ Read  0s' })).toBeDefined()
  await after.unmount()
})

test("draws a group of reads as its thread's line, and keeps an expanded group as Claude Code draws it", async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('g1', 'Read'), useOf('g2', 'Read')])
  await reply($, 'r2', [textOf('Read both.')])

  const folded = await drawGroup($, ['g1', 'g2'], false)
  expect(await folded.find({ type: 'Text', text: '▸ Read ×2  0s' })).toBeDefined()
  await folded.unmount()

  const expanded = await drawGroup($, ['g1', 'g2'], true)
  expect(await expanded.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await expanded.unmount()
})

test('ends the open thread when the turn ends', async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('t1', 'Bash')])
  await $.turn.complete({ turnId: 'turn-1', answer: '', reason: 'aborted', isAborted: true, durationMs: 1 })

  const row = await drawToolRow($, 't1', 'Bash', false)
  expect(await row.find({ type: 'Text', text: '▸ Bash  0s' })).toBeDefined()
  await row.unmount()
})

test("leaves a subagent's tool rows alone", async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('sub-1', 'Bash')], 'agent-1')

  const row = await drawToolRow($, 'sub-1', 'Bash', false)
  expect(await row.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await row.unmount()
})
