export const PR_FIELDS = 'number,title,url,state,reviewDecision,reviews,comments,statusCheckRollup'

// Caps the automatic turns for one PR or call, so a bot comment on each push or a flaky check cannot loop.
export const MAX_TURNS = 5

export type Checks = 'none' | 'pending' | 'pass' | 'fail'

// An empty string means no review is required.
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | ''
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'

export type Review = { id: string; author?: { login?: string }; state: ReviewState }
type Comment = { id: string; author?: { login?: string } }
type CheckStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'WAITING' | 'PENDING' | 'REQUESTED'
type CheckConclusion = 'ACTION_REQUIRED' | 'CANCELLED' | 'FAILURE' | 'NEUTRAL' | 'SKIPPED' | 'STALE' | 'STARTUP_FAILURE' | 'SUCCESS' | 'TIMED_OUT'
type StatusState = 'ERROR' | 'EXPECTED' | 'FAILURE' | 'PENDING' | 'SUCCESS'
// A CheckRun has a status and a conclusion, and a StatusContext has a state. gh prints null for the fields a kind does not have.
type Check = { status?: CheckStatus | null; conclusion?: CheckConclusion | '' | null; state?: StatusState | null }

// What `gh pr view --json` prints for PR_FIELDS.
export type PrJson = {
  url: string
  number: number
  title: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  reviewDecision: ReviewDecision
  reviews: Review[]
  comments: Comment[]
  statusCheckRollup: Check[]
}

export type Snapshot = {
  url: string
  number: number
  title: string
  state: PrJson['state']
  reviewDecision: ReviewDecision
  checks: Checks
  reviewIds: string[]
  commentIds: string[]
  fetchedAt: number
}

export type Change =
  | { kind: 'merged' | 'closed' }
  | { kind: 'decision'; from: ReviewDecision; to: ReviewDecision }
  | { kind: 'review'; author: string; state: ReviewState; isCopilot: boolean }
  | { kind: 'comment'; author: string }
  | { kind: 'checks'; to: 'pass' | 'fail' }

const FAILED = new Set<CheckConclusion | StatusState | ''>(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])

export const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g

export function isCopilot(login = '') {
  return /copilot/i.test(login)
}

export function summarizeChecks(rollup: Check[] = []): Checks {
  if (rollup.length === 0) return 'none'
  if (rollup.some(c => FAILED.has(c.conclusion || c.state || ''))) return 'fail'
  if (rollup.some(c => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING' || c.state === 'EXPECTED')) return 'pending'
  return 'pass'
}

// gh prints exactly the PR_FIELDS it was asked for, so its output is trusted here, once.
export function parsePr(json: string): PrJson {
  return JSON.parse(json) as PrJson
}

export function toSnapshot(pr: PrJson, now: number): Snapshot {
  return {
    url: pr.url,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    reviewDecision: pr.reviewDecision,
    checks: summarizeChecks(pr.statusCheckRollup),
    reviewIds: pr.reviews.map(r => r.id),
    commentIds: pr.comments.map(c => c.id),
    fetchedAt: now,
  }
}

// Reviews and comments the session has not seen, without the user's own: Claude replies through gh as the user.
// While the user's login is unknown, only Copilot's activity counts, so Claude's replies cannot start a loop.
export function newActivity(pr: PrJson, prev: Snapshot, self: string) {
  const isNew = (seen: string[]) => (x: Comment) => {
    const login = x.author?.login ?? ''
    return !seen.includes(x.id) && (self ? login !== self : isCopilot(login))
  }
  return {
    reviews: pr.reviews.filter(isNew(prev.reviewIds ?? [])),
    comments: pr.comments.filter(isNew(prev.commentIds ?? [])),
  }
}

export function changes(prev: Snapshot, next: Snapshot, { reviews, comments }: { reviews: Review[]; comments: Comment[] }): Change[] {
  const out: Change[] = []
  if (prev.state === 'OPEN' && next.state === 'MERGED') out.push({ kind: 'merged' })
  if (prev.state === 'OPEN' && next.state === 'CLOSED') out.push({ kind: 'closed' })
  if (prev.reviewDecision !== next.reviewDecision && next.reviewDecision)
    out.push({ kind: 'decision', from: prev.reviewDecision, to: next.reviewDecision })
  for (const r of reviews) {
    const author = r.author?.login ?? 'someone'
    out.push({ kind: 'review', author, state: r.state, isCopilot: isCopilot(author) })
  }
  for (const c of comments) out.push({ kind: 'comment', author: c.author?.login ?? 'someone' })
  if (prev.checks !== next.checks && (next.checks === 'pass' || next.checks === 'fail'))
    out.push({ kind: 'checks', to: next.checks })
  return out
}

export function describe(c: Change) {
  switch (c.kind) {
    case 'merged': return 'was merged'
    case 'closed': return 'was closed without merging'
    case 'decision': return `review decision is now ${c.to}`
    case 'review': return `${c.author} left a ${c.state} review`
    case 'checks': return c.to === 'pass' ? 'checks passed' : 'checks failed'
    case 'comment': return `${c.author} commented`
  }
}

export function line(s: Snapshot) {
  if (s.state !== 'OPEN') return `#${s.number} ${s.state.toLowerCase()}`
  const decision = s.reviewDecision ? s.reviewDecision.toLowerCase().replace('_', ' ') : 'no decision'
  return `#${s.number} ${decision} · checks ${s.checks}`
}

export function contextBlock(snaps: Snapshot[], calls: Call[], now: number) {
  const age = (at: number) => Math.round((now - at) / 1000)
  const rows = snaps.map(s =>
    `- ${s.url} "${s.title}": ${s.state}, review decision ${s.reviewDecision || 'none'}, checks ${s.checks}, ${s.reviewIds.length} reviews (fetched ${age(s.fetchedAt)}s ago)`)
  const callRows = calls.map(c => `- ${callLabel(c)} (checked ${age(c.checkedAt)}s ago)`)
  return ['Live state of the PRs and connector calls this session watches. It is newer than anything earlier in the conversation:', ...rows, ...callRows].join('\n')
}

// What Claude does about the changes. `turn` is the automatic turn's number for this PR, or 0 inside the user's own turn.
// A merge this session ran is not news: the session already knows what comes after it.
export function instructions(s: Snapshot, found: Change[], turn: number, isMergedHere = false) {
  const what = found.map(describe).join('; ')
  const steps: string[] = []
  const [, owner, repo] = s.url.match(/github\.com\/([^/]+)\/([^/]+)/) ?? []
  const inline = `\`gh api repos/${owner}/${repo}/pulls/${s.number}/comments\``
  if (found.some(c => c.kind === 'review' && c.isCopilot))
    steps.push(
      `Copilot reviewed. Read its inline comments with ${inline}. Judge each one critically. ` +
        `Fix it if it is right; otherwise reply on the comment with the reason. Push the fixes, then re-request Copilot's review.`,
    )
  if (found.some(c => (c.kind === 'review' && !c.isCopilot && c.state !== 'APPROVED') || c.kind === 'comment'))
    steps.push(
      `A person reviewed or commented. Read the review bodies and comments with \`gh pr view ${s.url} --comments\`, ` +
        `and the inline comments with ${inline}. ` +
        `Judge each point critically. Fix it if it is right; otherwise reply with the reason. Push the fixes, then re-request that person's review.`,
    )
  if (found.some(c => c.kind === 'checks' && c.to === 'fail'))
    steps.push(`Find the failing check with \`gh pr checks ${s.url}\`, read its log, and fix the cause.`)
  const merged = found.some(c => c.kind === 'merged')
  if (merged && !isMergedHere) steps.push('Continue with the steps that come after the merge. Remove the merged worktree and its local branch.')
  // A merge happens once, so it cannot loop; it passes the cap.
  if (turn > MAX_TURNS && !merged) return { what: `${what} (watch-discussions started ${MAX_TURNS} turns for this PR, so it only reports now)`, steps: [] }
  return { what, steps }
}


// A connector tool's name, `mcp__<server>__<tool>`. `$.mcp.call` takes the server in this spelling too.
export const MCP = /^mcp__(.+?)__(.+)$/

// A watched connector call: the tool and arguments the main loop called, and the `id` and `ts` values of its last result.
export type Call = { tool: string; args: Record<string, unknown>; seen: string[]; checkedAt: number }

export const callLabel = (c: Call) => `${c.tool} ${JSON.stringify(c.args)}`

// The model can pass a call's input with its keys in another order.
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

// A result's JSON objects and arrays, in order. The types do not state how `text` joins a result's content blocks,
// so one value can follow another with no separator, as `}{`. A brace inside a string does not count.
export function parse(texts: string[]): unknown[] {
  const values: unknown[] = []
  for (const text of texts) {
    let depth = 0
    let start = 0
    let isInString = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (isInString) {
        if (ch === '\\') i++
        else if (ch === '"') isInString = false
      } else if (ch === '"' && depth > 0) isInString = true
      else if (ch === '{' || ch === '[') {
        if (depth++ === 0) start = i
      } else if ((ch === '}' || ch === ']') && depth > 0 && --depth === 0) {
        try {
          values.push(JSON.parse(text.slice(start, i + 1)))
        } catch {}
      }
    }
  }
  return values
}

// The `id` and `ts` values an object holds itself: a reply, a message, or a comment carries one.
function idsOf(o: object) {
  return ['id', 'ts'].flatMap(k => {
    const v = (o as Record<string, unknown>)[k]
    return typeof v === 'string' || typeof v === 'number' ? [String(v)] : []
  })
}

// Slack prints each message's ts in text, as `Message TS: 1700000000.000100`. A generic `ID:` label is not read:
// it also matches a value that changes on each call, such as a request id.
const TEXT_TS = /\bTS: (\d+\.\d+)/g

// Every `id` and `ts` value at any depth, and every ts in a text.
export function ids(v: unknown, out = new Set<string>()) {
  if (typeof v === 'string') for (const [, ts = ''] of v.matchAll(TEXT_TS)) out.add(ts)
  if (v && typeof v === 'object') {
    for (const id of idsOf(v)) out.add(id)
    for (const x of Object.values(v)) ids(x, out)
  }
  return out
}

// The outermost objects with an `id` or `ts` value that `seen` lacks. An edit keeps its ID, so it is not news.
// In a text, the part that holds a new ts: a whole thread can pass the cut in `callNews`. A part starts at the blank
// line before its ts, so it keeps the `From` line above the ts and the blank lines inside a reply.
export function newItems(v: unknown, seen: Set<string>): object[] {
  if (typeof v === 'string') {
    const found = [...v.matchAll(TEXT_TS)]
    const starts = found.map(m => v.lastIndexOf('\n\n', m.index) + 1)
    return found.flatMap(([, ts = ''], i) => (seen.has(ts) ? [] : [{ ts, text: v.slice(starts[i], starts[i + 1]).trim() }]))
  }
  if (!v || typeof v !== 'object') return []
  if (idsOf(v).some(id => !seen.has(id))) return [v]
  return Object.values(v).flatMap(x => newItems(x, seen))
}

const NEWS_CHARS = 2_000

// What Claude does about new items. `turn` is the automatic turn's number for this call, or 0 inside a running turn.
export function callNews(c: Call, items: object[], turn: number) {
  const n = items.length
  const what = `returned ${n} new ${n === 1 ? 'item' : 'items'}`
  if (turn > MAX_TURNS) return { what: `${what} (watch-discussions started ${MAX_TURNS} turns for this call, so it only reports now)`, steps: [] }
  const shown = items.map(item => JSON.stringify(item)).join('\n')
  return {
    what,
    steps: [
      shown.length > NEWS_CHARS ? `${shown.slice(0, NEWS_CHARS)}\n[cut at ${NEWS_CHARS} characters]` : shown,
      `For the full text, call ${c.tool} with ${JSON.stringify(c.args)}.`,
      'Check whether the new items change a fact or a decision this session acted on. If they do, tell the user and change course before your next step outside the session, such as a push, a PR, or a message.',
    ],
  }
}
