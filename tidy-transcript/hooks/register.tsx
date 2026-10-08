import type { Color, EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'
import { firstPromptLine, foldReply } from './fold.js'
import { addResult, addToolUse, endThread, threadLine, toggleFold } from './threads.js'
import type { Thread, ThreadState, Threads } from './threads.js'

// The glyph pairs each color with a shape, so the state reads without color too.
const STATE_MARK = {
  open: { glyph: '●', color: 'claude' },
  failed: { glyph: '✗', color: 'error' },
  done: { glyph: '✓', color: 'success' },
} as const satisfies Record<ThreadState, { glyph: string; color: Color }>

type Block = { type: string; [field: string]: unknown }

const threads: Threads = { byId: new Map() }

// Each prompt the user sends, typed or by Remote Control, starts a turn. A reply from an earlier turn folds, so only the newest stays in full.
// A mod's prompt starts no turn here: the user may not have read the reply before it yet.
// A text block that a tool call follows is a note on the way, so it draws dim. `lastText` is the newest text block.
const replies = { turn: 0, turnOf: new Map<string, number>(), notes: new Set<string>(), lastText: undefined as string | undefined }

// The tools and failures of the turn that runs now. When a turn ends, its footer keeps them with the context and the cost.
const turnNow = { tools: 0, failed: 0 }
type TurnEnd = { tools: number; failed: number; contextPercent?: number; usd?: number }
// ponytail: keyed by the turn's duration, the one value the turn line and turn.complete share. Two turns of the same millisecond share a footer.
const turnEnds = new Map<number, TurnEnd>()

// The context share colors green below the first limit, yellow below the second, and red from there.
const CONTEXT_WARNING_PERCENT = 50
const CONTEXT_DANGER_PERCENT = 80

const contextColor = (percent: number) =>
  percent < CONTEXT_WARNING_PERCENT ? 'success' : percent < CONTEXT_DANGER_PERCENT ? 'warning' : 'error'

// As Claude Code writes a turn's time: 3s, 1m 20s, 1h 5m.
function formatDuration(ms: number) {
  const total = Math.round(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${total % 60}s`
  return `${total}s`
}

const isReplyText = (block: Block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== ''

function toolUseOf(block: Block) {
  return block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string'
    ? { id: block.id, tool: block.name }
    : undefined
}

function resultOf(block: Block) {
  return block.type === 'tool_result' && typeof block.tool_use_id === 'string'
    ? { id: block.tool_use_id, isError: block.is_error === true }
    : undefined
}

// The row of a thread's first call draws the thread's line. The rows of its other calls draw nothing until a click unfolds the thread.
// This holds while a call runs, because a row that shows for a second and then folds is a flicker.
async function drawRow($: EngineInterface, e: RenderInput<'ToolUse' | 'ToolGroup'>, id: string | undefined, own: () => Promise<RenderElement>) {
  const thread = id === undefined ? undefined : threads.byId.get(id)
  if (!thread) return own()
  const isFirst = thread.firstId === id
  if (thread.isUnfolded && !isFirst) return own()
  const { Box } = $.ui.resolve(e)
  if (!isFirst) return <Box />
  if (!thread.isUnfolded) return drawThreadLine($, e, thread)
  return (
    <Box flexDirection="column">
      {drawThreadLine($, e, thread)}
      {await own()}
    </Box>
  )
}

// The tool names are the button, so the pointer inverts the part a click acts on.
function drawThreadLine($: EngineInterface, e: RenderInput<'ToolUse' | 'ToolGroup'>, thread: Thread) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const line = threadLine(thread)
  const mark = STATE_MARK[line.state]
  const time = line.seconds === undefined ? '' : `  ${line.seconds}s`
  return (
    <Box flexDirection="row">
      <Text color={mark.color}>{`${mark.glyph} `}</Text>
      <Button
        key={`fold-${thread.firstId}`}
        label={line.tools}
        plain
        onPress={() => {
          toggleFold(thread)
          $.ui.invalidate('ui.render')
        }}
      />
      {line.failed ? <Text color="error">{` · ${line.failed} failed`}</Text> : undefined}
      <Text dimColor>{`${time} ${line.isUnfolded ? '▾' : '▸'}`}</Text>
    </Box>
  )
}

export const register: Register = on => {
  // A subagent's rows carry an agentId. They are not drawn in this transcript, so they join no thread.
  on('session.append', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    const isReply = e.message.type === 'assistant'
    let changed = false
    if (e.door === 'prompt' && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      replies.turn += 1
      changed = true
    }
    for (const block of e.message.content) {
      if (isReply && isReplyText(block)) {
        replies.turnOf.set(e.uuid, replies.turn)
        replies.lastText = e.uuid
        changed = endThread(threads, now) || changed
      }
      const use = toolUseOf(block)
      if (use && replies.lastText !== undefined) {
        replies.notes.add(replies.lastText)
        replies.lastText = undefined
      }
      if (use) {
        turnNow.tools += 1
        changed = addToolUse(threads, use.id, use.tool, now) || changed
      }
      const result = resultOf(block)
      if (result?.isError) turnNow.failed += 1
      if (result) changed = addResult(threads, result.id, result.isError) || changed
    }
    if (changed) $.ui.invalidate('ui.render')
    return next(e)
  })

  // A subagent's run raises no turn.start, so this is always the main conversation's turn.
  on('turn.start', async ($, e, next) => {
    turnNow.tools = 0
    turnNow.failed = 0
    return next(e)
  })

  // A turn's last reply is final. A tool call in a later turn, such as one an agent's report starts, makes it no note.
  // A subagent's turn can end between a note and its tool call, so only the main turn's end clears it.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) replies.lastText = undefined
    if (endThread(threads, await $.clock.now())) $.ui.invalidate('ui.render')
    if (e.agentId === undefined) {
      const usage = await $.session.usage()
      turnEnds.set(e.durationMs, { ...turnNow, contextPercent: usage.context.percent, usd: usage.cost?.usd })
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // The line that closes a turn draws as a footer. A turn this module did not see end keeps Claude Code's line.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const end = turnEnds.get(e.props.durationMs)
    if (!end) return next(e)
    const { Text } = $.ui.resolve(e)
    const parts = [
      <Text>{formatDuration(e.props.durationMs)}</Text>,
      end.tools ? <Text color="bashBorder">{`${end.tools} ${end.tools === 1 ? 'tool' : 'tools'}`}</Text> : undefined,
      end.failed ? <Text color="error">{`✗ ${end.failed} failed`}</Text> : undefined,
      end.contextPercent === undefined ? undefined : (
        <Text color={contextColor(end.contextPercent)}>{`ctx ${Math.round(end.contextPercent)}%`}</Text>
      ),
      end.usd === undefined ? undefined : <Text dimColor>{`$${end.usd.toFixed(2)}`}</Text>,
    ].filter(part => part !== undefined)
    return (
      <Text wrap="truncate-end">
        <Text dimColor>{'── '}</Text>
        {parts.flatMap((part, i) => (i === 0 ? [part] : [<Text dimColor>{' · '}</Text>, part]))}
        <Text dimColor>{' ──'}</Text>
      </Text>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => drawRow($, e, e.props.tool_use_id, () => next(e)))

  // A note draws dim, so the last reply of a turn is the one bright text. The bullet stays, dim too.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const turn = replies.turnOf.get(e.requestId)
    const folded = turn !== undefined && turn < replies.turn ? foldReply(e.props.text) : undefined
    if (!replies.notes.has(e.requestId)) return next(folded === undefined ? e : { ...e, props: { ...e.props, text: folded } })
    const { Box, Text, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text dimColor>{e.props.isFirstOfReply ? '● ' : '  '}</Text>
        <Box flexGrow={1}>
          <Markdown text={folded ?? e.props.text} dimColor />
        </Box>
      </Box>
    )
  })

  // A mod's prompt draws as one line: the mod's name as a label, then its text dim. Expanded, as in the ctrl+o transcript, it keeps Claude Code's row.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { origin } = e.props
    if (origin.kind !== 'plugin' || e.props.isExpanded) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text wrap="truncate-end">
        <Text backgroundColor="merged" color="inverseText">{` ${origin.name} `}</Text>
        <Text dimColor>{` ${firstPromptLine(e.props.text)}`}</Text>
      </Text>
    )
  })

  // A result draws under its row, so it shows only where Claude Code draws the row.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const thread = threads.byId.get(e.props.tool_use_id)
    if (!thread || thread.isUnfolded) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // Claude Code folds a run of reads and searches into one group row, and its first call stands for the group.
  // An expanded group, as under --verbose or in the ctrl+o transcript, keeps Claude Code's rows.
  // An unfolded thread expands its group, so each call draws as a ToolUse row and the first one draws the line.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const id = e.props.calls[0]?.tool_use_id
    if (id !== undefined && threads.byId.get(id)?.isUnfolded) return next({ ...e, props: { ...e.props, isExpanded: true } })
    return drawRow($, e, id, () => next(e))
  })
}
