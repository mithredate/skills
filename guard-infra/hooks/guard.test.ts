import type { On, ToolCallResult } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { privilegedCalls } from './commands.js'

// Each command, and the privileged calls in it that are not reads. An empty list runs with no question.
const CASES: [command: string, calls: string[]][] = [
  ['git status && ls -la', []],
  ['aws iam list-roles', []],
  ['aws --profile rsf-prod --region eu-central-1 eks describe-cluster --name main', []],
  ['aws sts get-caller-identity', []],
  ['aws s3 ls s3://bucket/prefix/', []],
  ['aws iam delete-role --role-name x', ['aws iam delete-role --role-name x']],
  ['aws s3 cp file s3://bucket/', ['aws s3 cp file s3://bucket/']],
  ['aws eks update-kubeconfig --name main', ['aws eks update-kubeconfig --name main']],
  ['aws secretsmanager get-secret-value --secret-id db', ['aws secretsmanager get-secret-value --secret-id db']],
  ['aws ssm get-parameter --name /db/password --with-decryption', ['aws ssm get-parameter --name /db/password --with-decryption']],
  ['aws ecr get-login-password', ['aws ecr get-login-password']],
  ['aws eks get-token --cluster-name main', ['aws eks get-token --cluster-name main']],
  ['aws iam list-roles && aws iam delete-role --role-name x', ['aws iam delete-role --role-name x']],
  ['kubectl get pods | kubectl delete pod -l app=x', ['kubectl delete pod -l app=x']],
  ['kubectl --context prod -n booking get pods -o wide', []],
  ['kubectl logs deploy/api --tail 50', []],
  ['kubectl config get-contexts', []],
  ['kubectl apply -f deploy.yaml', ['kubectl apply -f deploy.yaml']],
  ['kubectl exec -it api -- sh', ['kubectl exec -it api -- sh']],
  ['kubectl get secret db -o yaml', ['kubectl get secret db -o yaml']],
  ['kubectl config view --raw', ['kubectl config view --raw']],
  ['helm list -A', []],
  ['helm upgrade api ./chart', ['helm upgrade api ./chart']],
  ['aws-vault exec prod -- aws iam list-roles', ['aws-vault exec prod -- aws iam list-roles']],
  ['terraform apply -auto-approve', ['terraform apply -auto-approve']],
  ['terraform plan', []],
  ["python3 - <<'EOF'\nprint('run aws eks list-clusters first')\nEOF", []],
  // The cases the old guard missed: a call inside a shell's -c script, by full path, or in a substitution.
  ["sh -c 'kubectl delete pod web-1'", ['kubectl delete pod web-1']],
  ['bash -lc "helm uninstall web"', ['helm uninstall web']],
  ['/opt/homebrew/bin/kubectl delete pod web-1', ['/opt/homebrew/bin/kubectl delete pod web-1']],
  ['echo "pods: $(kubectl delete pod web-1)"', ['kubectl delete pod web-1']],
  ['if kubectl delete pod web-1; then echo gone; fi', ['kubectl delete pod web-1']],
  // Any other program can run the words it is given. A tool's name in them is a call, unless it is a read.
  ['env AWS_PROFILE=prod aws s3 rm s3://bucket/key', ['aws s3 rm s3://bucket/key']],
  ['xargs kubectl delete pod < pods.txt', ['kubectl delete pod']],
  ['sudo -u ops terraform destroy', ['terraform destroy']],
  ['timeout 30 helm rollback api 3 2>&1 | tail -5', ['helm rollback api 3']],
  ['sudo --user root kubectl delete pod web-1', ['kubectl delete pod web-1']],
  ['timeout --signal KILL 5 kubectl delete pod web-1', ['kubectl delete pod web-1']],
  ['find . -name "*.yaml" -exec kubectl delete -f {} \\;', ['kubectl delete -f {} ;']],
  ['parallel kubectl delete pod ::: web-1 web-2', ['kubectl delete pod ::: web-1 web-2']],
  ['time nohup kubectl delete pod web-1', ['kubectl delete pod web-1']],
  ['sudo kubectl get pods', []],
  // A read ends the scan only where the tool is the program. Elsewhere a later word can run too.
  ['find . -exec kubectl get -f {} \\; -exec kubectl delete -f {} \\;', ['kubectl delete -f {} ;']],
  ['ssh host kubectl get pods \\; kubectl delete pod web-1', ['kubectl delete pod web-1']],
  // `git` and `gh` run a command with some words.
  ["git -c alias.x='!kubectl delete pod web-1' x", ['alias.x=!kubectl delete pod web-1']],
  ["git rebase -x 'kubectl delete pod web-1' main", ['kubectl delete pod web-1']],
  ['git bisect run kubectl delete pod web-1', ['kubectl delete pod web-1']],
  ["gh alias set --shell k 'kubectl delete pod web-1'", ['kubectl delete pod web-1']],
  // macOS finds a tool's file in any case. A version suffix is the tool too, but no known read.
  ['Kubectl delete pod web-1', ['Kubectl delete pod web-1']],
  ['KUBECTL get pods', []],
  ['helm3 uninstall web', ['helm3 uninstall web']],
  // A word that holds a script runs it.
  ["watch 'kubectl delete pod web-1'", ['kubectl delete pod web-1']],
  ["watch 'kubectl get pods'", []],
  ["fish -c 'kubectl delete pod web-1'", ['kubectl delete pod web-1']],
  ["bash -c -x 'kubectl delete pod web-1'", ['kubectl delete pod web-1']],
  ["eval 'kubectl delete pod web-1'", ['kubectl delete pod web-1']],
  ["python3 - <<'EOF'\nimport os; os.system('kubectl delete pod web-1')\nEOF", ['kubectl delete pod web-1']],
  // A loop's words can run as `$c`.
  ["for c in 'kubectl delete pod web-1'; do echo \"$c\"; done", ['kubectl delete pod web-1']],
  // A tool's name inside a word that is not a script asks, because the guard cannot tell what runs.
  ['ls kubectl/', ['ls kubectl/']],
  // A word that splits into itself is not split again.
  ['kubectl delete pod web-1', ['kubectl delete']],
  // Every place the shell runs a command.
  ['echo `kubectl delete pod web-1`', ['kubectl delete pod web-1']],
  ['diff <(kubectl get pods) <(helm uninstall web)', ['helm uninstall web']],
  ['! kubectl delete pod web-1', ['kubectl delete pod web-1']],
  ['{ kubectl delete pod web-1; }', ['kubectl delete pod web-1']],
  ['while true; do helm uninstall web; done', ['helm uninstall web']],
  ['function f { kubectl delete pod web-1; }; f', ['kubectl delete pod web-1']],
  ["$'kubectl' delete pod web-1", ['kubectl delete pod web-1']],
  ["$'\\x6bubectl' delete pod web-1", ['kubectl delete pod web-1']],
  ["echo $'it\\'s'; kubectl delete pod web-1", ['kubectl delete pod web-1']],
  ['echo ${X:-$(kubectl delete pod web-1)}', ['kubectl delete pod web-1']],
  ["echo ${X:-$(kubectl get pods -o 'jsonpath={.items}'; kubectl delete pod web-1)}", ['kubectl delete pod web-1']],
  ['echo hi > "$(kubectl delete pod web-1)"', ['kubectl delete pod web-1']],
  ['cat <<EOF\n$(kubectl delete pod web-1)\nEOF', ['kubectl delete pod web-1']],
  ['cat <<\\EOF\nhi\nEOF\nkubectl delete pod web-1', ['kubectl delete pod web-1']],
  // A `<<` that never closes may be a shift, so the lines after it are read as commands too.
  ['echo $[1<<2]\nkubectl delete pod web-1', ['kubectl delete pod web-1']],
  // A program that is not text-only reads its heredoc or here-string as a script.
  ["bash <<'EOF'\nkubectl delete pod web-1\nEOF", ['kubectl delete pod web-1']],
  ["sh <<< 'kubectl delete pod web-1'", ['kubectl delete pod web-1']],
  // Text that names a tool asks when a program that is not text-only reads it from a pipe or a substitution.
  ["echo 'kubectl delete pod web-1' | sh", ['sh']],
  ["cat <<'EOF' | bash\nkubectl delete pod web-1\nEOF", ['bash']],
  ["{ echo 'kubectl delete pod web-1'; } | sh", ['sh']],
  ["echo 'kubectl delete pod web-1' | sudo bash", ['sudo bash']],
  ["echo 'kubectl delete pod web-1' | bash -s -- -c", ['bash -s -- -c']],
  ["echo 'import os; os.system(\"kubectl delete pod web-1\")' | python3", ['python3']],
  ["echo 'kubectl delete pod web-1' |\n  sh", ['sh']],
  ["source <(echo 'kubectl delete pod web-1')", ['source $(…)']],
  ["eval \"$(echo 'kubectl delete pod web-1')\"", ['eval $(…)']],
  ["bash -c \"$(cat <<'EOF'\nkubectl delete pod web-1\nEOF\n)\"", ['bash -c $(…)']],
  // The false alarms the old guard raised: a tool's name as text for a program that runs no words.
  ['grep -n kubectl README.md', []],
  ["rg 'aws s3' docs/", []],
  ['echo "run kubectl delete pod web-1 yourself"', []],
  ["cat <<'EOF'\nkubectl delete pod web-1\nEOF", []],
  ["git commit -m 'guard kubectl delete and helm uninstall'", []],
  ['gh pr create --body "helm uninstall now asks"', []],
  ['command -v kubectl && which helm', []],
  ['if grep -q kubectl Makefile; then echo found; fi', []],
  ['LC_ALL=C grep -n helm README.md', []],
  ['while grep -q kubectl Makefile; do echo helm; done', []],
  ['until ! grep -q kubectl log; do sleep 1; done', []],
  ['if true; then echo kubectl; elif true; then echo helm; else { echo aws; }; fi', []],
  ["printf 'kubectl delete %s\\n' web-1", []],
  ['type helm', []],
  ['grep -rn kubectl . | head -5 | sort || echo none', []],
  ['grep -q kubectl Makefile || exit 1', []],
  ["git commit -m \"$(cat <<'EOF'\nfix(helm): bump the chart\nEOF\n)\"", []],
  ['AWS_PROFILE=prod aws s3 ls', []],
  // Reads that take another read's output stay quiet.
  ['kubectl logs $(kubectl get pod -l app=web -o name)', []],
  ['for p in $(kubectl get pods -o name); do kubectl describe $p; done', []],
  ['kubectl get pods -o json | jq .items | tee pods.json', []],
]

test('finds the privileged calls that are not reads, wherever the shell runs them', async () => {
  for (const [command, calls] of CASES) expect({ command, calls: privilegedCalls(command) }).toEqual({ command, calls })
})

// Claude Code beneath the mod: the question dialog answers `answer`, or is dismissed for an Error, and any other tool runs.
function claudeCode(on: On, answer: string | Error, questions: string[] = []) {
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const asked = 'questions' in e ? e.questions : []
    const question = asked[0]?.question ?? ''
    questions.push(question)
    if (answer instanceof Error) return { deny: answer.message }
    return { result: { questions: asked, answers: { [question]: answer } } }
  })
  on('tool.call', async () => ({ result: 'ran' }))
}

const refusal = (ran: ToolCallResult) => ran.deny ?? (ran.isError ? ran.text : undefined)

test('runs a privileged write after the user presses Run', async ($, on) => {
  const questions: string[] = []
  claudeCode(on, 'Run', questions)
  const ran = await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod web-1' })
  expect(refusal(ran)).toBeUndefined()
  expect(questions).toEqual(['Run this privileged command?\n\nkubectl delete pod web-1'])
})

test('refuses a privileged write when the user presses Cancel', async ($, on) => {
  claudeCode(on, 'Cancel')
  const ran = await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod web-1' })
  expect(refusal(ran)).toContain('the user cancelled `kubectl delete pod web-1`')
})

test('refuses a privileged write and passes on what the user typed instead', async ($, on) => {
  claudeCode(on, 'use the staging context first')
  const ran = await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod web-1' })
  expect(refusal(ran)).toContain('use the staging context first')
})

test('refuses a privileged write when no one answers, as in claude -p or after Esc', async ($, on) => {
  claudeCode(on, new Error('dismissed'))
  const ran = await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod web-1' })
  expect(refusal(ran)).toContain('no one answered')
})

test('refuses the call when the guard itself fails, so an error never lets a call through', async ($, on) => {
  claudeCode(on, 'Run')
  const ran = await $.tool.call({ tool: 'Bash', command: null as never })
  expect(refusal(ran)).toContain('guard-infra failed')
})

test('runs a read and a command with no privileged call without a question', async ($, on) => {
  const questions: string[] = []
  claudeCode(on, 'Cancel', questions)
  for (const command of ['kubectl get pods -n web', 'grep -n kubectl README.md']) {
    expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toBeUndefined()
  }
  expect(questions).toEqual([])
})
