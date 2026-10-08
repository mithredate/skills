// A thread is a run of tool calls between two pieces of reply text. Once it ends, it draws as one line.
export type Thread = { firstId: string; tools: string[]; failed: number; startedAt: number; endedAt?: number }

export type Threads = { byId: Map<string, Thread>; open?: Thread }

// What a tool row draws: Claude Code's own row, the thread's line, the line above the own row, or nothing.
export type RowView = 'own' | 'line' | 'line-and-own' | 'nothing'

// These rows hold the user's answers or a plan to approve, so they never fold. Each one ends the open thread.
const SHOWN_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

export function addToolUse(threads: Threads, id: string, tool: string, now: number) {
  if (SHOWN_TOOLS.has(tool)) return endThread(threads, now)
  threads.open ??= { firstId: id, tools: [], failed: 0, startedAt: now }
  threads.open.tools.push(tool)
  threads.byId.set(id, threads.open)
}

export function addFailure(threads: Threads, id: string) {
  const thread = threads.byId.get(id)
  if (thread) thread.failed += 1
}

export function endThread(threads: Threads, now: number) {
  if (!threads.open) return
  threads.open.endedAt = now
  threads.open = undefined
}

// The first row of a thread draws its line. A running row keeps Claude Code's own row, with its live output.
export function rowView(threads: Threads, id: string | undefined, isRunning: boolean): RowView {
  const thread = id === undefined ? undefined : threads.byId.get(id)
  if (!thread) return 'own'
  if (thread.firstId === id) return isRunning ? 'line-and-own' : 'line'
  return isRunning ? 'own' : 'nothing'
}

export function threadLine(thread: Thread) {
  const counts = new Map<string, number>()
  for (const tool of thread.tools) counts.set(tool, (counts.get(tool) ?? 0) + 1)
  const tools = [...counts].map(([tool, n]) => (n > 1 ? `${tool} ×${n}` : tool)).join(' · ')
  const failed = thread.failed ? ` · ${thread.failed} failed` : ''
  if (thread.endedAt === undefined) return `▾ ${tools}${failed}`
  return `▸ ${tools}${failed}  ${Math.round((thread.endedAt - thread.startedAt) / 1000)}s`
}
