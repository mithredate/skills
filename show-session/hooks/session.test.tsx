import type { AgentInfo, CommandSpec, On, SessionMessage } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { shortPath } from './facts.js'

const PANE = 'show-session'

// A session in /repo: a slash command, a skill, two shell commands, an edit in the repo, and a read under the home folder.
const MESSAGES: SessionMessage[] = [
  { role: 'user', text: '<command-name>/review-pr</command-name>', toolUses: [] },
  {
    role: 'assistant',
    text: 'Checking the repo.',
    toolUses: [
      { tool_use_id: 't1', tool: 'Skill', input: { skill: 'dev:ponytail' }, text: 'ok' },
      { tool_use_id: 't2', tool: 'Bash', input: { command: 'git status', description: 'Show status' }, text: 'clean' },
      { tool_use_id: 't3', tool: 'Edit', input: { file_path: '/repo/src/a.ts' }, text: 'ok' },
      { tool_use_id: 't4', tool: 'Read', input: { file_path: '/Users/me/notes/todo.md' }, text: 'ok' },
      { tool_use_id: 't5', tool: 'Bash', input: { command: 'false' }, text: 'exit 1', isError: true },
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

test('draws the session as stacked sections: a header, the skills, the folders, the shell commands, and the agents', async ($, on) => {
  const clock = claudeCode(on)
  await clock.advance(23 * 60_000)
  const pane = await drawPane($)

  for (const line of [
    '◆ session  claude-opus-5-5',
    'ctx 42% · $1.20 · 23m',
    'Skills 2',
    '◇ review-pr · dev:ponytail',
    'Dirs 2',
    '· ~/notes  1 read',
    '✎ src  1 edit',
    'Bash 2',
    '✓ Show status',
    '✗ false',
    'Agents 2',
    '✓ Research CLI design',
    'general-purpose · 3 tools',
    '● Review the PR',
    'dev:pr-reviewer · 0 tools',
  ]) {
    expect({ line, found: (await pane.find({ type: 'Text', text: line })) !== undefined }).toEqual({ line, found: true })
  }
  expect((await pane.find({ type: 'Text', text: /^ctx 42%$/ }))?.props).toMatchObject({ color: 'success' })
  expect((await pane.find({ type: 'Text', text: /^Agents$/ }))?.props).toMatchObject({ color: 'claude', bold: true })
  await pane.unmount()
})

test('opens the pane on /show-session and closes it on the next /show-session', async ($, on) => {
  claudeCode(on)
  const panes: string[] = []
  on('ui.panes', async () => ({
    value: panes.map(id => ({ id, title: 'Session', isShown: true, isFocused: false, isPlaced: true, plugin: 'show-session' })),
  }))
  on('ui.open', async (_$, e) => {
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
