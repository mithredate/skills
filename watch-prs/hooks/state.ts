export const PR_FIELDS = 'number,title,url,state,reviewDecision,headRefOid,reviews,statusCheckRollup'

export type Checks = 'none' | 'pending' | 'pass' | 'fail'

export type Snapshot = {
  url: string
  number: number
  title: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  reviewDecision: string
  checks: Checks
  reviewIds: string[]
  fetchedAt: number
}

export type Change =
  | { kind: 'merged' | 'closed' }
  | { kind: 'decision'; from: string; to: string }
  | { kind: 'review'; author: string; state: string; isCopilot: boolean }
  | { kind: 'checks'; to: 'pass' | 'fail' }

type Review = { id: string; author?: { login?: string }; state: string }
type Check = { status?: string; conclusion?: string; state?: string }

const FAILED = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])

export const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g

export function isCopilot(login = '') {
  return /copilot/i.test(login)
}

export function summarizeChecks(rollup: Check[] = []): Checks {
  if (rollup.length === 0) return 'none'
  if (rollup.some(c => FAILED.has(c.conclusion ?? c.state ?? ''))) return 'fail'
  if (rollup.some(c => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING' || c.state === 'EXPECTED')) return 'pending'
  return 'pass'
}

export function toSnapshot(json: string, now: number): Snapshot {
  const pr = JSON.parse(json)
  return {
    url: pr.url,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    reviewDecision: pr.reviewDecision ?? '',
    checks: summarizeChecks(pr.statusCheckRollup),
    reviewIds: (pr.reviews as Review[] ?? []).map(r => r.id),
    fetchedAt: now,
  }
}

export function newReviews(json: string, seen: string[]): Review[] {
  return (JSON.parse(json).reviews as Review[] ?? []).filter(r => !seen.includes(r.id))
}

export function changes(prev: Snapshot, next: Snapshot, reviews: Review[]): Change[] {
  const out: Change[] = []
  if (prev.state === 'OPEN' && next.state === 'MERGED') out.push({ kind: 'merged' })
  if (prev.state === 'OPEN' && next.state === 'CLOSED') out.push({ kind: 'closed' })
  if (prev.reviewDecision !== next.reviewDecision && next.reviewDecision)
    out.push({ kind: 'decision', from: prev.reviewDecision, to: next.reviewDecision })
  for (const r of reviews) {
    const author = r.author?.login ?? 'someone'
    out.push({ kind: 'review', author, state: r.state, isCopilot: isCopilot(author) })
  }
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
