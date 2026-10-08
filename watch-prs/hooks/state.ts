export const PR_FIELDS = 'number,title,url,state,reviewDecision,reviews,comments,statusCheckRollup'

// Caps the automatic turns for one PR, so a bot comment on each push or a flaky check cannot loop.
export const MAX_TURNS_PER_PR = 5

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

export function contextBlock(snaps: Snapshot[], now: number) {
  const rows = snaps.map(s => {
    const age = Math.round((now - s.fetchedAt) / 1000)
    return `- ${s.url} "${s.title}": ${s.state}, review decision ${s.reviewDecision || 'none'}, checks ${s.checks}, ${s.reviewIds.length} reviews (fetched ${age}s ago)`
  })
  return ['Live state of the PRs this session watches. It is newer than anything earlier in the conversation:', ...rows].join('\n')
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
  if (turn > MAX_TURNS_PER_PR && !merged)
    return { what: `${what} (watch-prs started ${MAX_TURNS_PER_PR} turns for this PR, so it only reports now)`, steps: [] }
  return { what, steps }
}
