import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'
import { foldReply, promptLine } from './fold.js'
import { addResult, addToolUse, endThread, isLive, rowView, threadLine } from './threads.js'
import type { Threads } from './threads.js'

type Block = { type: string; [field: string]: unknown }

const threads: Threads = { byId: new Map(), done: new Set() }

// Each prompt the user sends, typed or by Remote Control, starts a turn. A reply from an earlier turn folds, so only the newest stays in full.
// A mod's prompt starts no turn here: the user may not have read the reply before it yet.
const replies = { turn: 0, turnOf: new Map<string, number>() }

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

// The row of a thread's first call draws the thread's line. The rows of its other calls draw nothing.
// A running call keeps Claude Code's own row, with its live output.
async function drawRow(
  $: EngineInterface,
  e: RenderInput<'ToolUse' | 'ToolGroup'>,
  id: string | undefined,
  live: boolean,
  own: () => Promise<RenderElement>,
) {
  const thread = id === undefined ? undefined : threads.byId.get(id)
  const view = rowView(threads, id, live)
  if (!thread || view === 'own') return own()
  const { Box, Text } = $.ui.resolve(e)
  if (view === 'nothing') return <Box />
  return (
    <Box flexDirection="column">
      <Text dimColor>{threadLine(thread)}</Text>
      {view === 'line-and-own' ? await own() : undefined}
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
        changed = endThread(threads, now) || changed
      }
      const use = toolUseOf(block)
      if (use) changed = addToolUse(threads, use.id, use.tool, now) || changed
      const result = resultOf(block)
      if (result) changed = addResult(threads, result.id, result.isError) || changed
    }
    if (changed) $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (endThread(threads, await $.clock.now())) $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) =>
    drawRow($, e, e.props.tool_use_id, isLive(threads, e.props.tool_use_id, e.props.isRunning), () => next(e)))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const turn = replies.turnOf.get(e.requestId)
    const folded = turn !== undefined && turn < replies.turn ? foldReply(e.props.text) : undefined
    return next(folded === undefined ? e : { ...e, props: { ...e.props, text: folded } })
  })

  // A mod's prompt draws as one dim line. Expanded, as in the ctrl+o transcript, it keeps Claude Code's row.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { origin } = e.props
    if (origin.kind !== 'plugin' || e.props.isExpanded) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text dimColor wrap="truncate-end">
        {promptLine(origin.name, e.props.text)}
      </Text>
    )
  })

  // A result draws under its row, so it shows only where the row is Claude Code's own.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (rowView(threads, e.props.tool_use_id, false) === 'own') return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // Claude Code folds a run of reads and searches into one group row, and its first call stands for the group.
  // An expanded group, as under --verbose or in the ctrl+o transcript, keeps Claude Code's rows.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const anyLive = e.props.calls.some(call => isLive(threads, call.tool_use_id, call.isRunning))
    return drawRow($, e, e.props.calls[0]?.tool_use_id, anyLive, () => next(e))
  })
}
