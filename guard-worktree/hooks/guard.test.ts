import { test, expect } from 'claude-code/testing'
import { parseWorktreeAdd } from './rules.ts'

const REPO = '/repo'
const NO_ORIGIN = '/home'

// A fake git: /repo has an origin and worktrees under /repo/.worktrees/wt; /home has no origin.
function fakeGit(on: any, { calls = [] as string[][], originHead = 'origin/main\n', cwd = REPO } = {}) {
  on('fs.exists', async () => ({ value: true }))
  on('session.cwd', async () => ({ value: cwd }))
  on('process.run', async (_$: unknown, e: { argv: readonly string[] }) => {
    const argv = [...e.argv]
    calls.push(argv)
    const dir = argv[2] ?? ''
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    const fail = { value: { exitCode: 1, stdout: '', stderr: '' } }
    if (argv.includes('rev-parse')) {
      if (dir.startsWith(NO_ORIGIN)) return ok(`${NO_ORIGIN}\n${NO_ORIGIN}/.git\n${NO_ORIGIN}/.git\n`)
      if (dir.startsWith(REPO + '/.worktrees/wt')) return ok(`${REPO}/.worktrees/wt\n${REPO}/.git/worktrees/wt\n${REPO}/.git\n`)
      return ok(`${REPO}\n${REPO}/.git\n${REPO}/.git\n`)
    }
    if (argv.includes('get-url')) return dir === NO_ORIGIN ? fail : ok('git@github.com:acme/api.git\n')
    if (argv.includes('symbolic-ref')) return originHead ? ok(originHead) : fail
    if (argv.includes('check-ignore')) return argv.at(-1)!.includes('/dist/') ? ok('') : fail
    return ok('')
  })
  on('tool.call', async () => ({ result: 'ran' }))
}

const refusal = (ran: any): string | undefined => ran.deny ?? (ran.isError ? ran.text : undefined)

test('refuses an edit in the main checkout', async ($, on) => {
  fakeGit(on)
  const ran = await $.tool.call({ tool: 'Edit', file_path: REPO + '/src/a.ts', old_string: 'a', new_string: 'b' } as any)
  expect(refusal(ran)).toContain('worktree add .worktrees/<branch> -b <branch> origin/main')
})

test('refuses a notebook edit in the main checkout', async ($, on) => {
  fakeGit(on)
  const ran = await $.tool.call({ tool: 'NotebookEdit', notebook_path: REPO + '/n.ipynb', new_source: 'x' } as any)
  expect(refusal(ran)).toContain('main checkout')
})

test('names no made-up branch when origin/HEAD is unset', async ($, on) => {
  fakeGit(on, { originHead: '' })
  const ran = await $.tool.call({ tool: 'Write', file_path: REPO + '/src/a.ts', content: 'x' } as any)
  expect(refusal(ran)).toContain('-b <branch> origin/<default branch>')
})

test('allows an edit in a linked worktree', async ($, on) => {
  fakeGit(on)
  const ran = await $.tool.call({ tool: 'Write', file_path: REPO + '/.worktrees/wt/src/a.ts', content: 'x' } as any)
  expect(refusal(ran)).toBeUndefined()
})

test('allows tracker edits and ignored files in the main checkout', async ($, on) => {
  fakeGit(on)
  const tracker = await $.tool.call({ tool: 'Edit', file_path: REPO + '/.wayfinder/m/tickets/t.md', old_string: 'a', new_string: 'b' } as any)
  const ignored = await $.tool.call({ tool: 'Write', file_path: REPO + '/dist/out.js', content: 'x' } as any)
  expect(refusal(tracker)).toBeUndefined()
  expect(refusal(ignored)).toBeUndefined()
})

test('allows an edit in a repo with no origin', async ($, on) => {
  fakeGit(on)
  const ran = await $.tool.call({ tool: 'Write', file_path: NO_ORIGIN + '/notes/a.md', content: 'x' } as any)
  expect(refusal(ran)).toBeUndefined()
})

test('fetches, then refuses a new worktree branch from a local base', async ($, on) => {
  const calls: string[][] = []
  fakeGit(on, { calls })
  const ran = await $.tool.call({ tool: 'Bash', command: 'git worktree add .worktrees/x -b x main' } as any)
  expect(refusal(ran)).toContain('`origin/main` as the start point')
  expect(calls.some(c => c.includes('fetch'))).toBe(true)
})

test('lets a new worktree branch from origin through', async ($, on) => {
  fakeGit(on)
  const ran = await $.tool.call({ tool: 'Bash', command: 'git worktree add .worktrees/x -b x origin/main' } as any)
  expect(refusal(ran)).toBeUndefined()
})

test('leaves worktree commands alone in a repo with no origin', async ($, on) => {
  const calls: string[][] = []
  fakeGit(on, { calls, cwd: NO_ORIGIN })
  const ran = await $.tool.call({ tool: 'Bash', command: 'git worktree add ../y -b y main' } as any)
  expect(refusal(ran)).toBeUndefined()
  expect(calls.some(c => c.includes('fetch'))).toBe(false)
})

test('ignores worktree text inside a quoted argument', async ($, on) => {
  const calls: string[][] = []
  fakeGit(on, { calls })
  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m "docs: run git worktree add -b x main"' } as any)
  expect(refusal(ran)).toBeUndefined()
  expect(calls.some(c => c.includes('fetch'))).toBe(false)
})

test('parses worktree add commands at a command position', async () => {
  expect(parseWorktreeAdd('git -C /r worktree add .worktrees/x -b x origin/main')).toEqual({ dir: '/r', createsBranch: true, startPoint: 'origin/main' })
  expect(parseWorktreeAdd('cd /r && git worktree add ../y existing')).toEqual({ dir: undefined, createsBranch: false, startPoint: 'existing' })
  expect(parseWorktreeAdd('echo "git worktree add -b x main"')).toBeUndefined()
  expect(parseWorktreeAdd('git status')).toBeUndefined()
})
