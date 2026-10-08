import type { Register, EngineInterface } from 'claude-code'
import { isMainCheckout, parseWorktreeAdd, worktreeAdvice } from './rules.ts'

// The orchestrator tracker is edited on the main checkout by design.
const ALWAYS_ALLOWED = /(^|\/)\.wayfinder\//

type Checkout = { top: string; isMain: boolean; defaultBranch: string } | null

const checkouts = new Map<string, Checkout>()

async function git($: EngineInterface, args: string[], cwd?: string) {
  try {
    return await $.process.run(['git', ...args], cwd ? { cwd } : undefined)
  } catch {
    return { exitCode: -1, stdout: '', stderr: '' }
  }
}

async function nearestDir($: EngineInterface, path: string) {
  let dir = path.slice(0, path.lastIndexOf('/')) || '/'
  while (dir !== '/' && !(await $.fs.exists(dir))) dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  return dir
}

async function checkoutOf($: EngineInterface, dir: string): Promise<Checkout> {
  if (checkouts.has(dir)) return checkouts.get(dir)!
  const rev = await git($, ['-C', dir, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'])
  let found: Checkout = null
  if (rev.exitCode === 0) {
    const [top = '', gitDir = '', commonDir = ''] = rev.stdout.trim().split('\n')
    const origin = await git($, ['-C', top, 'remote', 'get-url', 'origin'])
    const head = await git($, ['-C', top, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    // A repo with no origin, such as a stray `git init` in a home directory, has no PR workflow to guard.
    found = {
      top,
      isMain: origin.exitCode === 0 && isMainCheckout(gitDir, commonDir),
      defaultBranch: head.exitCode === 0 ? head.stdout.trim() : 'origin/main',
    }
  }
  checkouts.set(dir, found)
  return found
}

async function guardEdit($: EngineInterface, path: string | undefined) {
  if (!path || ALWAYS_ALLOWED.test(path)) return undefined
  const checkout = await checkoutOf($, await nearestDir($, path))
  if (!checkout?.isMain) return undefined
  const ignored = await git($, ['-C', checkout.top, 'check-ignore', '-q', path])
  if (ignored.exitCode === 0) return undefined
  return worktreeAdvice(checkout.top, checkout.defaultBranch, path)
}

export const register: Register = on => {
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const deny = await guardEdit($, e.file_path)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'guard-worktree failed, so the edit did not run. Retry it.' }))

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const deny = await guardEdit($, (e as { notebook_path?: string }).notebook_path)
    return deny ? { deny } : next(e)
  })

  // A worktree branch starts from a fresh origin default branch, never from a stale local one.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const add = parseWorktreeAdd(e.command)
    if (!add) return next(e)
    const cwd = add.dir ?? (await $.session.cwd())
    await git($, ['-C', cwd, 'fetch', 'origin', '--quiet'])
    if (add.createsBranch && !add.startPoint?.startsWith('origin/')) {
      const checkout = await checkoutOf($, cwd)
      const base = checkout?.defaultBranch ?? 'origin/main'
      return {
        deny:
          `guard-worktree: a new worktree branch starts from ${base}, which I just fetched. ` +
          `Run the same command with \`${base}\` as the start point (the last argument).`,
      }
    }
    return next(e)
  })
}
