import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'
import { addFailure, addToolUse, endThread, rowView, threadLine } from './threads.js'
import type { Thread, Threads } from './threads.js'

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

// The thread's line, with Claude Code's own row under it while that row runs.
function drawLine($: EngineInterface, e: RenderInput<'ToolUse' | 'ToolGroup'>, thread: Thread, own?: RenderElement) {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Text dimColor>{threadLine(thread)}</Text>
      {own}
    </Box>
  )
}

function drawNothing($: EngineInterface, e: RenderInput<'ToolUse' | 'ToolResult' | 'ToolGroup'>) {
  const { Box } = $.ui.resolve(e)
  return <Box />
}

export const register: Register = on => {
  // A subagent's rows carry an agentId. They are not drawn in this transcript, so they join no thread.
  // On a failure the row goes on unchanged, so the conversation never loses a row.
  on('session.append', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    for (const block of e.message.content) {
      if (e.message.type === 'assistant' && isReplyText(block)) endThread(threads, now)
      const use = toolUseOf(block)
      if (use) addToolUse(threads, use.id, use.tool, now)
      const failed = failedToolOf(block)
      if (failed) addFailure(threads, failed)
    }
    $.ui.invalidate('ui.render')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    endThread(threads, await $.clock.now())
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const thread = threads.byId.get(e.props.tool_use_id)
    const view = rowView(threads, e.props.tool_use_id, e.props.isRunning)
    if (!thread || view === 'own') return next(e)
    if (view === 'nothing') return drawNothing($, e)
    return drawLine($, e, thread, view === 'line-and-own' ? await next(e) : undefined)
  })

  // A result draws under its row, so it shows only where the row is Claude Code's own.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (rowView(threads, e.props.tool_use_id, false) === 'own') return next(e)
    return drawNothing($, e)
  })

  // Claude Code folds a run of reads and searches into one group row. Its first call stands for the group.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const firstId = e.props.calls[0]?.tool_use_id
    const thread = firstId === undefined ? undefined : threads.byId.get(firstId)
    const view = rowView(threads, firstId, e.props.calls.some(call => call.isRunning))
    if (!thread || view === 'own') return next(e)
    if (view === 'nothing') return drawNothing($, e)
    return drawLine($, e, thread, view === 'line-and-own' ? await next(e) : undefined)
  })
}
