// A linked worktree has its own git dir under the common one; the main checkout's are the same.
export function isMainCheckout(gitDir: string, commonDir: string) {
  return gitDir.replace(/\/$/, '') === commonDir.replace(/\/$/, '')
}

export function worktreeAdvice(top: string, base: string | undefined, path: string) {
  const start = base ?? 'origin/<default branch>'
  return (
    `guard-worktree: ${path} is in the main checkout of ${top}. Code changes go in a worktree. ` +
    `Run \`git -C ${top} fetch origin && git -C ${top} worktree add .worktrees/<branch> -b <branch> ${start}\`, ` +
    `then make this edit under ${top}/.worktrees/<branch>/.`
  )
}

export type WorktreeAdd = { dir?: string; createsBranch: boolean; startPoint?: string }

const VALUE_FLAGS = new Set(['-b', '-B', '--reason', '--orphan'])

// Reads the first `git [-C dir] worktree add ...` that starts a command: at the start of a line, or after `;`, `&`, `|` or `(`.
// Quoted text matches only when one of those characters comes right before it, as in `-m "x; git worktree add ..."`.
export function parseWorktreeAdd(command: string): WorktreeAdd | undefined {
  const match = command.match(/(?:^|[\n;&|(])\s*git\s+(?:-C\s+(\S+)\s+)?worktree\s+add\b([^;&|\n]*)/)
  if (!match) return undefined
  const args = (match[2] ?? '').trim().split(/\s+/).filter(Boolean)
  const positional: string[] = []
  let createsBranch = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '-b' || arg === '-B') createsBranch = true
    if (VALUE_FLAGS.has(arg)) i++
    else if (!arg.startsWith('-')) positional.push(arg)
  }
  return { dir: match[1], createsBranch, startPoint: positional[1] }
}
