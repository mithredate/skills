import type { Register, EngineInterface } from 'claude-code'
import { isMainCheckout, parseWorktreeAdd, worktreeAdvice } from './rules.ts'

// The orchestrator tracker is edited on the main checkout by design.
const ALWAYS_ALLOWED = /(^|\/)\.wayfinder\//

// A repo with no origin, such as a stray `git init` in a home directory, has no PR workflow to guard.
// `base` is `origin/<default>` when origin/HEAD is set, and undefined when it is not.
type Checkout = { top: string; isMain: boolean; base?: string }

const checkouts = new Map<string, Checkout | null>()

async function git($: EngineInterface, args: string[]) {
  try {
    return await $.process.run(['git', ...args])
  } catch {
    return { exitCode: -1, stdout: '', stderr: '' }
  }
}

async function nearestDir($: EngineInterface, path: string) {
  let dir = path.slice(0, path.lastIndexOf('/')) || '/'
  while (dir !== '/' && !(await $.fs.exists(dir))) dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  return dir
}

// The repo that holds `dir`, when it has an origin. Cached per directory for the session.
async function guardedCheckout($: EngineInterface, dir: string) {
  if (checkouts.has(dir)) return checkouts.get(dir)!
  let found: Checkout | null = null
  const rev = await git($, ['-C', dir, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'])
  const [top = '', gitDir = '', commonDir = ''] = rev.stdout.trim().split('\n')
  if (rev.exitCode === 0 && (await git($, ['-C', top, 'remote', 'get-url', 'origin'])).exitCode === 0) {
    const head = await git($, ['-C', top, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    found = { top, isMain: isMainCheckout(gitDir, commonDir), base: head.exitCode === 0 ? head.stdout.trim() : undefined }
  }
  checkouts.set(dir, found)
  return found
}

async function guardEdit($: EngineInterface, path: string | undefined) {
  if (!path || ALWAYS_ALLOWED.test(path)) return undefined
  const checkout = await guardedCheckout($, await nearestDir($, path))
  if (!checkout?.isMain) return undefined
  if ((await git($, ['-C', checkout.top, 'check-ignore', '-q', path])).exitCode === 0) return undefined
  return worktreeAdvice(checkout.top, checkout.base, path)
}

export const register: Register = on => {
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const path = 'notebook_path' in e ? e.notebook_path : 'file_path' in e ? e.file_path : undefined
    const deny = await guardEdit($, path)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'guard-worktree failed, so the edit did not run. Retry it.' }))

  // A worktree branch starts from a fresh origin default branch, never from a stale local one.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const add = parseWorktreeAdd(e.command)
    if (!add) return next(e)
    const checkout = await guardedCheckout($, add.dir ?? (await $.session.cwd()))
    if (!checkout) return next(e)
    await git($, ['-C', checkout.top, 'fetch', 'origin', '--quiet'])
    if (add.createsBranch && !add.startPoint?.startsWith('origin/')) {
      const base = checkout.base ?? 'origin/<default branch>'
      return {
        deny:
          `guard-worktree: a new worktree branch starts from ${base}, which I just fetched. ` +
          `Run the same command with \`${base}\` as the start point (the last argument).`,
      }
    }
    return next(e)
  })
}
