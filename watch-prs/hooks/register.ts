import type { Register, EngineInterface } from 'claude-code'
import { PR_FIELDS, PR_URL, changes, contextBlock, instructions, line, newActivity, parsePr, toSnapshot } from './state.js'
import type { Change, Snapshot } from './state.js'

const POLL_MS = 60_000
const MAX_WATCHED = 20

type Watch = { prs: Record<string, Snapshot>; turns: Record<string, number>; unwatched: string[] }

const empty = (): Watch => ({ prs: {}, turns: {}, unwatched: [] })

let watch = empty()
let storeKey = ''
// The gh user. Claude replies through gh as this user, so their reviews and comments are not news.
let self = ''
// A plugin's prompt waits until Claude is idle, so news found mid-turn can be stale by then.
// Polls skip while a turn runs; the first poll after it compares against the last snapshot.
const runningTurns = new Set<string>()

async function lookUpSelf($: EngineInterface) {
  if (self) return
  try {
    const ran = await $.process.run(['gh', 'api', 'user', '--jq', '.login'], { timeoutMs: 20_000 })
    if (ran.exitCode === 0) self = ran.stdout.trim()
  } catch {}
}

// Loads this session's watch from the store once, whichever hook runs first.
async function load($: EngineInterface) {
  if (storeKey) return
  storeKey = 'watch:' + (await $.session.id())
  watch = { ...empty(), ...((await $.store.get(storeKey)) as Partial<Watch> | undefined) }
}

async function save($: EngineInterface) {
  await $.store.set(storeKey, watch)
  const open = Object.values(watch.prs)
  $.ui.status(open.length ? 'PRs: ' + open.map(line).join(' | ') : undefined)
}

async function fetchPr($: EngineInterface, url: string) {
  try {
    const ran = await $.process.run(['gh', 'pr', 'view', url, '--json', PR_FIELDS], { timeoutMs: 20_000 })
    return ran.exitCode === 0 ? parsePr(ran.stdout) : undefined
  } catch {
    return undefined
  }
}

// Refreshes every open PR and returns the PRs that changed.
async function refresh($: EngineInterface) {
  await lookUpSelf($)
  const report: { snap: Snapshot; found: Change[] }[] = []
  await Promise.all(
    Object.values(watch.prs)
      .filter(prev => prev.state === 'OPEN')
      .map(async prev => {
        const pr = await fetchPr($, prev.url)
        if (!pr) return
        const snap = toSnapshot(pr, await $.clock.now())
        const found = changes(prev, snap, newActivity(pr, prev, self))
        watch.prs[prev.url] = snap
        if (found.length) report.push({ snap, found })
      }),
  )
  await save($)
  return report
}

async function add($: EngineInterface, url: string) {
  if (watch.prs[url] || watch.unwatched.includes(url) || Object.keys(watch.prs).length >= MAX_WATCHED) return
  const pr = await fetchPr($, url)
  if (!pr) return
  watch.prs[url] = toSnapshot(pr, await $.clock.now())
  await save($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    storeKey = ''
    await load($)
    await save($)

    $.clock.every(POLL_MS, async () => {
      if (runningTurns.size) return
      for (const { snap, found } of await refresh($)) {
        const turn = (watch.turns[snap.url] ?? 0) + 1
        const { what, steps } = instructions(snap, found, turn)
        $.ui.toast(`#${snap.number} ${what}`)
        if (!steps.length) continue
        watch.turns[snap.url] = turn
        await save($)
        $.prompt.submit({ text: `PR ${snap.url} ${what}.\n\n${steps.join('\n\n')}` }).catch(() => $.ui.toast(`watch-prs could not start a turn for #${snap.number}`))
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

  // A PR joins the watch when a gh command names it, or when `gh pr create` prints it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!/\bgh\s+(pr|api)\b/.test(e.command)) return ran
    await load($)
    const printed = /\bgh\s+pr\s+create\b/.test(e.command) ? (ran.text ?? '').match(PR_URL) ?? [] : []
    for (const url of new Set([...(e.command.match(PR_URL) ?? []), ...printed])) await add($, url)
    return ran
  })

  // The user's prompt carries state fetched now, not at the start of the session.
  on('prompt.submit', async ($, e, next) => {
    await load($)
    if (e.origin.kind === 'plugin' || Object.keys(watch.prs).length === 0) return next(e)
    const report = await refresh($)
    const extra = [contextBlock(Object.values(watch.prs), await $.clock.now())]
    for (const { snap, found } of report) {
      const { what, steps } = instructions(snap, found, 0)
      extra.push(`Since the last check, PR ${snap.url} ${what}.` + (steps.length ? " After the user's request: " + steps.join(' ') : ''))
    }
    return next({ ...e, context: [...(e.context ?? []), ...extra] })
  })

  on('command.run', { command: 'watch-prs' }, async ($, e) => {
    await load($)
    const urls: string[] = e.args.match(PR_URL) ?? []
    watch.unwatched = watch.unwatched.filter(url => !urls.includes(url))
    for (const url of urls) await add($, url)
    if (!urls.length) await refresh($)
    const snaps = Object.values(watch.prs)
    return { text: snaps.length ? snaps.map(s => `${line(s)}  ${s.url}`).join('\n') : 'No PRs watched. Pass a PR URL, or open one with gh.' }
  })

  on('command.run', { command: 'unwatch-prs' }, async ($, e) => {
    await load($)
    const target = e.args.trim()
    const urls = target === 'all' ? Object.keys(watch.prs) : target.match(PR_URL) ?? []
    for (const url of urls) {
      delete watch.prs[url]
      delete watch.turns[url]
    }
    watch.unwatched = [...new Set([...watch.unwatched, ...urls])]
    await save($)
    return { text: `Watching ${Object.keys(watch.prs).length} PRs. Use /watch-prs <url> to watch one again.` }
  })
}
