import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'
import { addFailure, addToolUse, endThread, rowView, threadLine } from './threads.js'
import type { Threads } from './threads.js'

type Block = { type: string; [field: string]: unknown }

const threads: Threads = { byId: new Map() }

const isReplyText = (block: Block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== ''

function toolUseOf(block: Block) {
  return block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string'
    ? { id: block.id, tool: block.name }
    : undefined
}

function failedToolOf(block: Block) {
  return block.type === 'tool_result' && block.is_error === true && typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
}

// The row of a thread's first call draws the thread's line. The rows of its other calls draw nothing.
// A running call keeps Claude Code's own row, with its live output.
async function drawRow(
  $: EngineInterface,
  e: RenderInput<'ToolUse' | 'ToolGroup'>,
  id: string | undefined,
  isRunning: boolean,
  own: () => Promise<RenderElement>,
) {
  const thread = id === undefined ? undefined : threads.byId.get(id)
  const view = rowView(threads, id, isRunning)
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
    for (const block of e.message.content) {
      if (isReply && isReplyText(block)) changed = endThread(threads, now) || changed
      const use = toolUseOf(block)
      if (use) changed = addToolUse(threads, use.id, use.tool, now) || changed
      const failed = failedToolOf(block)
      if (failed) changed = addFailure(threads, failed) || changed
    }
    if (changed) $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (endThread(threads, await $.clock.now())) $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) =>
    drawRow($, e, e.props.tool_use_id, e.props.isRunning, () => next(e)))

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
    const isRunning = e.props.calls.some(call => call.isRunning)
    return drawRow($, e, e.props.calls[0]?.tool_use_id, isRunning, () => next(e))
  })
}
