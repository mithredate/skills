export const meta = {
  name: 'implement-from-brief',
  description: 'Implement a briefed change in rounds: one implementer, then a reviewer and a verifier in parallel, verdict in code',
  phases: [
    { title: 'Orient', detail: 'one Haiku node reads the blast radius of the briefed files' },
    { title: 'Round 1', detail: 'implementer, then reviewer and verifier' },
    { title: 'Round 2', detail: 'patch or fresh, by verdict' },
    { title: 'Round 3', detail: 'last round by default' },
  ],
}

// args, set by the skill's pre-flight:
//   ticketPath, briefText, repoRoot, worktree, branch, baseSha, diffFile,
//   kind ('bugfix' | 'change'), implementerModel ('sonnet' | 'opus'),
//   maxRounds, graphPath (string | null), skillDir

const ROUND_ESTIMATE_TOKENS = 500_000
const maxRounds = args.maxRounds ?? 3
const briefPath = `${args.skillDir}/references/implementer-brief.md`
const startSpent = budget.spent()

const STRING_LIST = { type: 'array', items: { type: 'string' } }

const DIGEST_SCHEMA = {
  type: 'object',
  properties: { digest: { type: 'string', description: '20 lines maximum' } },
  required: ['digest'],
}

const IMPLEMENTER_SCHEMA = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['implemented', 'learned', 'plan_broken', 'setup_blocked'] },
    files_touched: STRING_LIST,
    commands_run: STRING_LIST,
    learnings: STRING_LIST,
    blocker_evidence: { type: 'string' },
  },
  required: ['outcome', 'files_touched', 'commands_run', 'learnings'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    blocking: STRING_LIST,
    discrepancy: STRING_LIST,
    quality_note: STRING_LIST,
    nit: STRING_LIST,
    learnings: STRING_LIST,
  },
  required: ['blocking', 'discrepancy', 'quality_note', 'nit', 'learnings'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          exit_code: { type: 'integer' },
          excerpt: { type: 'string' },
        },
        required: ['command', 'exit_code', 'excerpt'],
      },
    },
    verdict: { type: 'string', enum: ['green', 'red', 'could_not_run'] },
  },
  required: ['commands', 'verdict'],
}

// The ledger is append-only and verbatim. The only edit is to drop an exact duplicate.
const ledger = []
function appendLedger(entries, round, source) {
  for (const text of entries ?? []) {
    if (ledger.some(l => l.endsWith(`] ${text}`))) continue
    ledger.push(`${ledger.length + 1}. [round ${round}][${source}] ${text}`)
  }
}
const ledgerText = () => (ledger.length ? ledger.join('\n') : '(empty)')

function orientPrompt() {
  const source = args.graphPath
    ? `Read the code graph at ${args.graphPath}. For every file the brief names, list its callers and the files that import it (the blast radius).`
    : `Use Grep and Glob only. For every file the brief names, list its callers. For every directory the brief names, describe the conventions of the sibling files: naming, error handling, test file placement.`
  return `Repository root: ${args.repoRoot}. Read only, no edits.

${source}

Brief:
${args.briefText}

Return a digest of 20 lines maximum: paths with a one-line reason each, and the declared test, lint, typecheck and build commands from ${args.repoRoot}/AGENTS.md or CLAUDE.md. Pointers, not content.`
}

function implementerPrompt(round, mode, digest, findings) {
  const patchBlock = findings
    ? `\nMode: patch. The prior round's code is in the worktree. Fix every blocking finding. If there is no blocking finding, fix the quality_note findings. Never fix a nit.
Reviewer findings:
${JSON.stringify(findings.review, null, 2)}
Verifier result:
${JSON.stringify(findings.verify, null, 2)}\n`
    : `\nMode: fresh. First run: git -C "${args.worktree}" reset --hard ${args.baseSha} && git -C "${args.worktree}" clean -fd\n`

  return `You are the implementer, round ${round} of ${maxRounds}. Read ${briefPath} first. It is your contract.

Worktree (all writes happen here): ${args.worktree}
Branch: ${args.branch}
Base commit: ${args.baseSha}
Kind of change: ${args.kind}
Brief (from ${args.ticketPath}):
${args.briefText}

Orientation digest:
${digest}

Ledger (constraints from earlier rounds):
${ledgerText()}
${patchBlock}
Last step, always: write the cumulative diff with
  git -C "${args.worktree}" diff ${args.baseSha} > "${args.diffFile}"
Then return the JSON your contract describes.`
}

function reviewPrompt() {
  return `Repository root: ${args.repoRoot}. Worktree with the change: ${args.worktree}.
The diff is in the file ${args.diffFile}. Read that file first.
Kind of change: ${args.kind}. There is no PR yet. Title: ${args.branch}.

Brief (from ${args.ticketPath}):
${args.briefText}

Apply both lenses from your system prompt. Return only the JSON.`
}

function verifyPrompt() {
  const bugfixCheck = args.kind === 'bugfix'
    ? `
Also run this check. The first commit after the base must hold the failing test, and no test file may change after it.
  FIRST=$(git -C "${args.worktree}" rev-list --reverse ${args.baseSha}..HEAD | head -1)
  git -C "${args.worktree}" diff --name-only "$FIRST" HEAD | grep -Ei '(test|spec)s?[./]'
Report the grep as a command. Exit code 0 (a test file changed after the first commit) is a failure. Exit code 1 is a pass.`
    : ''
  return `Directory that holds the branch under review: ${args.worktree}
Read ${args.repoRoot}/AGENTS.md or CLAUDE.md to find the declared test, lint, typecheck and build commands. Run each one in that directory.
Also run this check, and report it as a command. A non-empty output is a failure:
  git -C "${args.worktree}" diff ${args.baseSha} | diff - "${args.diffFile}"
${bugfixCheck}
Return only the JSON.`
}

function verdict(review, verify, roundsLeft) {
  if (review.discrepancy.length) return roundsLeft ? 'reset' : 'escalate'
  if (review.blocking.length || verify.verdict !== 'green') return roundsLeft ? 'patch' : 'escalate'
  if (review.quality_note.length) return roundsLeft ? 'patch' : 'pass'
  return 'pass'
}

function result(status, extra) {
  return {
    status,
    rounds: extra.round ?? 0,
    ledger,
    findings: extra.findings ?? null,
    blocker: extra.blocker ?? null,
    outputTokens: budget.spent() - startSpent,
  }
}

phase('Orient')
const orientation = await agent(orientPrompt(), {
  label: 'orient',
  agentType: 'Explore',
  model: 'haiku',
  effort: 'low',
  schema: DIGEST_SCHEMA,
})
const digest = orientation?.digest ?? '(orientation returned nothing)'
if (!orientation) log('orientation returned nothing, the implementer explores on its own')

let round = 0
let mode = 'fresh'
let findings = null
let roundCost = ROUND_ESTIMATE_TOKENS

while (round < maxRounds) {
  if (budget.total && budget.remaining() < roundCost) {
    log(`ceiling: ${Math.round(budget.remaining() / 1000)}k left, a round costs about ${Math.round(roundCost / 1000)}k`)
    return result('budget', { round, findings })
  }
  round++
  const roundsLeft = round < maxRounds
  const spentBefore = budget.spent()
  const phaseName = `Round ${round}`
  log(`${phaseName}: ${mode}`)

  const impl = await agent(implementerPrompt(round, mode, digest, findings), {
    label: `implement:${mode}`,
    phase: phaseName,
    agentType: 'general-purpose',
    model: args.implementerModel,
    schema: IMPLEMENTER_SCHEMA,
  })
  if (!impl) return result('agent_failed', { round, findings, blocker: 'implementer returned nothing' })
  appendLedger(impl.learnings, round, 'implementer')

  if (impl.outcome === 'plan_broken' || impl.outcome === 'setup_blocked') {
    return result(impl.outcome, { round, findings, blocker: impl.blocker_evidence ?? '' })
  }
  if (impl.outcome === 'learned') {
    log(`${phaseName}: learned, code discarded`)
    if (!roundsLeft) return result('escalate', { round, findings, blocker: 'last round ended in learned' })
    mode = 'fresh'
    findings = null
    roundCost = Math.max(roundCost, budget.spent() - spentBefore)
    continue
  }

  // A barrier is correct here. The verdict needs both results.
  const [review, verify] = await parallel([
    () => agent(reviewPrompt(), { label: 'review', phase: phaseName, agentType: 'dev:pr-reviewer', schema: REVIEW_SCHEMA }),
    () => agent(verifyPrompt(), { label: 'verify', phase: phaseName, agentType: 'dev:verifier', schema: VERIFY_SCHEMA }),
  ])
  if (!review || !verify) return result('agent_failed', { round, findings, blocker: 'a reviewer returned nothing' })
  appendLedger(review.learnings, round, 'pr-reviewer')
  findings = { review, verify }
  roundCost = Math.max(roundCost, budget.spent() - spentBefore)

  const v = verdict(review, verify, roundsLeft)
  log(`${phaseName}: ${v} (discrepancy ${review.discrepancy.length}, blocking ${review.blocking.length}, verifier ${verify.verdict}, quality ${review.quality_note.length})`)
  if (v === 'pass') return result('pass', { round, findings })
  if (v === 'escalate') return result('escalate', { round, findings })
  mode = v === 'reset' ? 'fresh' : 'patch'
  if (v === 'reset') findings = null
}

return result('escalate', { round, findings, blocker: 'round cap reached' })
