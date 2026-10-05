let data = '';
for await (const chunk of process.stdin) data += chunk;

const command = JSON.parse(data || '{}')?.tool_input?.command ?? '';

const BOUNDARY = '(^|[\\s;&|(`])';
const PRIVILEGED_CALL = new RegExp(`${BOUNDARY}(aws|aws-vault|kubectl|helm)(\\s+[^;&|\\n\`)]*)?(?=$|[;&|\\n\`)])`, 'g');
const TERRAFORM_WRITE = new RegExp(`${BOUNDARY}terraform\\s+(apply|destroy)(\\s|$)`);

const AWS_READ_OPERATION = /^(get|describe|list)-/;
const AWS_CREDENTIAL_OPERATION =
    /^get-(secret-value|login-password|session-token|federation-token|token|authorization-token|credentials|.*-credentials)$/;
const KUBECTL_READ_VERBS = new Set(['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version']);
const KUBECTL_READ_CONFIG = new Set(['get-contexts', 'current-context']);
const HELM_READ_VERBS = new Set(['list', 'ls', 'status', 'history']);

// Global flags sit between the tool and its verb, for example `--profile x` or `-n x`.
function positionalArgs(args) {
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('-')) positional.push(arg);
        else if (!arg.includes('=') && positional.length < 2) i++;
    }
    return positional;
}

function isReadOnly(tool, args) {
    const [first, second] = positionalArgs(args);
    if (tool === 'aws') {
        if (args.includes('--with-decryption')) return false;
        if (first === 's3' && second === 'ls') return true;
        return AWS_READ_OPERATION.test(second ?? '') && !AWS_CREDENTIAL_OPERATION.test(second);
    }
    if (tool === 'kubectl') {
        if (first === 'config') return KUBECTL_READ_CONFIG.has(second);
        return KUBECTL_READ_VERBS.has(first) && !args.some((arg) => /secret/.test(arg));
    }
    if (tool === 'helm') return HELM_READ_VERBS.has(first);
    return false;
}

const calls = [...command.matchAll(PRIVILEGED_CALL)].map((match) => ({
    tool: match[2],
    args: (match[3] ?? '').trim().split(/\s+/).filter(Boolean),
}));

const blocked = TERRAFORM_WRITE.test(command) || calls.some(({ tool, args }) => !isReadOnly(tool, args));

if (blocked) {
    process.stderr.write(
        'Blocked: privileged command. Mehrdad runs aws, aws-vault, kubectl, helm and terraform apply/destroy himself. ' +
            'Read-only calls that return no secret are allowed. ' +
            'Hand him the exact command in a code block and explain only this step:\n' +
            command +
            '\n',
    );
    process.exit(2);
}

process.exit(0);
