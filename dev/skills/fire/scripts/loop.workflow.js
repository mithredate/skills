export const meta = {
  name: 'fire',
  description: 'Fulfil one brief across its repos: units of implement, review, and verify rounds, then one gate on the whole change',
  phases: [
    { title: 'Orient', detail: 'one Sonnet node reads the blast radius of the code the brief names, in every repo' },
    { title: 'Units', detail: 'per unit: implementer, then reviewer and one verifier per repo, verdict in code' },
    { title: 'Gate', detail: 'whole-change review when there is more than one unit, then the brief Verification and Safe to deploy checks' },
  ],
}

// args, set by the skill's pre-flight:
//   ticketPath, briefText, runDir, ceiling (output tokens), kind ('bugfix' | 'change'), implementerModel ('opus' | 'fable'),
//   maxRounds, skillDir,
//   repos: [{ name, root, worktree, branch, baseSha, graphPath (string | null) }],
//   units: [{ name, build (verbatim brief lines), repos (repo names) }], in run order

// budget counts output tokens only. A toy round cost 14K; the floor covers a real repo.
const ROUND_ESTIMATE_TOKENS = 50_000

// Opus and Fable do the work that decides quality. Sonnet only reads, Haiku only runs declared commands.
const ORIENT_MODEL = 'sonnet'
const UNIT_REVIEW_MODEL = 'opus'
const REPO_VERIFY_MODEL = 'haiku'
const GATE_VERIFY_MODEL = 'opus'
const GATE_REVIEW_MODEL = 'fable'
const maxRounds = args.maxRounds ?? 3
const briefPath = `${args.skillDir}/references/implementer-brief.md`
const startSpent = budget.spent()
// The ceiling comes from args, because budget.total is set only by a user's own +Nk directive.
const tokensLeft = () => args.ceiling - (budget.spent() - startSpent)

const STRING_LIST = { type: 'array', items: { type: 'string' } }

const DIGEST_SCHEMA = {
  type: 'object',
  properties: { digest: { type: 'string', description: '30 lines maximum' } },
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

const REPO_VERIFY_SCHEMA = {
  ...VERIFY_SCHEMA,
  properties: { ...VERIFY_SCHEMA.properties, head: { type: 'string', description: 'the HEAD commit of the worktree' } },
  required: [...VERIFY_SCHEMA.required, 'head'],
}

const SHA = /^[0-9a-f]{40}$/

const repoByName = Object.fromEntries(args.repos.map(r => [r.name, r]))
const unknownRepos = args.units.flatMap(u => u.repos.filter(name => !repoByName[name]).map(name => `${u.name}: ${name}`))

// The ledger is append-only and verbatim, shared by all units. The only edit is to drop an exact duplicate.
const ledger = []
function appendLedger(entries, unit, round, source) {
  for (const text of entries ?? []) {
    if (ledger.some(l => l.endsWith(`] ${text}`))) continue
    ledger.push(`${ledger.length + 1}. [${unit} round ${round}][${source}] ${text}`)
  }
}
const ledgerText = () => (ledger.length ? ledger.join('\n') : '(empty)')

// bases maps a repo name to the commit a unit starts from. A unit's reset goes back to it, never to the run base.
function diffCommand(repoNames, bases, diffFile) {
  return repoNames
    .map((name, i) => `git -C "${repoByName[name].worktree}" diff ${bases[name]} | sed 's|^|${name}: |' ${i ? '>>' : '>'} "${diffFile}"`)
    .join('\n  ')
}

function repoLines(repoNames, bases) {
  return repoNames
    .map(name => `- ${name}: worktree ${repoByName[name].worktree}, branch ${repoByName[name].branch}, unit base ${bases[name]}`)
    .join('\n')
}

// The agents get the session repo's CLAUDE.md, not the target repo's. Name the right file in each prompt.
function instructionFiles(repoNames) {
  return `The CLAUDE.md in your context belongs to the session's repo. It does not apply here. Do not push. Read the instruction file of each repo first:\n${repoNames.map(n => `- ${n}: ${repoByName[n].root}/AGENTS.md or CLAUDE.md`).join('\n')}`
}

function unitHeader(unit) {
  const others = args.units.filter(u => u.name !== unit.name)
  return `Unit: ${unit.name}
Build (your scope, quoted from the brief):
${unit.build}
${others.length ? `Other units build these lines. Do not build them, and do not report them as missing:\n${others.map(u => `- ${u.name}:\n${u.build}`).join('\n')}` : 'This unit builds the whole brief.'}`
}

function orientPrompt() {
  const perRepo = args.repos.map(r => r.graphPath
    ? `- ${r.name} (${r.root}): read the code graph at ${r.graphPath}. For every file and symbol that the brief names, list its callers and the files that import it.`
    : `- ${r.name} (${r.root}): use Grep and Glob only. For every file and symbol that the brief names, list its callers. For every directory that the brief names, describe the conventions of the sibling files: naming, error handling, test file placement.`).join('\n')
  return `Read only, no edits. Repos:
${perRepo}

Brief:
${args.briefText}

Return a digest of 30 lines maximum, grouped by repo: paths with a one-line reason each, and the declared test, lint, typecheck and build commands from each repo's AGENTS.md or CLAUDE.md. Pointers, not content.`
}

function implementerPrompt(unit, round, mode, digest, findings, bases, diffFile) {
  const resets = unit.repos
    .map(name => `git -C "${repoByName[name].worktree}" reset --hard ${bases[name]} && git -C "${repoByName[name].worktree}" clean -fd`)
    .join('\n  ')
  const patchBlock = findings
    ? `\nMode: patch. The prior round's code is in the worktrees. Fix every blocking finding and every red verifier command. If there is none, fix the quality_note findings. Never fix a nit.
Reviewer findings:
${JSON.stringify(findings.review, null, 2)}
Verifier results:
${JSON.stringify(findings.verify, null, 2)}\n`
    : `\nMode: fresh. First run:\n  ${resets}\n`

  return `You are the implementer, ${unit.name} round ${round} of ${maxRounds}. Read ${briefPath} first. It is your contract.

Repos of this unit (all writes happen in these worktrees):
${repoLines(unit.repos, bases)}
${instructionFiles(unit.repos)}
Kind of change: ${args.kind}

Brief (from ${args.ticketPath}):
${args.briefText}

${unitHeader(unit)}

Orientation digest:
${digest}

Ledger (constraints from earlier rounds and units):
${ledgerText()}
${patchBlock}
Last step, always: write the cumulative diff of this unit with
  ${diffCommand(unit.repos, bases, diffFile)}
Then return the JSON your contract describes.`
}

function reviewPrompt(header, repoNames, diffFile, scope) {
  return `Repos: ${repoNames.map(n => `${n} (${repoByName[n].root}, worktree ${repoByName[n].worktree})`).join(', ')}.
The diff is in the file ${diffFile}. Each line starts with its repo name. Read that file first.
${instructionFiles(repoNames)}
Kind of change: ${args.kind}. There is no PR yet.

Brief (from ${args.ticketPath}):
${args.briefText}

${header}

${scope} Check the seams between repos: a contract that one repo serves and another calls must match on both sides. Apply both lenses from your system prompt. Return only the JSON.`
}

function verifyPrompt(name, bases, diffFile) {
  const repo = repoByName[name]
  const bugfixCheck = args.kind === 'bugfix'
    ? `
Also run this check. The first commit after the unit base must hold the failing test, and no test file may change after it.
  FIRST=$(git -C "${repo.worktree}" rev-list --reverse ${bases[name]}..HEAD | head -1)
  git -C "${repo.worktree}" diff --name-only "$FIRST" HEAD | grep -Ei '(test|spec)s?[./]'
Report the grep as a command. Exit code 0 (a test file changed after the first commit) is a failure. Exit code 1 is a pass.`
    : ''
  return `Directory that holds the branch under review: ${repo.worktree}
First run these checks, before any declared command, and report each one as a command. A non-empty output is a failure:
  git -C "${repo.worktree}" status --porcelain
  git -C "${repo.worktree}" diff ${bases[name]} | sed 's|^|${name}: |' | diff - <(grep '^${name}: ' "${diffFile}")
Then read ${repo.root}/AGENTS.md or CLAUDE.md to find the declared test, lint, typecheck and build commands. Run each one in that directory. The CLAUDE.md in your context belongs to the session's repo, not to this one.
${bugfixCheck}
Put the output of git -C "${repo.worktree}" rev-parse HEAD in "head".
Return only the JSON.`
}

function gateVerifyPrompt() {
  return `You verify. Do not edit a file in a worktree. Worktrees:
${args.repos.map(r => `- ${r.name}: ${r.worktree}`).join('\n')}
${instructionFiles(args.repos.map(r => r.name))}

Brief (from ${args.ticketPath}):
${args.briefText}

Run every check in the brief's Verification and "Safe to deploy when" lines that the declared repo commands do not already cover, for example an end-to-end run across repos. Run each check as the repo's AGENTS.md or CLAUDE.md says, for example inside its container. Report each check as a command with its exit code. A check that you cannot run is a failure, with the reason in the excerpt.
Return only the JSON.`
}

function verdict(review, verifies, roundsLeft) {
  const green = verifies.every(v => v.verdict === 'green')
  if (review.discrepancy.length) return roundsLeft ? 'reset' : 'escalate'
  if (review.blocking.length || !green) return roundsLeft ? 'patch' : 'escalate'
  if (review.quality_note.length) return roundsLeft ? 'patch' : 'pass'
  return 'pass'
}

function result(status, extra) {
  return {
    status,
    unit: extra.unit ?? null,
    rounds: extra.rounds ?? [],
    ledger,
    findings: extra.findings ?? null,
    blocker: extra.blocker ?? null,
    outputTokens: budget.spent() - startSpent,
  }
}

if (unknownRepos.length) return result('plan_broken', { blocker: `a unit names a repo that is not in repos: ${unknownRepos.join(', ')}` })

if (!(args.ceiling > 0)) return result('plan_broken', { blocker: 'args.ceiling is not a positive token count' })
phase('Orient')
const orientation = await agent(orientPrompt(), {
  label: 'orient',
  agentType: 'Explore',
  model: ORIENT_MODEL,
  effort: 'low',
  schema: DIGEST_SCHEMA,
})
const digest = orientation?.digest ?? '(orientation returned nothing)'
if (!orientation) log('orientation returned nothing, the implementer explores on its own')

const runBases = Object.fromEntries(args.repos.map(r => [r.name, r.baseSha]))
const heads = { ...runBases }
const roundsByUnit = {}
const roundsReport = () => Object.entries(roundsByUnit).map(([name, n]) => `${name}: ${n}`)
let roundCost = ROUND_ESTIMATE_TOKENS

// ponytail: units run one after another, because two units can share a worktree. Run units with disjoint repos in parallel when wall-clock time matters.
phase('Units')
for (const unit of args.units) {
  const bases = Object.fromEntries(unit.repos.map(name => [name, heads[name]]))
  const diffFile = `${args.runDir}/${unit.name}.diff`
  let round = 0
  let mode = 'fresh'
  let findings = null
  let passed = false

  while (round < maxRounds) {
    if (tokensLeft() < roundCost) {
      log(`ceiling: ${Math.round(tokensLeft() / 1000)}k left, a round costs about ${Math.round(roundCost / 1000)}k`)
      return result('budget', { unit: unit.name, rounds: roundsReport(), findings })
    }
    round++
    roundsByUnit[unit.name] = round
    const roundsLeft = round < maxRounds
    const spentBefore = budget.spent()
    log(`${unit.name} round ${round}: ${mode}`)

    const impl = await agent(implementerPrompt(unit, round, mode, digest, findings, bases, diffFile), {
      label: `implement:${unit.name}:${mode}`,
      phase: 'Units',
      agentType: 'general-purpose',
      model: args.implementerModel,
      schema: IMPLEMENTER_SCHEMA,
    })
    if (!impl) return result('agent_failed', { unit: unit.name, rounds: roundsReport(), findings, blocker: 'implementer returned nothing' })
    appendLedger(impl.learnings, unit.name, round, 'implementer')

    if (impl.outcome === 'plan_broken' || impl.outcome === 'setup_blocked') {
      return result(impl.outcome, { unit: unit.name, rounds: roundsReport(), findings, blocker: impl.blocker_evidence ?? '' })
    }
    if (impl.outcome === 'learned') {
      log(`${unit.name} round ${round}: learned, code discarded`)
      if (!roundsLeft) return result('escalate', { unit: unit.name, rounds: roundsReport(), findings, blocker: 'last round ended in learned' })
      mode = 'fresh'
      findings = null
      roundCost = Math.max(roundCost, budget.spent() - spentBefore)
      continue
    }

    // A barrier is correct here. The verdict needs every result.
    const [review, ...verifies] = await parallel([
      () => agent(reviewPrompt(unitHeader(unit), unit.repos, diffFile, 'Judge scope against the Build lines above.'), { label: `review:${unit.name}`, phase: 'Units', agentType: 'dev:pr-reviewer', model: UNIT_REVIEW_MODEL, schema: REVIEW_SCHEMA }),
      ...unit.repos.map(name => () => agent(verifyPrompt(name, bases, diffFile), { label: `verify:${unit.name}:${name}`, phase: 'Units', agentType: 'dev:verifier', model: REPO_VERIFY_MODEL, schema: REPO_VERIFY_SCHEMA })),
    ])
    if (!review || verifies.some(v => !v)) return result('agent_failed', { unit: unit.name, rounds: roundsReport(), findings, blocker: 'a reviewer returned nothing' })
    appendLedger(review.learnings, unit.name, round, 'pr-reviewer')
    findings = { review, verify: verifies }
    roundCost = Math.max(roundCost, budget.spent() - spentBefore)

    const v = verdict(review, verifies, roundsLeft)
    log(`${unit.name} round ${round}: ${v} (discrepancy ${review.discrepancy.length}, blocking ${review.blocking.length}, verifiers ${verifies.map(x => x.verdict).join('/')}, quality ${review.quality_note.length})`)
    if (v === 'escalate') return result('escalate', { unit: unit.name, rounds: roundsReport(), findings })
    if (v === 'pass') {
      const badHead = unit.repos.find((name, i) => !SHA.test(verifies[i].head ?? ''))
      if (badHead) return result('agent_failed', { unit: unit.name, rounds: roundsReport(), findings, blocker: `the verifier of ${badHead} returned no HEAD commit` })
      unit.repos.forEach((name, i) => { heads[name] = verifies[i].head })
      passed = true
      break
    }
    mode = v === 'reset' ? 'fresh' : 'patch'
    if (v === 'reset') findings = null
  }
  if (!passed) return result('escalate', { unit: unit.name, rounds: roundsReport(), findings, blocker: 'round cap reached' })
}

// ponytail: the gate escalates, it does not patch. Add a patch round on the gate when gate failures turn out to be small.
if (tokensLeft() < roundCost) {
  log(`ceiling: ${Math.round(tokensLeft() / 1000)}k left before the gate`)
  return result('budget', { rounds: roundsReport() })
}

phase('Gate')
const allRepos = args.repos.map(r => r.name)
const fullDiff = `${args.runDir}/full.diff`
// The verifier writes the whole diff first, because dev:pr-reviewer has no shell.
const gateVerify = await agent(
  `First write the whole diff with\n  ${diffCommand(allRepos, runBases, fullDiff)}\n\n${gateVerifyPrompt()}`,
  { label: 'gate:verify', phase: 'Gate', agentType: 'general-purpose', model: GATE_VERIFY_MODEL, schema: VERIFY_SCHEMA },
)
if (!gateVerify) return result('agent_failed', { rounds: roundsReport(), blocker: 'the gate verifier returned nothing' })
const gateReview = args.units.length > 1
  ? await agent(
    reviewPrompt('Whole change: all units together.', allRepos, fullDiff, 'Judge scope against the FR and NFR lines of the brief.'),
    { label: 'gate:review', phase: 'Gate', agentType: 'dev:pr-reviewer', model: GATE_REVIEW_MODEL, schema: REVIEW_SCHEMA },
  )
  : null
if (args.units.length > 1 && !gateReview) return result('agent_failed', { rounds: roundsReport(), blocker: 'the gate reviewer returned nothing' })
const gateFindings = { review: gateReview ?? null, verify: [gateVerify] }
const gateRed = gateVerify.verdict !== 'green' || (gateReview && (gateReview.discrepancy.length || gateReview.blocking.length))
if (gateRed) return result('gate_failed', { rounds: roundsReport(), findings: gateFindings })
return result('pass', { rounds: roundsReport(), findings: gateFindings })
