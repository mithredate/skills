import type { AgentInfo, CommandSpec, On, PaneOpenArgs, SessionMessage, SiteView } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { shortPath } from './facts.js'

const PANE = 'show-session'

// A build that printed 25 lines, 5 more than an open row shows.
const BUILD_OUTPUT = Array.from({ length: 25 }, (_, i) => `step ${i + 1}`).join('\n')

// A session in /repo: a slash command, a skill, three shell commands, an edit in the repo, and a read under the home folder.
// The last shell command still runs.
const MESSAGES: SessionMessage[] = [
  { role: 'user', text: '<command-name>/review-pr</command-name>', toolUses: [] },
  {
    role: 'assistant',
    text: 'Checking the repo.',
    toolUses: [
      { tool_use_id: 't1', tool: 'Skill', input: { skill: 'dev:ponytail' }, text: 'ok' },
      { tool_use_id: 't2', tool: 'Bash', input: { command: 'npm run build\nnpm run lint', description: 'Build the app' }, text: BUILD_OUTPUT },
      { tool_use_id: 't3', tool: 'Edit', input: { file_path: '/repo/src/a.ts' }, text: 'ok' },
      { tool_use_id: 't4', tool: 'Read', input: { file_path: '/Users/me/notes/todo.md' }, text: 'ok' },
      { tool_use_id: 't5', tool: 'Bash', input: { command: 'false' }, text: 'exit 1', isError: true },
      { tool_use_id: 't6', tool: 'Bash', input: { command: 'npm test', description: 'Run the tests' } },
    ],
  },
]

const AGENTS: AgentInfo[] = [
  { id: 'a1', description: 'Research CLI design', type: 'general-purpose', status: 'completed' },
  { id: 'a2', description: 'Review the PR', type: 'dev:pr-reviewer', status: 'running' },
]

// Claude Code beneath the mod: the session above, 42% of the context used, $1.20 spent, and 3 tool calls in agent a1.
function claudeCode(on: On) {
  const clock = mock.clock(on)
  on('session.messages', async (_$, e) => {
    if (e.agentId === undefined) return { value: MESSAGES }
    const calls = e.agentId === 'a1' ? 3 : 0
    const toolUses = Array.from({ length: calls }, (_, i) => ({ tool_use_id: `s${i}`, tool: 'Read', input: {}, text: 'ok' }))
    return { value: [{ role: 'assistant', text: '', toolUses }] }
  })
  on('session.root', async () => ({ value: '/repo' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 42 }, rateLimits: [], cost: { usd: 1.2 } } }))
  on('agent.list', async () => ({ value: AGENTS }))
  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? '/Users/me' : undefined }))
  on('ui.render', async () => ({ type: 'Text', props: {}, children: ['own'] }))
  return clock
}

function drawPane($: Engine) {
  return $.ui.mount({
    plugin: 'show-session',
    surface: 'terminal',
    component: 'Pane',
    requestId: PANE,
    props: { title: 'Session', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
}

test('draws a header, then a card each for the skills, the folders, the shell commands with the newest first, and the agents', async ($, on) => {
  const clock = claudeCode(on)
  await clock.advance(23 * 60_000)
  const pane = await drawPane($)

  for (const line of [
    '◆ session  claude-opus-5-5',
    'ctx 42% · $1.20 · 23m',
    '◇ review-pr · dev:ponytail',
    '· ~/notes  1 read',
    '✎ src  1 edit',
    'general-purpose · 3 tools',
    'dev:pr-reviewer · 0 tools',
  ]) {
    expect({ line, found: (await pane.find({ type: 'Text', text: line })) !== undefined }).toEqual({ line, found: true })
  }
  const buttons = await pane.findAll({ type: 'Button' })
  expect(buttons.map(button => button.text)).toEqual([
    '✕',
    '● Run the tests ▸',
    '✗ false ▸',
    '✓ Build the app ▸',
    '✓ Research CLI design',
    '● Review the PR',
  ])
  const cards = (await pane.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round')
  expect(cards.map(card => card.text.match(/^ \w+ \d+ /)?.[0])).toEqual([' Skills 2 ', ' Dirs 2 ', ' Bash 3 ', ' Agents 2 '])
  expect(cards.map(card => card.props.borderColor)).toEqual(['suggestion', 'planMode', 'bashBorder', 'claude'])
  expect((await pane.find({ type: 'Text', text: ' Agents 2 ' }))?.props).toMatchObject({ backgroundColor: 'claude', color: 'inverseText' })
  // One line between each two rows of a card, across the card inside its border and padding: 1 for Dirs, 2 for Bash, 1 for Agents.
  const rules = await pane.findAll({ type: 'Text', text: /^─+$/ })
  expect(rules.map(rule => rule.text.length)).toEqual([56, 56, 56, 56])
  expect((await pane.find({ type: 'Text', text: /^ctx 42%$/ }))?.props).toMatchObject({ color: 'success' })
  await pane.unmount()
})

test('closes the pane on a press on the ✕ in its header', async ($, on) => {
  claudeCode(on)
  const closed: string[] = []
  on('ui.close', async (_$, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  const pane = await drawPane($)
  expect((await pane.find({ type: 'Button', text: '✕' }))?.props).toMatchObject({ role: 'dismiss' })

  await pane.press({ key: 'close' })
  expect(closed).toEqual([PANE])
  await pane.unmount()
})

test('opens a shell command in place on a press on its row, and closes it on a second press', async ($, on) => {
  claudeCode(on)
  const pane = await drawPane($)

  await pane.press({ key: 'bash-t2' })
  expect(await pane.find({ type: 'Button', text: '✓ Build the app ▾' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'npm run build\nnpm run lint' })).toBeDefined()
  const output = (await pane.find({ type: 'Text', text: /^step 1\n/ }))?.text.split('\n')
  expect(output).toHaveLength(20)
  expect(output?.at(-1)).toBe('step 20')
  expect(await pane.find({ type: 'Text', text: '… 5 more lines' })).toBeDefined()

  await pane.press({ key: 'bash-t2' })
  expect(await pane.find({ type: 'Button', text: '✓ Build the app ▸' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'npm run build\nnpm run lint' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /^step 1\n/ })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /more lines/ })).toBeUndefined()
  await pane.unmount()
})

test('opens a running shell command to its command alone, as it has no output yet', async ($, on) => {
  claudeCode(on)
  const pane = await drawPane($)

  await pane.press({ key: 'bash-t6' })
  const opened = (await pane.findAll({ type: 'Box' })).find(box => box.text.startsWith('● Run the tests ▾'))
  expect(opened?.text).toBe('● Run the tests ▾npm test')
  await pane.unmount()
})

test("shows an agent's transcript in the main view on a press on its row", async ($, on) => {
  claudeCode(on)
  const viewed: SiteView[] = []
  on('ui.view', async (_$, e) => {
    viewed.push(e)
    return { value: {} }
  })
  const pane = await drawPane($)

  await pane.press({ key: 'agent-a2' })
  expect(viewed).toEqual([{ agentId: 'a2' }])
  await pane.unmount()
})

test("shows why the main view did not show an agent's transcript", async ($, on) => {
  claudeCode(on)
  const toasts: string[] = []
  on('ui.view', async () => ({ value: { deny: 'the tasks list shows no agent a2' } }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const pane = await drawPane($)

  await pane.press({ key: 'agent-a2' })
  expect(toasts).toEqual(['the tasks list shows no agent a2'])
  await pane.unmount()
})

test('opens the pane on /show-session, to close on Escape, and closes it on the next /show-session', async ($, on) => {
  claudeCode(on)
  const panes: string[] = []
  const opened: PaneOpenArgs[] = []
  on('ui.panes', async () => ({
    value: panes.map(id => ({ id, title: 'Session', isShown: true, isFocused: false, isPlaced: true, plugin: 'show-session' })),
  }))
  on('ui.open', async (_$, e) => {
    opened.push(e)
    panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', async (_$, e) => {
    panes.splice(panes.indexOf(e.id), 1)
    return { value: undefined }
  })

  const typed = { command: 'show-session', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as const
  await $.command.run(typed)
  expect(panes).toEqual([PANE])
  // So Escape closes the pane while it holds the keyboard.
  expect(opened).toMatchObject([{ id: PANE, closeOnEscape: true }])
  await $.command.run(typed)
  expect(panes).toEqual([])
})

test('registers /show-session to run at once, so the pane opens while a turn runs', async ($, on) => {
  claudeCode(on)
  const registered: CommandSpec[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => {
    registered.push(e)
    return { value: { command: e.name } }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(registered).toMatchObject([{ name: 'show-session', immediate: true }])
})

test('shows a folder relative to the project root, as ~ for the home folder and under it, and in full elsewhere', async () => {
  expect(shortPath('/repo', '/repo', '/Users/me')).toBe('.')
  expect(shortPath('/repo/src', '/repo', '/Users/me')).toBe('src')
  expect(shortPath('/repo-other/src', '/repo', '/Users/me')).toBe('/repo-other/src')
  expect(shortPath('/Users/me', '/repo', '/Users/me')).toBe('~')
  expect(shortPath('/Users/me/notes', '/repo', '/Users/me')).toBe('~/notes')
  expect(shortPath('/etc', '/repo', '/Users/me')).toBe('/etc')
})
