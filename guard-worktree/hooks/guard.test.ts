import { test, expect } from 'claude-code/testing'
import { parseWorktreeAdd } from './rules.ts'

const REPO = '/repo'

// Answers git as a repo whose main checkout is /repo and whose worktrees sit under /repo/.worktrees.
function fakeGit(on: any, calls: string[][] = []) {
  on('fs.exists', async () => ({ value: true }))
  on('process.run', async ($: unknown, e: { argv: readonly string[] }) => {
    const argv = [...e.argv]
    calls.push(argv)
    const dir = argv[2] ?? ''
    if (argv.includes('rev-parse') && dir.startsWith('/home')) return { value: { exitCode: 0, stdout: '/home\n/home/.git\n/home/.git\n', stderr: '' } }
    if (argv.includes('rev-parse')) {
      const linked = dir.startsWith(REPO + '/.worktrees/wt')
      const top = linked ? REPO + '/.worktrees/wt' : REPO
      const gitDir = linked ? REPO + '/.git/worktrees/wt' : REPO + '/.git'
      return { value: { exitCode: 0, stdout: `${top}\n${gitDir}\n${REPO}/.git\n`, stderr: '' } }
    }
    if (argv.includes('get-url')) return { value: { exitCode: dir === '/home' ? 2 : 0, stdout: 'git@github.com:acme/api.git\n', stderr: '' } }
    if (argv.includes('symbolic-ref')) return { value: { exitCode: 0, stdout: 'origin/main\n', stderr: '' } }
    if (argv.includes('check-ignore')) return { value: { exitCode: argv.at(-1)!.includes('/dist/') ? 0 : 1, stdout: '', stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('session.cwd', async () => ({ value: REPO }))
  on('tool.call', async () => ({ result: 'ran' }))
}

const refusal = (ran: any): string | undefined => ran.deny ?? (ran.isError ? ran.text : undefined)

test('refuses an edit in the main checkout', async ($, on) => {
  fakeGit(on)
  const ran = await $.tool.call({ tool: 'Edit', file_path: REPO + '/src/a.ts', old_string: 'a', new_string: 'b' } as any)
  expect(refusal(ran)).toContain('worktree add .worktrees/<branch> -b <branch> origin/main')
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
  const ran = await $.tool.call({ tool: 'Write', file_path: '/home/notes/a.md', content: 'x' } as any)
  expect(refusal(ran)).toBeUndefined()
})

test('fetches, then refuses a new worktree branch from a local base', async ($, on) => {
  const calls: string[][] = []
  fakeGit(on, calls)
  const ran = await $.tool.call({ tool: 'Bash', command: 'git worktree add .worktrees/x -b x main' } as any)
  expect(refusal(ran)).toContain('origin/main')
  expect(calls.some(c => c.includes('fetch'))).toBe(true)
})

test('lets a new worktree branch from origin through', async ($, on) => {
  fakeGit(on)
  const ran = await $.tool.call({ tool: 'Bash', command: 'git worktree add .worktrees/x -b x origin/main' } as any)
  expect(refusal(ran)).toBeUndefined()
})

test('parses worktree add commands', async () => {
  expect(parseWorktreeAdd('git -C /r worktree add .worktrees/x -b x origin/main')).toEqual({ dir: '/r', createsBranch: true, startPoint: 'origin/main' })
  expect(parseWorktreeAdd('git worktree add ../y existing')).toEqual({ dir: undefined, createsBranch: false, startPoint: 'existing' })
  expect(parseWorktreeAdd('git status')).toBeUndefined()
})
