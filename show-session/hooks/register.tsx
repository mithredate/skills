import type { AgentInfo, AgentStatus, Color, EngineInterface, Register, RenderInput, RenderNode, ToolUseSummary } from 'claude-code'
import { sessionFacts } from './facts.js'
import type { Dir } from './facts.js'

const PANE = 'show-session'
const TITLE = 'Session'
// The rows a section shows at most. Its title counts them all.
const MAX_ROWS = { dirs: 5, bash: 5, agents: 4 }
// The context share is green below the first limit, yellow below the second, and red from there.
const CONTEXT_WARNING_PERCENT = 50
const CONTEXT_DANGER_PERCENT = 80

// A section draws its title in one color, so the eye finds it in a long pane.
const SECTION_COLOR = { skills: 'suggestion', dirs: 'planMode', bash: 'bashBorder', agents: 'claude' } as const satisfies Record<string, Color>

// The glyph pairs each color with a shape, so a state reads without color too.
const AGENT_MARK = {
  pending: { glyph: '●', color: 'claude' },
  running: { glyph: '●', color: 'claude' },
  waiting: { glyph: '●', color: 'warning' },
  idle: { glyph: '○', color: 'subtle' },
  completed: { glyph: '✓', color: 'success' },
  failed: { glyph: '✗', color: 'error' },
  killed: { glyph: '✗', color: 'error' },
} as const satisfies Record<AgentStatus, { glyph: string; color: Color }>

type Section = { name: string; color: Color; count: number; rows: RenderNode[] }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const firstLine = (text: string) => text.split('\n')[0] ?? ''

const contextColor = (percent: number) =>
  percent < CONTEXT_WARNING_PERCENT ? 'success' : percent < CONTEXT_DANGER_PERCENT ? 'warning' : 'error'

function callMark(use: ToolUseSummary) {
  if (use.text === undefined) return { glyph: '●', color: 'claude' }
  return use.isError ? { glyph: '✗', color: 'error' } : { glyph: '✓', color: 'success' }
}

async function toolCount($: EngineInterface, agent: AgentInfo) {
  const messages = await $.session.messages({ agentId: agent.id })
  return Array.isArray(messages) ? messages.reduce((n, message) => n + message.toolUses.length, 0) : 0
}

async function drawPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text } = $.ui.resolve(e)
  const [messages, root, home, model, usage, agents, now] = await Promise.all([
    $.session.messages(),
    $.session.root(),
    $.env.get('HOME'),
    $.session.model(),
    $.session.usage(),
    $.agent.list(),
    $.clock.now(),
  ])
  const facts = sessionFacts(messages, root, home)
  const shownAgents = agents.slice(-MAX_ROWS.agents)
  const toolCounts = await Promise.all(shownAgents.map(agent => toolCount($, agent)))
  const percent = usage.context.percent
  const empty = (what: string) => <Text dimColor>{`no ${what} yet`}</Text>

  const dirRow = (d: Dir) => (
    <Text wrap="truncate-start">
      <Text color={d.edits ? SECTION_COLOR.dirs : 'subtle'}>{d.edits ? '✎ ' : '· '}</Text>
      {d.dir}
      <Text dimColor>{`  ${d.edits ? plural(d.edits, 'edit') : plural(d.reads, 'read')}`}</Text>
    </Text>
  )
  const bashRow = (use: ToolUseSummary) => {
    const mark = callMark(use)
    const description = typeof use.input.description === 'string' ? use.input.description : ''
    const command = typeof use.input.command === 'string' ? use.input.command : ''
    return (
      <Text wrap="truncate-end">
        <Text color={mark.color}>{`${mark.glyph} `}</Text>
        {description || firstLine(command)}
      </Text>
    )
  }
  const agentRow = (agent: AgentInfo, i: number) => {
    const mark = AGENT_MARK[agent.status]
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={mark.color}>{`${mark.glyph} `}</Text>
          {agent.description}
        </Text>
        <Text dimColor wrap="truncate-end">{`  ${agent.type} · ${plural(toolCounts[i] ?? 0, 'tool')}`}</Text>
      </Box>
    )
  }

  // A new section is one more entry here.
  const sections: Section[] = [
    {
      name: 'Skills',
      color: SECTION_COLOR.skills,
      count: facts.skills.length,
      rows: [
        <Text>
          {facts.skills.map((skill, i) => (
            <Text>
              <Text color={SECTION_COLOR.skills}>{i === 0 ? '◇ ' : ' · '}</Text>
              {skill}
            </Text>
          ))}
        </Text>,
      ],
    },
    { name: 'Dirs', color: SECTION_COLOR.dirs, count: facts.dirs.length, rows: facts.dirs.slice(0, MAX_ROWS.dirs).map(dirRow) },
    { name: 'Bash', color: SECTION_COLOR.bash, count: facts.bash.length, rows: facts.bash.slice(-MAX_ROWS.bash).map(bashRow) },
    { name: 'Agents', color: SECTION_COLOR.agents, count: agents.length, rows: shownAgents.map(agentRow) },
  ]

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color="claude" bold>
          {'◆ session  '}
        </Text>
        <Text dimColor>{model}</Text>
      </Text>
      <Text wrap="truncate-end">
        {'  '}
        {percent === undefined ? undefined : <Text color={contextColor(percent)}>{`ctx ${Math.round(percent)}%`}</Text>}
        <Text dimColor>{` · $${(usage.cost?.usd ?? 0).toFixed(2)} · ${Math.round((now - usage.startedAt) / 60_000)}m`}</Text>
      </Text>
      {sections.map(section => (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={section.color} bold>
              {section.name}
            </Text>
            <Text dimColor>{` ${section.count}`}</Text>
          </Text>
          {section.count ? section.rows : empty(section.name.toLowerCase())}
        </Box>
      ))}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'show-session',
      description: 'Open or close the session pane: skills, folders, shell commands, and agents',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'show-session' }, async $ => {
    const panes = await $.ui.panes()
    if (panes.some(pane => pane.id === PANE)) await $.ui.close({ id: PANE })
    else await $.ui.open({ id: PANE, title: TITLE })
    return {}
  })

  // A new row, in the main conversation or in an agent's, can change what the pane shows. The engine throttles redraws.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    $.ui.invalidate('ui.render')
    return stored
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => drawPane($, e))
}
