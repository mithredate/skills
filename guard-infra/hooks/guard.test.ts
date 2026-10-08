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
  // Wrappers run the command after them.
  ['env AWS_PROFILE=prod aws s3 rm s3://bucket/key', ['aws s3 rm s3://bucket/key']],
  ['xargs kubectl delete pod < pods.txt', ['kubectl delete pod']],
  ['sudo -u ops terraform destroy', ['terraform destroy']],
  ['timeout 30 helm rollback api 3 2>&1 | tail -5', ['helm rollback api 3']],
  // The false alarms the old guard raised: a tool's name as text, not as the command that runs.
  ['grep -n kubectl README.md', []],
  ["rg 'aws s3' docs/", []],
  ['echo "run kubectl delete pod web-1 yourself"', []],
  ["for c in 'kubectl delete pod web-1'; do echo \"$c\"; done", []],
  ["cat <<'EOF'\nkubectl delete pod web-1\nEOF", []],
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

test('runs a read and a command with no privileged call without a question', async ($, on) => {
  const questions: string[] = []
  claudeCode(on, 'Cancel', questions)
  for (const command of ['kubectl get pods -n web', 'grep -n kubectl README.md']) {
    expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toBeUndefined()
  }
  expect(questions).toEqual([])
})
