// A thread is a run of tool calls between two pieces of reply text. Once it ends, it draws as one line.
export type Thread = { firstId: string; tools: string[]; failed: number; startedAt: number; endedAt?: number }

// ponytail: byId keeps every call of the session, so an old row still folds when it redraws. A few bytes per call.
// `done` holds the calls whose result has arrived.
export type Threads = { byId: Map<string, Thread>; done: Set<string>; open?: Thread }

// What a tool row draws: Claude Code's own row, the thread's line, the line above the own row, or nothing.
export type RowView = 'own' | 'line' | 'line-and-own' | 'nothing'

// These rows hold the user's answers or a plan to approve, so they never fold. Each one ends the open thread.
const SHOWN_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

// Each change returns true when a drawn row can look different now.
export function addToolUse(threads: Threads, id: string, tool: string, now: number) {
  if (SHOWN_TOOLS.has(tool)) return endThread(threads, now)
  threads.open ??= { firstId: id, tools: [], failed: 0, startedAt: now }
  threads.open.tools.push(tool)
  threads.byId.set(id, threads.open)
  return true
}

export function addResult(threads: Threads, id: string, isError: boolean) {
  threads.done.add(id)
  const thread = threads.byId.get(id)
  if (thread && isError) thread.failed += 1
  return thread !== undefined
}

export function endThread(threads: Threads, now: number) {
  if (!threads.open) return false
  threads.open.endedAt = now
  threads.open = undefined
  return true
}

// The first row of a thread draws its line. A running row keeps Claude Code's own row, with its live output.
export function rowView(threads: Threads, id: string | undefined, isRunning: boolean): RowView {
  const thread = id === undefined ? undefined : threads.byId.get(id)
  if (!thread || id === undefined) return 'own'
  // Claude Code can still report a call as running after its result arrived, so the result or the thread's end settles it.
  const running = isRunning && !threads.done.has(id) && thread.endedAt === undefined
  if (thread.firstId === id) return running ? 'line-and-own' : 'line'
  return running ? 'own' : 'nothing'
}

export function threadLine(thread: Thread) {
  const counts = new Map<string, number>()
  for (const tool of thread.tools) counts.set(tool, (counts.get(tool) ?? 0) + 1)
  const tools = [...counts].map(([tool, n]) => (n > 1 ? `${tool} ×${n}` : tool)).join(' · ')
  const failed = thread.failed ? ` · ${thread.failed} failed` : ''
  if (thread.endedAt === undefined) return `▾ ${tools}${failed}`
  return `▸ ${tools}${failed}  ${Math.round((thread.endedAt - thread.startedAt) / 1000)}s`
}
