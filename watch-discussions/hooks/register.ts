import type { Register, EngineInterface, McpToolResult } from 'claude-code'
import { PR_FIELDS, PR_URL, TEAMS, TEAMS_LINK, changes, contextBlock, instructions, line, newActivity, newReplies, parseItems, parsePr, threadInstructions, threadOfCall, threadOfLink, threadUri, toSnapshot } from './state.js'
import type { Change, Reply, Snapshot, Thread, ThreadId } from './state.js'

const POLL_MS = 60_000
const MAX_WATCHED = 20
// A turn that finds its work already done costs the user one line to read, not a paragraph.
const NOTHING_LEFT = 'If nothing is left to do, reply in one line.'

// `mergedHere` holds the URLs of the PRs this session merged with `gh pr merge`. Threads are keyed by their `teams:///` URI.
type Watch = { prs: Record<string, Snapshot>; threads: Record<string, Thread>; turns: Record<string, number>; unwatched: string[]; mergedHere: string[] }

const empty = (): Watch => ({ prs: {}, threads: {}, turns: {}, unwatched: [], mergedHere: [] })

let watch = empty()
let storeKey = ''
// The gh user. Claude replies through gh as this user, so their reviews and comments are not news.
let self = ''
// A plugin's prompt waits until Claude is idle, so news found mid-turn can be stale by then.
// PR polls skip while a turn runs; the first poll after it compares against the last snapshot.
const runningTurns = new Set<string>()
// The Microsoft 365 user. Claude can post to Teams as this user, so their replies are not news.
let me = ''
// Thread news found during a turn, by thread URI, held for the main loop's next tool result.
let pending: Record<string, { thread: Thread; replies: Reply[] }> = {}
// A failing connector shows one toast, not one a minute.
let isTeamsFailing = false

async function lookUpSelf($: EngineInterface) {
  if (self) return
  try {
    const ran = await $.process.run(['gh', 'api', 'user', '--jq', '.login'], { timeoutMs: 20_000 })
    if (ran.exitCode === 0) self = ran.stdout.trim()
  } catch {}
}

// A connector call has no timeout of its own. One that outlasts the gh calls' 20 seconds counts as failed.
function callTeams($: EngineInterface, tool: string, args?: Record<string, unknown>) {
  return new Promise<McpToolResult>((resolve, reject) => {
    const timer = $.clock.after(20_000, () => reject(new Error(`${tool} timed out`)))
    $.mcp.call(TEAMS, tool, args).then(resolve, reject).finally(() => timer.cancel())
  })
}

async function lookUpMe($: EngineInterface) {
  if (me) return
  try {
    const got = await callTeams($, 'get_me')
    if (!got.isError) me = String(parseItems(got.content.map(b => b.text ?? ''))[0]?.id ?? '')
  } catch {}
}

// Loads this session's watch from the store once, whichever hook runs first.
async function load($: EngineInterface) {
  if (storeKey) return
  storeKey = 'watch:' + (await $.session.id())
  watch = { ...empty(), ...((await $.store.get(storeKey)) as Partial<Watch> | undefined) }
}

const watchedCount = () => Object.keys(watch.prs).length + Object.keys(watch.threads).length

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

// The watched PRs that turned MERGED while a `gh pr merge` ran. GitHub is asked, not the command parsed: a merge
// with no PR named, `-R`, `--auto`, or a merge queue all leave the command's arguments a poor guide.
// The snapshots stay as they are, so the next poll still reports the merge, as a toast.
async function noteMergesHere($: EngineInterface) {
  const open = Object.values(watch.prs).filter(s => s.state === 'OPEN')
  const merged = await Promise.all(open.map(async s => ((await fetchPr($, s.url))?.state === 'MERGED' ? s.url : undefined)))
  const urls = merged.filter(url => url !== undefined)
  if (!urls.length) return
  watch.mergedHere = [...new Set([...watch.mergedHere, ...urls])]
  await save($)
}

async function add($: EngineInterface, url: string) {
  if (watch.prs[url] || watch.unwatched.includes(url) || watchedCount() >= MAX_WATCHED) return
  const pr = await fetchPr($, url)
  if (!pr) return
  watch.prs[url] = toSnapshot(pr, await $.clock.now())
  await save($)
}

// The thread's replies, newest first; one page is enough at one check a minute.
async function fetchReplies($: EngineInterface, t: ThreadId) {
  try {
    const got = await callTeams($, 'teams_list_channel_messages', { teamId: t.teamId, channelId: t.channelId, parentMessageId: t.messageId, limit: 50 })
    if (got.isError) return undefined
    return parseItems(got.content.map(b => b.text ?? '')).filter(item => typeof item.id === 'string') as Reply[]
  } catch {
    return undefined
  }
}

const NO_READ = 'the Microsoft 365 connector could not read the thread'

// Returns why the thread could not join the watch, for /watch-discussions to say.
async function addThread($: EngineInterface, t: ThreadId) {
  const uri = threadUri(t)
  if (watch.threads[uri] || watch.unwatched.includes(uri)) return undefined
  if (watchedCount() >= MAX_WATCHED) return `the watch holds ${MAX_WATCHED} PRs and threads already`
  const replies = await fetchReplies($, t)
  if (!replies) return NO_READ
  watch.threads[uri] = { ...t, replyIds: replies.map(r => r.id), checkedAt: await $.clock.now() }
  await save($)
  return undefined
}

// Checks every thread, during a turn too, and adds the replies from other people to `pending`.
async function checkThreads($: EngineInterface) {
  const threads = Object.values(watch.threads)
  if (!threads.length) return
  await lookUpMe($)
  let isFailing = !me
  const checkedAt = await $.clock.now()
  if (me)
    await Promise.all(
      threads.map(async prev => {
        const replies = await fetchReplies($, prev)
        const uri = threadUri(prev)
        // /unwatch-discussions can run during the fetch.
        if (!watch.threads[uri]) return
        if (!replies) {
          isFailing = true
          return
        }
        const found = newReplies(replies, prev.replyIds, me)
        const thread = { ...prev, replyIds: replies.map(r => r.id), checkedAt }
        watch.threads[uri] = thread
        if (found.length) pending[uri] = { thread, replies: [...(pending[uri]?.replies ?? []), ...found] }
      }),
    )
  noteTeams($, isFailing)
  await save($)
}

function noteTeams($: EngineInterface, isFailing: boolean) {
  if (isFailing && !isTeamsFailing) $.ui.toast('watch-discussions could not read Teams. Check the Microsoft 365 sign-in in /mcp.')
  isTeamsFailing = isFailing
}

function takePending() {
  const news = Object.values(pending)
  pending = {}
  return news
}

const nextTurn = (key: string) => (watch.turns[key] ?? 0) + 1

// Shows the news, and below the turn cap starts a turn on it.
async function announce($: EngineInterface, key: string, subject: string, label: string, { what, steps }: { what: string; steps: string[] }) {
  $.ui.toast(`${label} ${what}`)
  if (!steps.length) return
  watch.turns[key] = (watch.turns[key] ?? 0) + 1
  await save($)
  $.prompt.submit({ text: `${subject} ${what}.\n\n${steps.join('\n\n')}\n\n${NOTHING_LEFT}` }).catch(() => $.ui.toast(`watch-discussions could not start a turn for ${label}`))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    storeKey = ''
    me = ''
    pending = {}
    isTeamsFailing = false
    await load($)
    await save($)

    // Threads are checked during a turn too: a reply that corrects the session must reach it before its next push.
    $.clock.every(POLL_MS, async () => {
      await checkThreads($)
      if (runningTurns.size) return
      for (const { thread, replies } of takePending()) {
        const uri = threadUri(thread)
        await announce($, uri, `Teams thread ${uri}`, 'Teams thread', threadInstructions(thread, replies, nextTurn(uri)))
      }
    })

    // A timer of its own: a connector call has no timeout, and a hung one must not hold the PR polls back.
    $.clock.every(POLL_MS, async () => {
      if (runningTurns.size) return
      for (const { snap, found } of await refresh($))
        await announce($, snap.url, `PR ${snap.url}`, `#${snap.number}`, instructions(snap, found, nextTurn(snap.url), watch.mergedHere.includes(snap.url)))
    })

    await $.command.register({ name: 'watch-discussions', description: 'List watched PRs and Teams threads, or watch the PR URLs and Teams links given', argumentHint: '[pr-url|teams-link...]', immediate: true })
    await $.command.register({ name: 'unwatch-discussions', description: 'Stop watching a PR or a Teams thread, or all of them', argumentHint: '<pr-url|teams-link|all>', immediate: true })
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
    if (/\bgh\s+pr\s+merge\b/.test(e.command)) await noteMergesHere($)
    const printed = /\bgh\s+pr\s+create\b/.test(e.command) ? (ran.text ?? '').match(PR_URL) ?? [] : []
    for (const url of new Set([...(e.command.match(PR_URL) ?? []), ...printed])) await add($, url)
    return ran
  })

  // A thread joins the watch when the main loop or a subagent reads it with the connector. News found during a turn
  // goes into the main loop's next tool result: a subagent's would not reach the loop that pushes and opens PRs.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const read = threadOfCall(e as Record<string, unknown>, ran.text ?? '')
    if (read) {
      await load($)
      if ((await addThread($, read)) === NO_READ) noteTeams($, true)
    }
    if (e.agentId || !Object.keys(pending).length) return ran
    const news = takePending().map(({ thread, replies }) => {
      const { what, steps } = threadInstructions(thread, replies, 0)
      return `While you worked, Teams thread ${threadUri(thread)} ${what}.\n\n${steps.join('\n\n')}`
    })
    return { ...ran, context: [...(ran.context ?? []), news.join('\n\n')] }
  })

  // The user's prompt carries PR state fetched now, not at the start of the session. Threads keep their last check,
  // at most a minute old, so the connector sees one call per thread a minute.
  on('prompt.submit', async ($, e, next) => {
    await load($)
    if (e.origin.kind === 'plugin' || watchedCount() === 0) return next(e)
    const report = await refresh($)
    const extra = [contextBlock(Object.values(watch.prs), Object.values(watch.threads), await $.clock.now())]
    for (const { snap, found } of report) {
      const { what, steps } = instructions(snap, found, 0, watch.mergedHere.includes(snap.url))
      extra.push(`Since the last check, PR ${snap.url} ${what}.` + (steps.length ? " After the user's request: " + steps.join(' ') : ''))
    }
    for (const { thread, replies } of takePending()) {
      const { what, steps } = threadInstructions(thread, replies, 0)
      extra.push(`Since the last check, Teams thread ${threadUri(thread)} ${what}. ${steps.join(' ')}`)
    }
    return next({ ...e, context: [...(e.context ?? []), ...extra] })
  })

  on('command.run', { command: 'watch-discussions' }, async ($, e) => {
    await load($)
    const urls: string[] = e.args.match(PR_URL) ?? []
    const links: string[] = e.args.match(TEAMS_LINK) ?? []
    const threads = links.map(link => ({ link, thread: threadOfLink(link) }))
    const keys = [...urls, ...threads.flatMap(({ thread }) => (thread ? [threadUri(thread)] : []))]
    watch.unwatched = watch.unwatched.filter(key => !keys.includes(key))
    for (const url of urls) await add($, url)
    const failed: string[] = []
    for (const { link, thread } of threads) {
      const why = thread ? await addThread($, thread) : 'the link names no team'
      if (why) failed.push(`Could not watch ${link}: ${why}.`)
    }
    if (!urls.length && !links.length) await refresh($)
    const rows = [
      ...Object.values(watch.prs).map(s => `${line(s)}  ${s.url}`),
      ...Object.values(watch.threads).map(t => `Teams thread · ${t.replyIds.length} replies  ${threadUri(t)}`),
    ]
    const listed = rows.length ? rows : ['Nothing watched. Pass a PR URL or a Teams link, or read one with gh or the Microsoft 365 connector.']
    return { text: [...failed, ...listed].join('\n') }
  })

  on('command.run', { command: 'unwatch-discussions' }, async ($, e) => {
    await load($)
    const target = e.args.trim()
    const keys =
      target === 'all'
        ? [...Object.keys(watch.prs), ...Object.keys(watch.threads)]
        : [...(target.match(PR_URL) ?? []), ...(target.match(TEAMS_LINK) ?? []).map(threadOfLink).filter(t => t !== undefined).map(threadUri)]
    for (const key of keys) {
      delete watch.prs[key]
      delete watch.threads[key]
      delete watch.turns[key]
      delete pending[key]
    }
    watch.mergedHere = watch.mergedHere.filter(url => !keys.includes(url))
    watch.unwatched = [...new Set([...watch.unwatched, ...keys])]
    await save($)
    return { text: `Watching ${watchedCount()} PRs and threads. Use /watch-discussions <PR URL or Teams link> to watch one again.` }
  })
}
