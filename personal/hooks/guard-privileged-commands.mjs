let data = '';
for await (const chunk of process.stdin) data += chunk;

const command = JSON.parse(data || '{}')?.tool_input?.command ?? '';

const BOUNDARY = '(^|[\\s;&|(`])';
const PRIVILEGED = [
    new RegExp(`${BOUNDARY}(aws|aws-vault|kubectl|helm)(\\s|$)`),
    new RegExp(`${BOUNDARY}terraform\\s+(apply|destroy)(\\s|$)`),
];

if (PRIVILEGED.some((re) => re.test(command))) {
    process.stderr.write(
        'Blocked: privileged command. Mehrdad runs aws, aws-vault, kubectl, helm and terraform apply/destroy himself. ' +
            'Hand him the exact command in a code block and explain only this step:\n' +
            command +
            '\n',
    );
    process.exit(2);
}

process.exit(0);
