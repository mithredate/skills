// A linked worktree has its own git dir under the common one; the main checkout's are the same.
export function isMainCheckout(gitDir: string, commonDir: string) {
  return gitDir.replace(/\/$/, '') === commonDir.replace(/\/$/, '')
}

// `session` is the checkout of the session's folder, only when it is in the edited repo. `EnterWorktree` works only there.
// A sandboxed call writes only in the session's folder, so work in another repo needs a session that starts there.
export function worktreeAdvice(path: string, edited: { top: string }, session?: { top: string; isMain: boolean }) {
  const { top } = edited
  // The `EnterWorktree` tool runs only when the user or the project instructions ask for a worktree.
  const intro = `guard-worktree: ${path} is in the main checkout of ${top}. The user requires that code changes go in a worktree. `
  // `session` is also undefined when the session's folder is a non-repo parent of `top`, such as ~/projects/cakeclub over its repo discovery.
  if (!session) return intro + `This session's folder is not a checkout of ${top}. Start a new session in ${top}, in its own worktree, and make this edit there.`
  // `top` has its symlinks resolved, so a path through a symlink such as /tmp does not start with it.
  const target = path.startsWith(top + '/') ? session.top + path.slice(top.length) : session.top
  if (!session.isMain) return intro + `This session is in the worktree ${session.top}. Make this edit in ${target}.`
  return (
    intro +
    `Call the \`EnterWorktree\` tool with a name. Then run \`git switch -c <branch> --no-track\` in the worktree. ` +
    `Then make this edit under ${top}/.claude/worktrees/<name>/.`
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
