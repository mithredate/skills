import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { promptLine } from './fold.js'
import { addResult, addToolUse, endThread, threadLine } from './threads.js'
import type { Threads } from './threads.js'

const OWN_ROW = 'drawn by Claude Code'

type Block = { type: string; [field: string]: unknown }

// Claude Code beneath the mod: it keeps each row as given, and draws its own rows as one Text. A reply draws its text.
function claudeCode(on: On) {
  const clock = mock.clock(on)
  on('session.append', async (_$, e, next) => next(e))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', async (_$, e) => ({ type: 'Text', props: {}, children: [e.component === 'AssistantMessage' ? e.props.text : OWN_ROW] }))
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

async function prompt($: Engine, uuid: string, origin: { kind: 'composer' } | { kind: 'peer' } | { kind: 'plugin'; name: string }) {
  await $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'go on' }] }, door: 'prompt', origin, uuid })
}

function drawReply($: Engine, uuid: string, text: string) {
  return $.ui.mount({ plugin: 'tidy-transcript', surface: 'terminal', component: 'AssistantMessage', requestId: uuid, props: { text, isFirstOfReply: true } })
}

function drawPrompt($: Engine, text: string, origin: { kind: 'composer' } | { kind: 'plugin'; name: string }, isExpanded: boolean) {
  return $.ui.mount({ plugin: 'tidy-transcript', surface: 'terminal', component: 'UserMessage', requestId: 'p1', props: { text, origin, isExpanded } })
}

const EIGHT_LINES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].join('\n')

async function toolResult($: Engine, uuid: string, content: Block[]) {
  await $.session.append({ message: { type: 'user', role: 'user', content }, door: 'tool-result', origin: { kind: 'tool', tool: 'Bash' }, uuid })
}

const useOf = (id: string, name: string): Block => ({ type: 'tool_use', id, name, input: {} })
const textOf = (text: string): Block => ({ type: 'text', text })

function drawToolRow($: Engine, id: string, tool: string, isRunning: boolean) {
  return $.ui.mount({
    plugin: 'tidy-transcript',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool, input: {}, isRunning, isErrored: false, isInterrupted: false },
  })
}

function drawToolResult($: Engine, id: string) {
  return $.ui.mount({
    plugin: 'tidy-transcript',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: id,
    props: { tool_use_id: id, tool: 'Bash', output: { stdout: 'ok', stderr: '' }, isErrored: false },
  })
}

function drawGroup($: Engine, ids: string[], isExpanded: boolean) {
  const calls = ids.map(id => ({ tool_use_id: id, tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }))
  return $.ui.mount({ plugin: 'tidy-transcript', surface: 'terminal', component: 'ToolGroup', requestId: ids[0] ?? 'group', props: { calls, isActive: false, isExpanded } })
}

test('names each tool once with its count, the failures, and the time a finished thread took', async () => {
  const threads: Threads = { byId: new Map() }
  addToolUse(threads, 't1', 'Bash', 1_000)
  addToolUse(threads, 't2', 'Read', 2_000)
  addToolUse(threads, 't3', 'Bash', 3_000)
  addResult(threads, 't3', true)
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

test("draws a running call as its thread's line only, so no row shows and then folds", async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('t1', 'Bash'), useOf('t2', 'Bash')])

  const first = await drawToolRow($, 't1', 'Bash', true)
  expect(await first.find({ type: 'Text', text: '▾ Bash ×2' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: OWN_ROW })).toBeUndefined()
  await first.unmount()

  const second = await drawToolRow($, 't2', 'Bash', true)
  expect(await second.find({ type: 'Text' })).toBeUndefined()
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


test("draws a mod's prompt as one line with the mod's name, and in full when expanded", async ($, on) => {
  claudeCode(on)
  const text = 'The watch-prs plugin sent a message:\nPR #79 was merged.\n\nContinue with the steps that come after the merge.'
  const origin = { kind: 'plugin', name: 'watch-prs' } as const

  const folded = await drawPrompt($, text, origin, false)
  expect(await folded.find({ type: 'Text', text: '› watch-prs: PR #79 was merged.' })).toBeDefined()
  await folded.unmount()

  const expanded = await drawPrompt($, text, origin, true)
  expect(await expanded.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await expanded.unmount()

  const typed = await drawPrompt($, 'run the tests', { kind: 'composer' }, false)
  expect(await typed.find({ type: 'Text', text: OWN_ROW })).toBeDefined()
  await typed.unmount()
})

test('folds a long reply to its first lines once the user types the next prompt, and keeps the newest in full', async ($, on) => {
  claudeCode(on)
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf(EIGHT_LINES)])

  const newest = await drawReply($, 'r1', EIGHT_LINES)
  expect(await newest.find({ type: 'Text', text: EIGHT_LINES })).toBeDefined()

  await prompt($, 'u2', { kind: 'composer' })
  expect(await newest.find({ type: 'Text', text: 'one\ntwo\nthree\n\n_… 5 more lines (ctrl+o)_' })).toBeDefined()
  await newest.unmount()
})

test("keeps a reply in full when a mod's prompt, not the user's, comes after it", async ($, on) => {
  claudeCode(on)
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf(EIGHT_LINES)])
  await prompt($, 'p1', { kind: 'plugin', name: 'watch-prs' })

  const row = await drawReply($, 'r1', EIGHT_LINES)
  expect(await row.find({ type: 'Text', text: EIGHT_LINES })).toBeDefined()
  await row.unmount()
})

test('closes a code fence that the first lines of a folded reply open', async ($, on) => {
  claudeCode(on)
  const code = ['Run this:', '```bash', 'ls', 'pwd', 'whoami', 'date', 'uptime', '```'].join('\n')
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf(code)])
  await prompt($, 'u2', { kind: 'composer' })

  const row = await drawReply($, 'r1', code)
  expect(await row.find({ type: 'Text', text: 'Run this:\n```bash\nls\n```\n\n_… 5 more lines (ctrl+o)_' })).toBeDefined()
  await row.unmount()
})


test("draws a running group as its thread's line only", async ($, on) => {
  claudeCode(on)
  await reply($, 'r1', [useOf('g1', 'Read'), useOf('g2', 'Read')])
  await toolResult($, 'u1', [{ type: 'tool_result', tool_use_id: 'g1', content: 'ok' }])

  const calls = [
    { tool_use_id: 'g1', tool: 'Read', input: {}, isRunning: true, isErrored: false, isInterrupted: false },
    { tool_use_id: 'g2', tool: 'Read', input: {}, isRunning: true, isErrored: false, isInterrupted: false },
  ]
  const group = await $.ui.mount({ plugin: 'tidy-transcript', surface: 'terminal', component: 'ToolGroup', requestId: 'g1', props: { calls, isActive: true, isExpanded: false } })
  expect(await group.find({ type: 'Text', text: '▾ Read ×2' })).toBeDefined()
  expect(await group.find({ type: 'Text', text: OWN_ROW })).toBeUndefined()
  await group.unmount()
})

test('keeps a short reply in full after the next prompt', async ($, on) => {
  claudeCode(on)
  const six = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n')
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf(six)])
  await prompt($, 'u2', { kind: 'composer' })

  const row = await drawReply($, 'r1', six)
  expect(await row.find({ type: 'Text', text: six })).toBeDefined()
  await row.unmount()
})

test("names the mod and the first line of its text, with or without Claude Code's framing line", async () => {
  expect(promptLine('watch-prs', 'The watch-prs plugin sent a message:\nPR #79 was merged.')).toBe('› watch-prs: PR #79 was merged.')
  expect(promptLine('watch-prs', 'The watch-prs plugin sent a message: PR #79 was merged.')).toBe('› watch-prs: PR #79 was merged.')
  expect(promptLine('watch-prs', '  PR #79 was merged.\r\nMore.')).toBe('› watch-prs: PR #79 was merged.')
})

test('draws a note that a tool call follows dim, and keeps the last reply of the turn as Claude Code draws it', async ($, on) => {
  claudeCode(on)
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf('Checking the tests.')])
  await reply($, 'r2', [useOf('t1', 'Bash')])
  await reply($, 'r3', [textOf('All tests pass.')])

  const note = await drawReply($, 'r1', 'Checking the tests.')
  const dim = await note.find({ type: 'Markdown' })
  expect(dim?.props).toMatchObject({ text: 'Checking the tests.', dimColor: true })
  expect(await note.find({ type: 'Text', text: '● ' })).toBeDefined()
  await note.unmount()

  const last = await drawReply($, 'r3', 'All tests pass.')
  expect(await last.find({ type: 'Markdown' })).toBeUndefined()
  expect(await last.find({ type: 'Text', text: 'All tests pass.' })).toBeDefined()
  await last.unmount()
})

test('draws a note dim as soon as a tool call in the same row follows it', async ($, on) => {
  claudeCode(on)
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf('Running the build.'), useOf('t1', 'Bash')])

  const note = await drawReply($, 'r1', 'Running the build.')
  expect((await note.find({ type: 'Markdown' }))?.props).toMatchObject({ dimColor: true })
  await note.unmount()
})

test("keeps a turn's last reply bright when the next turn, such as an agent's report, opens with a tool call", async ($, on) => {
  claudeCode(on)
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf('I claimed the ticket.')])
  await $.turn.complete({ turnId: 'turn-1', answer: 'I claimed the ticket.', reason: 'answer', isAborted: false, durationMs: 1 })
  await prompt($, 'u2', { kind: 'peer' })
  await reply($, 'r2', [useOf('t1', 'Bash')])

  const row = await drawReply($, 'r1', 'I claimed the ticket.')
  expect(await row.find({ type: 'Markdown' })).toBeUndefined()
  expect(await row.find({ type: 'Text', text: 'I claimed the ticket.' })).toBeDefined()
  await row.unmount()
})

test("still draws a note dim when a subagent's turn ends between the note and its tool call", async ($, on) => {
  claudeCode(on)
  await prompt($, 'u1', { kind: 'composer' })
  await reply($, 'r1', [textOf('Checking the tests.')])
  await $.turn.complete({ turnId: 'sub-turn', agentId: 'agent-1', answer: 'Slack is quiet.', reason: 'answer', isAborted: false, durationMs: 1 })
  await reply($, 'r2', [useOf('t1', 'Bash')])

  const note = await drawReply($, 'r1', 'Checking the tests.')
  expect((await note.find({ type: 'Markdown' }))?.props).toMatchObject({ dimColor: true })
  await note.unmount()
})
