import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HOOK = new URL('./guard-privileged-commands.mjs', import.meta.url).pathname;

function exitCodeFor(command) {
    const input = JSON.stringify({ tool_input: { command } });
    return spawnSync('node', [HOOK], { input }).status;
}

const ALLOWED = 0;
const BLOCKED = 2;

test('allows a command with no privileged tool', () => {
    assert.equal(exitCodeFor('git status && ls -la'), ALLOWED);
});

test('allows aws read operations, with global flags before the service', () => {
    assert.equal(exitCodeFor('aws iam list-roles'), ALLOWED);
    assert.equal(exitCodeFor('aws --profile rsf-prod --region eu-central-1 eks describe-cluster --name main'), ALLOWED);
    assert.equal(exitCodeFor('aws sts get-caller-identity'), ALLOWED);
    assert.equal(exitCodeFor('aws s3 ls s3://bucket/prefix/'), ALLOWED);
});

test('blocks aws writes', () => {
    assert.equal(exitCodeFor('aws iam delete-role --role-name x'), BLOCKED);
    assert.equal(exitCodeFor('aws s3 cp file s3://bucket/'), BLOCKED);
    assert.equal(exitCodeFor('aws eks update-kubeconfig --name main'), BLOCKED);
});

test('blocks aws reads that return a secret or a credential', () => {
    assert.equal(exitCodeFor('aws secretsmanager get-secret-value --secret-id db'), BLOCKED);
    assert.equal(exitCodeFor('aws ssm get-parameter --name /db/password --with-decryption'), BLOCKED);
    assert.equal(exitCodeFor('aws ecr get-login-password'), BLOCKED);
    assert.equal(exitCodeFor('aws eks get-token --cluster-name main'), BLOCKED);
});

test('blocks a write hidden after a read in one compound command', () => {
    assert.equal(exitCodeFor('aws iam list-roles && aws iam delete-role --role-name x'), BLOCKED);
    assert.equal(exitCodeFor('kubectl get pods | kubectl delete pod -l app=x'), BLOCKED);
});

test('allows kubectl reads, with flags before the verb', () => {
    assert.equal(exitCodeFor('kubectl --context prod -n booking get pods -o wide'), ALLOWED);
    assert.equal(exitCodeFor('kubectl logs deploy/api --tail 50'), ALLOWED);
    assert.equal(exitCodeFor('kubectl config get-contexts'), ALLOWED);
});

test('blocks kubectl writes and secret reads', () => {
    assert.equal(exitCodeFor('kubectl apply -f deploy.yaml'), BLOCKED);
    assert.equal(exitCodeFor('kubectl exec -it api -- sh'), BLOCKED);
    assert.equal(exitCodeFor('kubectl get secret db -o yaml'), BLOCKED);
    assert.equal(exitCodeFor('kubectl config view --raw'), BLOCKED);
});

test('allows helm reads and blocks helm writes', () => {
    assert.equal(exitCodeFor('helm list -A'), ALLOWED);
    assert.equal(exitCodeFor('helm upgrade api ./chart'), BLOCKED);
});

test('always blocks aws-vault and terraform apply', () => {
    assert.equal(exitCodeFor('aws-vault exec prod -- aws iam list-roles'), BLOCKED);
    assert.equal(exitCodeFor('terraform apply -auto-approve'), BLOCKED);
});

test('allows a read named inside a heredoc', () => {
    const script = "python3 - <<'EOF'\nprint('run aws eks list-clusters first')\nEOF";
    assert.equal(exitCodeFor(script), ALLOWED);
});
