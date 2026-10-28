import type { Register, EngineInterface, McpToolResult } from 'claude-code'
import { MCP, PR_FIELDS, PR_URL, callLabel, callNews, canon, changes, contextBlock, ids, instructions, line, newActivity, newItems, parse, parsePr, toSnapshot } from './state.js'
import type { Call, Change, Snapshot } from './state.js'

const POLL_MS = 60_000
const MAX_WATCHED = 20
// A turn that finds its work already done costs the user one line to read, not a paragraph.
const NOTHING_LEFT = 'If nothing is left to do, reply in one line.'
const PLUGIN = 'watch-discussions'
const WATCH = `mcp__${PLUGIN}__watch`
const RUN = 'Run'
const CANCEL = 'Cancel'
const FULL = `the watch holds ${MAX_WATCHED} items already, and /unwatch-discussions frees a place`

// `mergedHere` holds the URLs of the PRs this session merged with `gh pr merge`. Calls are keyed by `callKey`.
type Watch = { prs: Record<string, Snapshot>; calls: Record<string, Call>; turns: Record<string, number>; mergedHere: string[] }

const empty = (): Watch => ({ prs: {}, calls: {}, turns: {}, mergedHere: [] })

let watch = empty()
let storeKey = ''
// The gh user. Claude replies through gh as this user, so their reviews and comments are not news.
let self = ''
// A plugin's prompt waits until Claude is idle, so news found mid-turn can be stale by then.
// PR polls skip while a turn runs; the first poll after it compares against the last snapshot.
const runningTurns = new Set<string>()
// The connector calls the main loop made in this session, by `callKey`: what `watch` can pick, and its baseline.
let made: Record<string, { args: Record<string, unknown>; seen: string[]; isReadOnly: boolean }> = {}
// News found during a turn, by call key, held for the main loop's next tool result.
let pending: Record<string, { call: Call; items: object[] }> = {}
// A failing connector shows one toast, not one a minute.
let isFailing = false

const callKey = (tool: string, args: unknown) => `${tool} ${canon(args ?? {})}`

async function lookUpSelf($: EngineInterface) {
  if (self) return
  try {
    const ran = await $.process.run(['gh', 'api', 'user', '--jq', '.login'], { timeoutMs: 20_000 })
    if (ran.exitCode === 0) self = ran.stdout.trim()
  } catch {}
}

// A connector call has no timeout of its own. One that outlasts the gh calls' 20 seconds counts as failed.
function callConnector($: EngineInterface, c: Call) {
  const [, server = '', tool = ''] = c.tool.match(MCP) ?? []
  return new Promise<McpToolResult>((resolve, reject) => {
    const timer = $.clock.after(20_000, () => reject(new Error(`${c.tool} timed out`)))
    $.mcp.call(server, tool, c.args).then(resolve, reject).finally(() => timer.cancel())
  })
}

// Loads this session's watch from the store once, whichever hook runs first.
async function load($: EngineInterface) {
  if (storeKey) return
  storeKey = 'watch:' + (await $.session.id())
  watch = { ...empty(), ...((await $.store.get(storeKey)) as Partial<Watch> | undefined) }
}

// PRs first, then calls, in the order they joined: the numbers /unwatch-discussions takes.
const keys = () => [...Object.keys(watch.prs), ...Object.keys(watch.calls)]

const watchedCount = () => keys().length

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

// Returns why the PR could not join the watch.
async function add($: EngineInterface, url: string) {
  if (watch.prs[url]) return undefined
  if (watchedCount() >= MAX_WATCHED) return FULL
  const pr = await fetchPr($, url)
  if (!pr) return `gh could not read ${url}`
  watch.prs[url] = toSnapshot(pr, await $.clock.now())
  await save($)
  return undefined
}

// Repeats every watched call, during a turn too, and adds the items the session has not seen to `pending`.
async function checkCalls($: EngineInterface) {
  const calls = Object.entries(watch.calls)
  if (!calls.length) return
  let isFailed = false
  const checkedAt = await $.clock.now()
  await Promise.all(
    calls.map(async ([key, prev]) => {
      const got = await callConnector($, prev).catch(() => undefined)
      // /unwatch-discussions can run during the call.
      if (!watch.calls[key]) return
      if (!got || got.isError) {
        isFailed = true
        return
      }
      // Joined as the baseline's `ran.text` is, so both read the same text.
      const values = parse([got.content.map(b => b.text ?? '').join('')])
      const found = newItems(values, new Set(prev.seen))
      const call = { ...prev, seen: [...ids(values)], checkedAt }
      watch.calls[key] = call
      if (found.length) pending[key] = { call, items: [...(pending[key]?.items ?? []), ...found] }
    }),
  )
  if (isFailed && !isFailing) $.ui.toast('watch-discussions could not repeat a watched call. Check the connector in /mcp.')
  isFailing = isFailed
  await save($)
}

function takePending() {
  const news = Object.entries(pending).map(([key, { call, items }]) => ({ key, call, items }))
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
    made = {}
    pending = {}
    isFailing = false
    await load($)
    await save($)

    // Calls are repeated during a turn too: a reply that corrects the session must reach it before its next push.
    $.clock.every(POLL_MS, async () => {
      await checkCalls($)
      if (runningTurns.size) return
      for (const { key, call, items } of takePending())
        await announce($, key, `The watched call ${callLabel(call)}`, call.tool.replace(MCP, '$2'), callNews(call, items, nextTurn(key)))
    })

    // A timer of its own: a hung connector call must not hold the PR polls back.
    $.clock.every(POLL_MS, async () => {
      if (runningTurns.size) return
      for (const { snap, found } of await refresh($))
        await announce($, snap.url, `PR ${snap.url}`, `#${snap.number}`, instructions(snap, found, nextTurn(snap.url), watch.mergedHere.includes(snap.url)))
    })

    await $.tool.register({
      name: 'watch',
      description:
        'Watches a discussion that the task depends on, such as a thread, an issue, or a PR that the user gave you or that the task acts on, ' +
        'and tells you when someone adds to it, also while you work. Never watch a page that you read only for reference. ' +
        'Pass `url` for a GitHub PR. For anything else, read it with a connector tool first, then pass that tool\'s full name as `toolName` ' +
        'and the exact input you gave it as `input`. The watch repeats that call every minute.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'A GitHub PR URL.' },
          toolName: { type: 'string', description: 'The full name of a connector tool that you called in this session, such as mcp__<server>__<tool>.' },
          input: { type: 'object', description: 'The exact input of that call.' },
        },
      },
      isDeferred: false,
    })
    await $.command.register({ name: 'watch-discussions', description: 'List the watched PRs and connector calls, by number', immediate: true })
    await $.command.register({ name: 'unwatch-discussions', description: 'Stop watching an item by its number, or all of them', argumentHint: '<number|all>', immediate: true })
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

  // A PR joins the watch when `gh pr create` prints it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const isCreate = /\bgh\s+pr\s+create\b/.test(e.command)
    const isMerge = /\bgh\s+pr\s+merge\b/.test(e.command)
    if (ran.deny !== undefined || (!isCreate && !isMerge)) return ran
    await load($)
    if (isMerge) await noteMergesHere($)
    // `fire` waits on its own PR, so a PR left out tells the user and Claude why.
    const notes: string[] = []
    for (const url of new Set(isCreate ? (ran.text ?? '').match(PR_URL) ?? [] : [])) {
      const why = await add($, url)
      if (!why) continue
      $.ui.toast(`${PLUGIN} could not watch ${url}: ${why}.`)
      notes.push(`${PLUGIN} could not watch ${url}: ${why}. Nothing will report its reviews, checks, or merge. Tell the user.`)
    }
    return notes.length ? { ...ran, context: [...(ran.context ?? []), ...notes] } : ran
  })

  // Claude picks what to watch. A subagent cannot: the main loop holds the task.
  on('tool.call', { tool: WATCH }, async ($, e) => {
    if (e.agentId) return { deny: `${PLUGIN}: only the main session can watch. Name the discussion in your answer instead.` }
    await load($)
    if (typeof e.url === 'string') {
      const [url] = e.url.match(PR_URL) ?? []
      const why = url ? await add($, url) : `${e.url} is not a GitHub PR URL`
      return why ? { deny: `${PLUGIN}: ${why}.` } : { result: `${PLUGIN} watches ${url}.` }
    }
    const key = callKey(String(e.toolName), e.input)
    const read = made[key]
    if (!read)
      return {
        deny: `${PLUGIN}: the main session did not make the call ${e.toolName} ${JSON.stringify(e.input ?? {})} in this session. ` +
          'Pass a PR URL, or the exact tool name and input of a connector call that you made.',
      }
    const call: Call = { tool: String(e.toolName), args: read.args, seen: read.seen, checkedAt: await $.clock.now() }
    if (watch.calls[key]) return { result: `${PLUGIN} watches ${callLabel(call)} already.` }
    if (watchedCount() >= MAX_WATCHED) return { deny: `${PLUGIN}: ${FULL}.` }
    if (!call.seen.length) return { deny: `${PLUGIN}: the result of ${call.tool} holds no id or ts value, so a new item cannot be told from an old one.` }
    // A repeated write would post every minute.
    if (!read.isReadOnly) {
      const answer = await $.ui
        .ask(`The call is not marked read-only. Repeat it every minute to watch it?\n\n${callLabel(call)}`, { header: 'Watch', options: [RUN, CANCEL] })
        .catch(() => CANCEL)
      if (answer !== RUN) return { deny: `${PLUGIN}: the user cancelled the watch of ${callLabel(call)}. Do not ask again. Read it again yourself when the task needs it.` }
    }
    watch.calls[key] = call
    await save($)
    return { result: `${PLUGIN} repeats ${callLabel(call)} every minute and tells you each new item.` }
  })

  // Records the main loop's connector calls: what `watch` can pick.
  // News found during a turn goes into the main loop's next tool result: a subagent's would not reach the loop that
  // pushes and opens PRs.
  on('tool.call', async ($, e, next) => {
    // The mod's own question to the user is no tool result the model reads.
    if (next.origin.plugin === PLUGIN) return next(e)
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    if (!e.agentId && MCP.test(e.tool) && e.tool !== WATCH && !ran.isError) {
      const args = Object.fromEntries(Object.entries(e).filter(([k]) => !['tool', 'tool_use_id', 'agentId', 'requestMeta'].includes(k)))
      made[callKey(e.tool, args)] = { args, seen: [...ids(parse([ran.text ?? '']))], isReadOnly: ran.isReadOnly === true }
    }
    if (e.agentId) return ran
    const news = takePending().map(({ call, items }) => {
      const { what, steps } = callNews(call, items, 0)
      return `While you worked, the watched call ${callLabel(call)} ${what}.\n\n${steps.join('\n\n')}`
    })
    return news.length ? { ...ran, context: [...(ran.context ?? []), news.join('\n\n')] } : ran
  })

  // The user's prompt carries PR state fetched now, not at the start of the session. Calls keep their last check,
  // at most a minute old, so a connector sees one repeat of each call a minute.
  on('prompt.submit', async ($, e, next) => {
    await load($)
    if (e.origin.kind === 'plugin' || watchedCount() === 0) return next(e)
    const report = await refresh($)
    const extra = [contextBlock(Object.values(watch.prs), Object.values(watch.calls), await $.clock.now())]
    for (const { snap, found } of report) {
      const { what, steps } = instructions(snap, found, 0, watch.mergedHere.includes(snap.url))
      extra.push(`Since the last check, PR ${snap.url} ${what}.` + (steps.length ? " After the user's request: " + steps.join(' ') : ''))
    }
    for (const { call, items } of takePending()) {
      const { what, steps } = callNews(call, items, 0)
      extra.push(`Since the last check, the watched call ${callLabel(call)} ${what}. ${steps.join(' ')}`)
    }
    return next({ ...e, context: [...(e.context ?? []), ...extra] })
  })

  on('command.run', { command: 'watch-discussions' }, async $ => {
    await load($)
    await refresh($)
    const rows = [...Object.values(watch.prs).map(s => `${line(s)}  ${s.url}`), ...Object.values(watch.calls).map(callLabel)]
    if (!rows.length) return { text: 'Nothing watched. Claude watches a discussion with its watch tool, and each PR that the session opens with gh pr create.' }
    return { text: rows.map((row, i) => `${i + 1}. ${row}`).join('\n') }
  })

  on('command.run', { command: 'unwatch-discussions' }, async ($, e) => {
    await load($)
    const target = e.args.trim()
    const picked = target === 'all' ? keys() : [keys()[Number(target) - 1]].filter(key => key !== undefined)
    if (target !== 'all' && !picked.length) return { text: `No item ${target}. /watch-discussions lists the numbers.` }
    for (const key of picked) {
      delete watch.prs[key]
      delete watch.calls[key]
      delete watch.turns[key]
      delete pending[key]
    }
    watch.mergedHere = watch.mergedHere.filter(url => !picked.includes(url))
    // A call watched later starts a failure streak of its own, with its own toast.
    if (!Object.keys(watch.calls).length) isFailing = false
    await save($)
    return { text: `Watching ${watchedCount()} items.` }
  })
}
