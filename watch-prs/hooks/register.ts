import type { Register, EngineInterface } from 'claude-code'
import { PR_FIELDS, PR_URL, changes, contextBlock, describe, line, newActivity, toSnapshot } from './state.ts'
import type { Change, Snapshot } from './state.ts'

const POLL_MS = 60_000
const MAX_COPILOT_ROUNDS = 3
const MAX_WATCHED = 20

type Watch = { prs: Record<string, Snapshot>; copilotRounds: Record<string, number> }

let watch: Watch = { prs: {}, copilotRounds: {} }
let storeKey = ''
let self = ''
// A plugin's prompt waits until Claude is idle, so news found mid-turn can be stale by then.
// Polls skip while a turn runs; the first poll after it compares against the last snapshot.
const runningTurns = new Set<string>()
// What each queued prompt reports, so a prompt that went stale while it waited can be dropped.
const queued = new Map<string, { url: string; found: Change[] }>()

// Loads this session's watch from the store once, whichever hook runs first.
async function load($: EngineInterface) {
  if (storeKey) return
  storeKey = 'watch:' + (await $.session.id())
  try {
    self = (await $.process.run(['gh', 'api', 'user', '--jq', '.login'], { timeoutMs: 20_000 })).stdout.trim()
  } catch {}
  watch = ((await $.store.get(storeKey)) as Watch | undefined) ?? { prs: {}, copilotRounds: {} }
}

async function save($: EngineInterface) {
  await $.store.set(storeKey, watch)
  const open = Object.values(watch.prs)
  $.ui.status(open.length ? 'PRs: ' + open.map(line).join(' | ') : undefined)
}

async function fetchPr($: EngineInterface, url: string) {
  try {
    const ran = await $.process.run(['gh', 'pr', 'view', url, '--json', PR_FIELDS], { timeoutMs: 20_000 })
    return ran.exitCode === 0 ? ran.stdout : undefined
  } catch {
    return undefined
  }
}

function instructions(s: Snapshot, found: Change[], copilotRound: number) {
  const what = found.map(describe).join('; ')
  const steps: string[] = []
  const [, owner, repo] = s.url.match(/github\.com\/([^/]+)\/([^/]+)/) ?? []
  if (found.some(c => c.kind === 'review' && c.isCopilot) && copilotRound <= MAX_COPILOT_ROUNDS) {
    steps.push(
      `Copilot review round ${copilotRound} of ${MAX_COPILOT_ROUNDS}: read its inline comments with ` +
        `\`gh api repos/${owner}/${repo}/pulls/${s.number}/comments\`. Judge each one critically. ` +
        `Fix it if it is right; otherwise reply on the comment with the reason. Push the fixes, then re-request Copilot's review.`,
    )
  }
  if (found.some(c => (c.kind === 'review' && !c.isCopilot && c.state !== 'APPROVED') || c.kind === 'comment'))
    steps.push(
      `A person reviewed or commented. Read the review bodies and comments with \`gh pr view ${s.url} --comments\`, ` +
        `and the inline comments with \`gh api repos/${owner}/${repo}/pulls/${s.number}/comments\`. ` +
        `Judge each point critically. Fix it if it is right; otherwise reply with the reason. Push the fixes, then re-request that person's review.`,
    )
  if (found.some(c => c.kind === 'checks' && c.to === 'fail'))
    steps.push(`Find the failing check with \`gh pr checks ${s.url}\`, read its log, and fix the cause.`)
  if (found.some(c => c.kind === 'merged'))
    steps.push('Continue with the steps that come after the merge. Remove the merged worktree and its local branch.')
  return { what, steps }
}

// Refreshes every open PR. Returns what changed, keyed by URL.
async function refresh($: EngineInterface) {
  const report: { snap: Snapshot; found: Change[] }[] = []
  await Promise.all(
    Object.values(watch.prs)
      .filter(prev => prev.state === 'OPEN')
      .map(async prev => {
        const json = await fetchPr($, prev.url)
        if (!json) return
        const snap = toSnapshot(json, await $.clock.now())
        const found = changes(prev, snap, newActivity(json, prev, self))
        watch.prs[prev.url] = snap
        if (found.length) report.push({ snap, found })
      }),
  )
  for (const { snap, found } of report)
    if (found.some(c => c.kind === 'review' && c.isCopilot))
      watch.copilotRounds[snap.url] = (watch.copilotRounds[snap.url] ?? 0) + 1
  await save($)
  return report
}

async function add($: EngineInterface, url: string) {
  if (watch.prs[url] || Object.keys(watch.prs).length >= MAX_WATCHED) return false
  const json = await fetchPr($, url)
  if (!json) return false
  watch.prs[url] = toSnapshot(json, await $.clock.now())
  await save($)
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    storeKey = ''
    await load($)
    await save($)

    $.clock.every(POLL_MS, async () => {
      if (runningTurns.size) return
      for (const { snap, found } of await refresh($)) {
        const { what, steps } = instructions(snap, found, watch.copilotRounds[snap.url] ?? 0)
        $.ui.toast(`#${snap.number} ${what}`)
        if (!steps.length) continue
        const text = `PR ${snap.url} ${what}.\n\n${steps.join('\n\n')}`
        queued.set(text, { url: snap.url, found })
        void $.prompt.submit({ text })
      }
    })

    await $.command.register({ name: 'watch-prs', description: 'List watched PRs, or watch the PR URLs given', argumentHint: '[pr-url...]', immediate: true })
    await $.command.register({ name: 'unwatch-prs', description: 'Stop watching a PR, or all of them', argumentHint: '<pr-url|all>', immediate: true })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    runningTurns.add(e.turnId)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    runningTurns.delete(e.turnId)
    return next(e)
  })

  // Every PR the session looks at or opens joins the watch.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!/\bgh\s+(pr|api)\b/.test(e.command)) return ran
    await load($)
    const urls = new Set([...(e.command.match(PR_URL) ?? []), ...((ran.text ?? '').match(PR_URL) ?? [])])
    for (const url of urls) await add($, url)
    return ran
  })

  // The user's prompt carries state fetched now, not at the start of the session.
  on('prompt.submit', async ($, e, next) => {
    await load($)
    if (e.origin.kind === 'plugin' && e.origin.name === $.plugin.name) {
      // A prompt waits until Claude is idle; a failure fixed in the meantime is no news.
      const report = queued.get(e.text)
      queued.delete(e.text)
      if (report && report.found.every(c => c.kind === 'checks' && c.to === 'fail')) {
        const json = await fetchPr($, report.url)
        if (json && toSnapshot(json, 0).checks !== 'fail') return { drop: 'the checks pass again' }
      }
      return next(e)
    }
    if (e.origin.kind === 'plugin' || Object.keys(watch.prs).length === 0) return next(e)
    const report = await refresh($)
    const now = await $.clock.now()
    const extra = [contextBlock(Object.values(watch.prs), now)]
    for (const { snap, found } of report) {
      const { what, steps } = instructions(snap, found, watch.copilotRounds[snap.url] ?? 0)
      extra.push(`Since the last check, PR ${snap.url} ${what}.` + (steps.length ? ' After the user\'s request: ' + steps.join(' ') : ''))
    }
    return next({ ...e, context: [...(e.context ?? []), ...extra] })
  })

  on('command.run', { command: 'watch-prs' }, async ($, e) => {
    await load($)
    const urls = e.args.match(PR_URL) ?? []
    for (const url of urls) await add($, url)
    if (!urls.length) await refresh($)
    const snaps = Object.values(watch.prs)
    return { text: snaps.length ? snaps.map(s => `${line(s)}  ${s.url}`).join('\n') : 'No PRs watched. Pass a PR URL, or open one with gh.' }
  })

  on('command.run', { command: 'unwatch-prs' }, async ($, e) => {
    await load($)
    const target = e.args.trim()
    if (target === 'all') watch = { prs: {}, copilotRounds: {} }
    else delete watch.prs[target]
    await save($)
    return { text: `Watching ${Object.keys(watch.prs).length} PRs.` }
  })
}
