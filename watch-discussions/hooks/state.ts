export const PR_FIELDS = 'number,title,url,state,reviewDecision,reviews,comments,statusCheckRollup'

// Caps the automatic turns for one PR or thread, so a bot comment on each push or a flaky check cannot loop.
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

export function contextBlock(snaps: Snapshot[], threads: Thread[], now: number) {
  const age = (at: number) => Math.round((now - at) / 1000)
  const rows = snaps.map(s =>
    `- ${s.url} "${s.title}": ${s.state}, review decision ${s.reviewDecision || 'none'}, checks ${s.checks}, ${s.reviewIds.length} reviews (fetched ${age(s.fetchedAt)}s ago)`)
  const threadRows = threads.map(t => `- Teams thread ${threadUri(t)}: ${t.replyIds.length} replies (checked ${age(t.checkedAt)}s ago)`)
  return ['Live state of the PRs and Teams threads this session watches. It is newer than anything earlier in the conversation:', ...rows, ...threadRows].join('\n')
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

export const TEAMS = 'claude.ai Microsoft 365'
const TEAMS_TOOL = 'mcp__claude_ai_Microsoft_365__'

export const TEAMS_LINK = /https:\/\/teams\.microsoft\.com\/l\/message\/[^\s/]+\/\d+\?\S+/g

export type ThreadId = { teamId: string; channelId: string; messageId: string }

export type Thread = ThreadId & { replyIds: string[]; checkedAt: number }

// One item of what `teams_list_channel_messages` prints. A system message has a null `from` and another `messageType`.
export type Reply = {
  id: string
  messageType: string
  from: { userId: string; displayName: string } | null
  createdDateTime: string
  bodyTruncated: boolean
}

export function threadUri(t: ThreadId) {
  return `teams:///teams/${t.teamId}/channels/${t.channelId}/messages/${t.messageId}`
}

// The path names the message the link points at, and `parentMessageId` its thread. The channel ID is URL-encoded in some links.
export function threadOfLink(link: string): ThreadId | undefined {
  const [, channelId, messageId] = link.match(/\/l\/message\/([^/?]+)\/(\d+)/) ?? []
  const teamId = link.match(/[?&]groupId=([^&]+)/)?.[1]
  if (!channelId || !messageId || !teamId) return undefined
  const parent = link.match(/[?&]parentMessageId=(\d+)/)?.[1]
  return { teamId: decodeURIComponent(teamId), channelId: decodeURIComponent(channelId), messageId: parent ?? messageId }
}

// The thread a connector call read. A resource that names a reply carries the reply's `replyToId`, its thread.
export function threadOfCall(e: Record<string, unknown>, text: string): ThreadId | undefined {
  if (e.tool === TEAMS_TOOL + 'teams_list_channel_messages' && e.parentMessageId)
    return { teamId: String(e.teamId), channelId: String(e.channelId), messageId: String(e.parentMessageId) }
  if (e.tool !== TEAMS_TOOL + 'read_resource' || typeof e.uri !== 'string') return undefined
  const [, teamId, channelId, messageId] = e.uri.match(/^teams:\/\/\/teams\/([^/]+)\/channels\/([^/]+)\/messages\/(\d+)/) ?? []
  if (!teamId || !channelId || !messageId) return undefined
  const parent = text.match(/"replyToId"\s*:\s*"(\d+)"/)?.[1]
  return { teamId: decodeURIComponent(teamId), channelId: decodeURIComponent(channelId), messageId: parent ?? messageId }
}

// The connector prints one JSON object per item, and a last item with `nextCursor` when more pages exist.
// It throws on text that is not JSON, so a changed format reads as a failed check, not as a quiet thread.
export function parseItems(texts: string[]): Record<string, unknown>[] {
  return texts.flatMap(text => {
    try {
      return [JSON.parse(text)].flat()
    } catch {
      return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    }
  })
}

// Replies the session has not seen, without the user's own: Claude can post as the user. An edit keeps its reply's ID.
export function newReplies(replies: Reply[], seen: string[], me: string) {
  return replies.filter(r => !seen.includes(r.id) && r.messageType === 'message' && r.from?.userId !== me)
}

// What Claude does about new replies. `turn` is the automatic turn's number for this thread, or 0 inside a running turn.
export function threadInstructions(t: ThreadId, replies: Reply[], turn: number) {
  const n = replies.length
  const what = `got ${n} new ${n === 1 ? 'reply' : 'replies'}: ${replies.map(r => `${r.from?.displayName ?? 'someone'} at ${r.createdDateTime}`).join(', ')}`
  if (turn > MAX_TURNS) return { what: `${what} (watch-discussions started ${MAX_TURNS} turns for this thread, so it only reports now)`, steps: [] }
  const args = JSON.stringify({ teamId: t.teamId, channelId: t.channelId, parentMessageId: t.messageId })
  const steps = [
    `Read the replies with teams_list_channel_messages ${args}. Where a reply's bodyTruncated is true, read its full body with read_resource on teams:///teams/${t.teamId}/channels/${t.channelId}/messages/<reply id>.`,
    'Check whether the replies change a fact or a decision this session acted on. If they do, tell the user and change course before your next step outside the session, such as a push, a PR, or a message.',
  ]
  return { what, steps }
}
