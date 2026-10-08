// A thread is a run of tool calls between two pieces of reply text. It draws as one line, while it runs and after it ends.
export type Thread = { firstId: string; tools: string[]; failed: number; startedAt: number; endedAt?: number }

// ponytail: byId keeps every call of the session, so an old row still folds when it redraws. A few bytes per call.
export type Threads = { byId: Map<string, Thread>; open?: Thread }

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

export type ThreadState = 'open' | 'failed' | 'done'

// An open thread has no `seconds` yet.
export type ThreadLine = { state: ThreadState; tools: string; failed: number; seconds?: number }

export function threadLine(thread: Thread): ThreadLine {
  const counts = new Map<string, number>()
  for (const tool of thread.tools) counts.set(tool, (counts.get(tool) ?? 0) + 1)
  const tools = [...counts].map(([tool, n]) => (n > 1 ? `${tool} ×${n}` : tool)).join(' · ')
  if (thread.endedAt === undefined) return { state: 'open', tools, failed: thread.failed }
  const seconds = Math.round((thread.endedAt - thread.startedAt) / 1000)
  return { state: thread.failed ? 'failed' : 'done', tools, failed: thread.failed, seconds }
}
