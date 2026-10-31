import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const SCRIPT = new URL('./brief-queue.mjs', import.meta.url).pathname;
const HOUR = 3600e3;
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const ROOT = mkdtempSync(join(tmpdir(), 'brief-queue-test-'));
after(() => rmSync(ROOT, { recursive: true, force: true }));

// Every git call of the test and of the script uses this identity and no user config.
Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
});

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function hoursAgo(hours) {
    return new Date(Date.now() - hours * HOUR).toISOString().slice(0, 16) + 'Z';
}

function brief({ status = 'ready', updated = hoursAgo(0), targets = '`CakeClub`, base branch `main`', extra = [] } = {}) {
    return [
        '---',
        'title: "Show the return date"',
        `status: ${status}`,
        `updated: ${updated}`,
        ...extra,
        '---',
        '## Brief',
        '',
        '- Goal: the booking page shows the return date',
        `- Targets: ${targets}`,
        '',
    ].join('\n');
}

// The input file of `write`: the frontmatter lines that prep gives, and the brief.
function queued(lines = ['title: Show the return date'], targets = '`CakeClub`, base branch `main`') {
    return ['---', ...lines, '---', '## Brief', '', '- Goal: the booking page shows the return date', `- Targets: ${targets}`, ''].join('\n');
}

function writeFiles(dir, files) {
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
    }
}

// A real bare remote of the orchestrator repo, two clones of it, a target repo named CakeClub, and a fake gh.
function setup(files) {
    const dir = mkdtempSync(join(ROOT, 'case-'));
    const remote = join(dir, 'discovery.git');
    git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
    const seed = join(dir, 'seed');
    git(dir, 'clone', '-q', remote, seed);
    writeFiles(seed, { 'README.md': 'tracker\n', ...files });
    git(seed, 'add', '-A');
    git(seed, 'commit', '-q', '-m', 'seed');
    git(seed, 'push', '-q', 'origin', 'HEAD:main');
    const one = join(dir, 'one');
    const two = join(dir, 'two');
    git(dir, 'clone', '-q', remote, one);
    git(dir, 'clone', '-q', remote, two);

    const target = join(dir, 'CakeClub');
    mkdirSync(target);
    git(target, 'init', '-q');
    git(target, 'remote', 'add', 'origin', 'git@github.com:CakeClub-Inc/CakeClub.git');

    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\ncat "$(dirname "$0")/pr-state"\n');
    chmodSync(join(bin, 'gh'), 0o755);
    writeFileSync(join(bin, 'pr-state'), 'OPEN\n');

    return {
        dir, remote, one, two, target,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: dir },
        setPrState: (state) => writeFileSync(join(bin, 'pr-state'), `${state}\n`),
    };
}

async function queue(q, cwd, ...args) {
    try {
        const { stdout } = await promisify(execFile)('node', [SCRIPT, ...args], { cwd, env: q.env });
        return JSON.parse(stdout);
    } catch (error) {
        if (!error.stdout) throw error;
        return { exit: error.code, ...JSON.parse(error.stdout) };
    }
}

// The file on the remote, or null when it does not exist there.
function onRemote(q, path) {
    try {
        return git(q.remote, 'show', `main:${path}`);
    } catch {
        return null;
    }
}

// Another session pushes a change from clone two.
function pushFromTwo(q, files) {
    git(q.two, 'pull', '-q', '--rebase', 'origin', 'main');
    writeFiles(q.two, files);
    git(q.two, 'add', '-A');
    git(q.two, 'commit', '-q', '-m', 'other session');
    git(q.two, 'push', '-q', 'origin', 'HEAD:main');
}

test('take claims the older of two ready briefs', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief(),
        'wayfinder/briefs/2026-10-30-1000-b.md': brief(),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'claimed');
    assert.equal(result.brief, 'wayfinder/briefs/2026-10-30-0900-a.md');
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md'), /^status: in-progress$/m);
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-1000-b.md'), /^status: ready$/m);
    assert.ok(!result.copy.startsWith(q.one));
    assert.match(readFileSync(result.copy, 'utf8'), /^status: in-progress$[\s\S]*- Goal: the booking page shows the return date/m);
});

test('take reports busy while a brief is in progress with a fresh update', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'in-progress', updated: hoursAgo(1) }),
        'wayfinder/briefs/2026-10-30-1000-b.md': brief(),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'busy');
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-1000-b.md'), /^status: ready$/m);
});

test('take sets an overdue in-progress brief to stuck and claims the next ready brief', async () => {
    const updated = hoursAgo(5);
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'in-progress', updated }),
        'wayfinder/briefs/2026-10-30-1000-b.md': brief(),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'claimed');
    assert.equal(result.brief, 'wayfinder/briefs/2026-10-30-1000-b.md');
    assert.deepEqual(result.stuck, ['wayfinder/briefs/2026-10-30-0900-a.md']);
    const a = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md');
    assert.match(a, /^status: stuck$/m);
    assert.ok(a.includes(`result: "no update since ${updated}"`));
});

test('take reports nothing ready when the only ready brief targets another repo', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-c.md': brief({ targets: '`CakeClubBackend`, base branch `main`' }),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'nothing ready');
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-c.md'), /^status: ready$/m);
});

test('take skips a brief whose ticket waits on an open gate, and claims it when the gate closes', async () => {
    const gate = (status) => ['---', 'id: bug-07', 'title: Deploy the fix', 'type: gate', `status: ${status}`, 'assignee:', 'blocked-by: []', '---', ''].join('\n');
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-d.md': brief({ extra: ['ticket: bugs/tickets/05-fix.md'] }),
        'wayfinder/bugs/tickets/05-fix.md': ['---', 'id: bug-05', 'title: Fix the sync', 'type: task', 'status: open', 'assignee:', 'blocked-by: [bug-07]', 'brief: briefs/2026-10-30-0900-d.md', '---', ''].join('\n'),
        'wayfinder/bugs/tickets/07-deploy-gate.md': gate('open'),
    });

    const blocked = await queue(q, q.target, 'take', q.one);
    pushFromTwo(q, { 'wayfinder/bugs/tickets/07-deploy-gate.md': gate('closed') });
    const unblocked = await queue(q, q.target, 'take', q.one);

    assert.equal(blocked.outcome, 'nothing ready');
    assert.equal(unblocked.outcome, 'claimed');
    assert.equal(unblocked.brief, 'wayfinder/briefs/2026-10-30-0900-d.md');
});

test('take refuses to run when the repo name of origin is empty', async () => {
    const q = setup({ 'wayfinder/briefs/2026-10-30-0900-a.md': brief() });
    git(q.target, 'remote', 'set-url', 'origin', 'https://github.com/CakeClub-Inc/CakeClub/');

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'refused');
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md'), /^status: ready$/m);
});

test('take skips a brief whose Targets line names two repos', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief({ targets: '`CakeClub`, `CakeClubBackend`, base branch `main`' }),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'nothing ready');
});

test('take keeps each brief whose blockers it cannot read, and claims the brief whose blockers are readable and closed', async () => {
    const ticket = (id, blockedBy, eol = '\n') => ['---', `id: ${id}`, 'title: Fix', 'type: task', 'status: open', 'assignee:', ...blockedBy, '---', ''].join(eol);
    const q = setup({
        'wayfinder/bugs/tickets/07-gate.md': ['---', 'id: bug-07', 'type: gate', 'status: closed', '---', ''].join('\n'),
        'wayfinder/bugs/tickets/08-crlf-gate.md': ['---', 'id: bug-08', 'type: gate', 'status: closed', '---', ''].join('\r\n'),
        'wayfinder/bugs/tickets/11-typo.md': ticket('bug-11', ['blocked-by: [bug-7]']),
        'wayfinder/bugs/tickets/12-quoted.md': ticket('bug-12', ['blocked-by: ["bug-07"]']),
        'wayfinder/bugs/tickets/13-block-list.md': ticket('bug-13', ['blocked-by:', '  - bug-07']),
        'wayfinder/bugs/tickets/14-no-brackets.md': ticket('bug-14', ['blocked-by: bug-07']),
        'wayfinder/bugs/tickets/15-twice.md': ticket('bug-15', ['blocked-by: []', 'blocked-by: [bug-07]']),
        'wayfinder/bugs/tickets/16-crlf.md': ticket('bug-16', ['blocked-by: []'], '\r\n'),
        'wayfinder/bugs/tickets/17-on-crlf-gate.md': ticket('bug-17', ['blocked-by: [bug-08]']),
        'wayfinder/bugs/tickets/20-good.md': ticket('bug-20', ['blocked-by: [bug-07]']),
        'wayfinder/briefs/2026-10-30-0911-typo.md': brief({ extra: ['ticket: bugs/tickets/11-typo.md'] }),
        'wayfinder/briefs/2026-10-30-0912-quoted.md': brief({ extra: ['ticket: bugs/tickets/12-quoted.md'] }),
        'wayfinder/briefs/2026-10-30-0913-block-list.md': brief({ extra: ['ticket: bugs/tickets/13-block-list.md'] }),
        'wayfinder/briefs/2026-10-30-0914-no-brackets.md': brief({ extra: ['ticket: bugs/tickets/14-no-brackets.md'] }),
        'wayfinder/briefs/2026-10-30-0915-twice.md': brief({ extra: ['ticket: bugs/tickets/15-twice.md'] }),
        'wayfinder/briefs/2026-10-30-0916-crlf.md': brief({ extra: ['ticket: bugs/tickets/16-crlf.md'] }),
        'wayfinder/briefs/2026-10-30-0917-on-crlf-gate.md': brief({ extra: ['ticket: bugs/tickets/17-on-crlf-gate.md'] }),
        'wayfinder/briefs/2026-10-30-0918-never-existed.md': brief({ extra: ['blocked-by: [briefs/2026-10-30-0800-typo.md]'] }),
        'wayfinder/briefs/2026-10-30-1000-good.md': brief({ extra: ['ticket: bugs/tickets/20-good.md'] }),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'claimed');
    assert.equal(result.brief, 'wayfinder/briefs/2026-10-30-1000-good.md');
});

test('take and list report failed when a git read fails, never claimed or an empty list', async () => {
    const q = setup({ 'wayfinder/briefs/2026-10-30-0900-a.md': brief() });
    const shim = join(q.dir, 'shim');
    mkdirSync(shim);
    writeFileSync(join(shim, 'git'), `#!/bin/sh\n[ "$1" = "$FAIL_GIT" ] && exit 1\nexec "${REAL_GIT}" "$@"\n`);
    chmodSync(join(shim, 'git'), 0o755);
    const failing = (command) => ({ ...q, env: { ...q.env, PATH: `${shim}:${q.env.PATH}`, FAIL_GIT: command } });

    const taken = await queue(failing('cat-file'), q.target, 'take', q.one);
    const listed = await queue(failing('ls-tree'), q.one, 'list', q.one);

    assert.equal(taken.outcome, 'failed');
    assert.equal(listed.outcome, 'failed');
    assert.equal(listed.briefs, undefined);
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md'), /^status: ready$/m);
});

test('take reports nothing ready for a draft brief', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-e.md': brief({ status: 'draft' }),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'nothing ready');
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-e.md'), /^status: draft$/m);
});

test('two clones that claim the same brief at once get one claim and one busy', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief(),
    });
    // Clone two claims while clone one is in its push, so the push of clone one meets a rejected push.
    const hook = join(q.one, '.git/hooks/pre-push');
    writeFileSync(hook, [
        '#!/bin/sh',
        `[ -e "${q.dir}/mark" ] && exit 0`,
        `touch "${q.dir}/mark"`,
        'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX',
        `cd "${q.target}" && node "${SCRIPT}" take "${q.two}" > "${q.dir}/two.json"`,
        '',
    ].join('\n'));
    chmodSync(hook, 0o755);

    const one = await queue(q, q.target, 'take', q.one);
    const two = JSON.parse(readFileSync(join(q.dir, 'two.json'), 'utf8'));

    assert.equal(two.outcome, 'claimed');
    assert.equal(one.outcome, 'busy');
    assert.deepEqual(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md').match(/^status:.*$/gm), ['status: in-progress']);
});

test('take refuses a title with a line break, a second status line, or an unknown key, and sets the brief to stuck', async () => {
    const raw = (title) => ['---', title, 'status: draft', `updated: ${hoursAgo(0)}`, '---', '## Brief', '', '- Targets: `CakeClub`', ''].join('\n');
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-cr.md': raw('title: Fix\rstatus: ready'),
        'wayfinder/briefs/2026-10-30-0901-ls.md': raw('title: Fix\u2028status: ready'),
        'wayfinder/briefs/2026-10-30-0902-twice.md': raw('title: Fix\nstatus: ready'),
        'wayfinder/briefs/2026-10-30-0903-proto.md': raw('title: Fix\n__proto__: ready'),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'nothing ready');
    for (const name of ['2026-10-30-0900-cr.md', '2026-10-30-0901-ls.md', '2026-10-30-0902-twice.md', '2026-10-30-0903-proto.md']) {
        const text = onRemote(q, `wayfinder/briefs/${name}`);
        assert.deepEqual(text.match(/^status:.*$/gmu), ['status: stuck'], name);
        assert.match(text, /^result: "bad frontmatter"$/m, name);
    }
});

test('take refuses a brief whose slug holds $( or a space', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a$(touch pwned).md': brief(),
        'wayfinder/briefs/2026-10-30-0901-a b.md': brief(),
    });

    const result = await queue(q, q.target, 'take', q.one);

    assert.equal(result.outcome, 'nothing ready');
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a$(touch pwned).md'), /^result: "bad frontmatter"$/m);
    assert.match(onRemote(q, 'wayfinder/briefs/2026-10-30-0901-a b.md'), /^result: "bad frontmatter"$/m);
    assert.equal(existsSync(join(q.target, 'pwned')), false);
});

test('write refuses a brief name that holds $( or a space', async () => {
    const q = setup({ 'wayfinder/briefs/.gitkeep': '' });
    const input = join(q.dir, 'queued-brief.md');
    writeFileSync(input, queued());

    const result = await queue(q, q.one, 'write', q.one, input, '2026-10-30-0900-a$(x) b.md');

    assert.equal(result.outcome, 'refused');
    assert.equal(result.exit, 1);
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a$(x) b.md'), null);
});

test('write refuses a title with a line break or a second status line, and an unknown key', async () => {
    const q = setup({ 'wayfinder/briefs/.gitkeep': '' });
    const inputs = {
        cr: ['title: Fix\rstatus: ready', 'status: draft'],
        ls: ['title: Fix status: ready', 'status: draft'],
        twice: ['title: Fix\nstatus: ready', 'status: draft'],
        unknown: ['title: Fix', 'owner: me'],
        ok: ['title: Fix', 'status: draft'],
    };

    const outcomes = {};
    for (const [name, lines] of Object.entries(inputs)) {
        writeFileSync(join(q.dir, `${name}.md`), queued(lines));
        outcomes[name] = (await queue(q, q.one, 'write', q.one, join(q.dir, `${name}.md`))).outcome;
    }

    assert.deepEqual(outcomes, { cr: 'refused', ls: 'refused', twice: 'refused', unknown: 'refused', ok: 'saved' });
    assert.equal(git(q.remote, 'ls-tree', '--name-only', 'main', 'wayfinder/briefs/').trim().split('\n').length, 2);
});

test('write refuses a ticket path in briefs/, and leaves that brief alone', async () => {
    const q = setup({ 'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'in-progress' }) });
    const before = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md');
    const input = join(q.dir, 'queued-brief.md');
    writeFileSync(input, queued(['title: Fix', 'ticket: briefs/2026-10-30-0900-a.md']));

    const result = await queue(q, q.one, 'write', q.one, input);

    assert.equal(result.outcome, 'refused');
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md'), before);
});

test('write refuses a Targets line that is not one line naming one repo', async () => {
    const q = setup({ 'wayfinder/briefs/.gitkeep': '' });
    const inputs = {
        nested: queued(['title: Nested'], '\n  - `CakeClubE2E` on `main`\n  - `CakeClub` on `main`'),
        two: queued(['title: Two'], '`CakeClub`, `CakeClubBackend`, base branch `main`'),
        ok: queued(['title: One']),
    };

    const outcomes = {};
    for (const [name, text] of Object.entries(inputs)) {
        writeFileSync(join(q.dir, `${name}.md`), text);
        outcomes[name] = (await queue(q, q.one, 'write', q.one, join(q.dir, `${name}.md`))).outcome;
    }

    assert.deepEqual(outcomes, { nested: 'refused', two: 'refused', ok: 'saved' });
});

test('write refuses a blocker path that does not exist, a new brief whose name exists, and a change to a done brief', async () => {
    // The new brief gets the name of the minute of the write. Both minutes around the call already hold a brief with that name.
    const nameAt = (offset) => `${new Date(Date.now() + offset).toISOString().slice(0, 16).replace('T', '-').replace(':', '')}-fix.md`;
    const q = setup({
        [`wayfinder/briefs/${nameAt(0)}`]: brief({ status: 'draft' }),
        [`wayfinder/briefs/${nameAt(60e3)}`]: brief({ status: 'draft' }),
        'wayfinder/briefs/2026-10-30-0900-done.md': brief({ status: 'done' }),
    });
    const before = git(q.remote, 'rev-parse', 'main');
    const write = async (lines, ...path) => {
        writeFileSync(join(q.dir, 'queued-brief.md'), queued(lines));
        return (await queue(q, q.one, 'write', q.one, join(q.dir, 'queued-brief.md'), ...path)).outcome;
    };

    const missingBlocker = await write(['title: Blocked', 'blocked-by: [briefs/2026-10-30-0800-typo.md]']);
    const existingName = await write(['title: Fix']);
    const done = await write(['title: Done again'], '2026-10-30-0900-done.md');
    const existingBlocker = await write(['title: Blocked', 'blocked-by: [briefs/2026-10-30-0900-done.md]']);

    assert.deepEqual([missingBlocker, existingName, done], ['refused', 'refused', 'refused']);
    assert.equal(existingBlocker, 'saved');
    assert.equal(git(q.remote, 'rev-parse', 'main^'), before);
});

// The first push of record fails after `hookBody` changes the checkout. The retry then meets the push guard.
function failFirstPush(q, hookBody) {
    const hook = join(q.one, '.git/hooks/pre-push');
    writeFileSync(hook, ['#!/bin/sh', `[ -e "${q.dir}/mark" ] && exit 0`, `touch "${q.dir}/mark"`, ...hookBody, 'exit 1', ''].join('\n'));
    chmodSync(hook, 0o755);
}

test('record refuses to push when an extra commit lands in its checkout', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'in-progress' }),
    });
    // The extra commit changes only the brief, so only the count of commits shows it.
    failFirstPush(q, ['echo extra >> wayfinder/briefs/2026-10-30-0900-a.md', 'git commit -q -a -m extra']);
    const before = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md');
    writeFileSync(join(q.dir, 'result.txt'), 'blocked');

    const result = await queue(q, q.target, 'record', q.one, '2026-10-30-0900-a.md', 'stuck', join(q.dir, 'result.txt'));

    assert.equal(result.outcome, 'refused');
    assert.ok(existsSync(join(q.dir, 'mark')));
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md'), before);
});

test('record refuses to push its one commit when it also changes a file outside the step', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'in-progress' }),
    });
    failFirstPush(q, ['echo extra > extra.txt', 'git add extra.txt', 'git commit -q --amend --no-edit']);
    const before = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md');
    writeFileSync(join(q.dir, 'result.txt'), 'blocked');

    const result = await queue(q, q.target, 'record', q.one, '2026-10-30-0900-a.md', 'stuck', join(q.dir, 'result.txt'));

    assert.equal(result.outcome, 'refused');
    assert.ok(existsSync(join(q.dir, 'mark')));
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md'), before);
    assert.equal(onRemote(q, 'extra.txt'), null);
});

test('write commits when the user has a failing pre-commit hook and commit signing on', async () => {
    const q = setup({ 'wayfinder/briefs/.gitkeep': '' });
    git(q.one, 'config', 'commit.gpgsign', 'true');
    git(q.one, 'config', 'gpg.program', 'false');
    writeFileSync(join(q.one, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(q.one, '.git/hooks/pre-commit'), 0o755);
    writeFileSync(join(q.dir, 'queued-brief.md'), queued());

    const result = await queue(q, q.one, 'write', q.one, join(q.dir, 'queued-brief.md'));

    assert.equal(result.outcome, 'saved');
    assert.match(onRemote(q, result.brief), /^status: draft$/m);
});

test('record rebases and pushes when another clone pushes during the build', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief(),
    });
    const taken = await queue(q, q.target, 'take', q.one);
    // The other session pushes after record reads the remote and before its push lands.
    const hook = join(q.one, '.git/hooks/pre-push');
    writeFileSync(hook, [
        '#!/bin/sh',
        `[ -e "${q.dir}/mark" ] && exit 0`,
        `touch "${q.dir}/mark"`,
        'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX',
        `cd "${q.two}" && git pull -q --rebase origin main && echo note > wayfinder/note.md && git add -A && git commit -q -m other && git push -q origin HEAD:main`,
        '',
    ].join('\n'));
    chmodSync(hook, 0o755);
    const resultFile = join(q.dir, 'result.txt');
    writeFileSync(resultFile, 'https://github.com/CakeClub-Inc/CakeClub/pull/42 merged');

    const result = await queue(q, q.target, 'record', q.one, taken.brief, 'done', resultFile);

    assert.equal(result.outcome, 'saved');
    assert.ok(existsSync(join(q.dir, 'mark')));
    assert.equal(onRemote(q, 'wayfinder/note.md'), 'note\n');
    const a = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md');
    assert.match(a, /^status: done$/m);
    assert.match(a, /^result: "https:\/\/github.com\/CakeClub-Inc\/CakeClub\/pull\/42 merged"$/m);
});

test('record writes the result on one line of at most 300 characters', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'in-progress' }),
    });
    const resultFile = join(q.dir, 'result.txt');
    writeFileSync(resultFile, `blocked "on" review\r\nstatus: ready\u2028${'x'.repeat(400)}`);

    await queue(q, q.target, 'record', q.one, '2026-10-30-0900-a.md', 'stuck', resultFile);

    const a = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md');
    assert.deepEqual(a.match(/^status:.*$/gmu), ['status: stuck']);
    const result = JSON.parse(a.match(/^result: (.*)$/m)[1]);
    assert.equal(result.length, 300);
    assert.ok(result.startsWith('blocked "on" review'));
});

test('take keeps a blocker brief until its PR merges, then deletes it and claims the blocked brief', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-f.md': brief({ status: 'done', extra: ['result: "https://github.com/CakeClub-Inc/CakeClub/pull/12 not merged"'] }),
        'wayfinder/briefs/2026-10-30-1000-g.md': brief({ extra: ['blocked-by: [briefs/2026-10-30-0900-f.md]'] }),
    });

    const open = await queue(q, q.target, 'take', q.one);
    const fWhileOpen = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-f.md');
    q.setPrState('MERGED');
    const merged = await queue(q, q.target, 'take', q.one);

    assert.equal(open.outcome, 'nothing ready');
    assert.notEqual(fWhileOpen, null);
    assert.equal(merged.outcome, 'claimed');
    assert.equal(merged.brief, 'wayfinder/briefs/2026-10-30-1000-g.md');
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-f.md'), null);
});

test('list shows a status that another clone pushed, with no pull in the reading clone', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief(),
    });
    pushFromTwo(q, { 'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'stuck', extra: ['result: "blocked"'] }) });

    const result = await queue(q, q.one, 'list', q.one);
    const single = await queue(q, q.one, 'list', q.one, 'wayfinder/briefs/2026-10-30-0900-a.md');

    assert.equal(single.briefs[0].status, 'stuck');
    assert.match(single.briefs[0].body, /^- Goal: the booking page shows the return date$/m);
    assert.equal(result.briefs[0].body, undefined);
    assert.equal(result.briefs.length, 1);
    assert.equal(result.briefs[0].path, 'wayfinder/briefs/2026-10-30-0900-a.md');
    assert.equal(result.briefs[0].status, 'stuck');
    assert.equal(result.briefs[0].result, 'blocked');
    assert.match(readFileSync(join(q.one, 'wayfinder/briefs/2026-10-30-0900-a.md'), 'utf8'), /^status: ready$/m);
});

test('list and take print a hand-pushed title and result with no line break or control character', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief().replace('title: "Show the return date"', 'title: "Show\\u0007 the\\nreturn date"'),
        'wayfinder/briefs/2026-10-30-0901-s.md': brief({ status: 'stuck', extra: ['result: "blocked\\u001b[2J\\u2028status: ready"'] }),
    });

    const listed = await queue(q, q.one, 'list', q.one);
    const taken = await queue(q, q.target, 'take', q.one);

    assert.equal(listed.briefs[0].title, 'Show  the return date');
    assert.equal(listed.briefs[1].result, 'blocked [2J status: ready');
    assert.equal(taken.title, 'Show  the return date');
});

test('write pushes a draft brief and the brief field of its ticket in one commit, and ready sets it ready', async () => {
    const q = setup({
        '.wayfinder/bugs/tickets/05-fix.md': ['---', 'id: bug-05', 'title: Fix the sync', 'type: task', 'status: open', 'assignee:', 'blocked-by: []', '---', ''].join('\n'),
    });
    const input = join(q.dir, 'queued-brief.md');
    writeFileSync(input, queued(['title: Fix the sync', 'ticket: bugs/tickets/05-fix.md']));

    const written = await queue(q, q.one, 'write', q.one, input);
    const draft = onRemote(q, written.brief);
    const commitFiles = git(q.remote, 'show', '--name-only', '--format=', 'main').trim().split('\n').sort();
    const name = written.brief.split('/').pop();
    const ready = await queue(q, q.one, 'ready', q.one, name, written.hash);

    assert.match(written.brief, /^\.wayfinder\/briefs\/\d{4}-\d\d-\d\d-\d{4}-fix-the-sync\.md$/);
    assert.match(draft, /^status: draft$/m);
    assert.match(draft, /^ticket: bugs\/tickets\/05-fix\.md$/m);
    assert.deepEqual(commitFiles, ['.wayfinder/bugs/tickets/05-fix.md', written.brief].sort());
    assert.match(onRemote(q, '.wayfinder/bugs/tickets/05-fix.md'), new RegExp(`^brief: briefs/${name}$`, 'm'));
    assert.equal(ready.outcome, 'saved');
    assert.match(onRemote(q, written.brief), /^status: ready$/m);
});

test('ready refuses the hash of a text that a second write replaced, and takes the hash of the new text', async () => {
    const q = setup({ 'wayfinder/briefs/.gitkeep': '' });
    const input = join(q.dir, 'queued-brief.md');
    writeFileSync(input, queued(['title: Show the return date']));
    const first = await queue(q, q.one, 'write', q.one, input);
    writeFileSync(input, queued(['title: Show the return date and time']));
    const second = await queue(q, q.one, 'write', q.one, input, first.brief);

    const stale = await queue(q, q.one, 'ready', q.one, first.brief, first.hash);
    const afterStale = onRemote(q, first.brief);
    const fresh = await queue(q, q.one, 'ready', q.one, first.brief, second.hash);

    assert.equal(stale.outcome, 'refused');
    assert.match(afterStale, /^status: draft$/m);
    assert.equal(fresh.outcome, 'saved');
    const readied = onRemote(q, first.brief);
    assert.match(readied, /^status: ready$/m);
    assert.match(readied, /^title: "Show the return date and time"$/m);
});

test('write and ready refuse an in-progress brief', async () => {
    const q = setup({
        'wayfinder/briefs/2026-10-30-0900-a.md': brief({ status: 'in-progress' }),
    });
    const input = join(q.dir, 'queued-brief.md');
    writeFileSync(input, queued());
    const before = onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md');

    const written = await queue(q, q.one, 'write', q.one, input, '2026-10-30-0900-a.md');
    const ready = await queue(q, q.one, 'ready', q.one, '2026-10-30-0900-a.md');

    assert.equal(written.outcome, 'refused');
    assert.equal(ready.outcome, 'refused');
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-a.md'), before);
});

test('close deletes each brief of the map that is not done, and refuses while one is in progress', async () => {
    const q = setup({
        'wayfinder/bugs/map.md': '## Destination\n',
        'wayfinder/briefs/2026-10-30-0900-r.md': brief({ extra: ['ticket: bugs/tickets/01-a.md'] }),
        'wayfinder/briefs/2026-10-30-0901-d.md': brief({ status: 'done', extra: ['ticket: bugs/tickets/02-b.md'] }),
        'wayfinder/briefs/2026-10-30-0902-p.md': brief({ status: 'in-progress', extra: ['ticket: bugs/tickets/03-c.md'] }),
        'wayfinder/briefs/2026-10-30-0903-o.md': brief({ extra: ['ticket: soc2/tickets/01-a.md'] }),
    });

    const busy = await queue(q, q.one, 'close', q.one, 'bugs');
    pushFromTwo(q, { 'wayfinder/briefs/2026-10-30-0902-p.md': brief({ status: 'stuck', extra: ['ticket: bugs/tickets/03-c.md'] }) });
    const closed = await queue(q, q.one, 'close', q.one, 'bugs');

    assert.equal(busy.outcome, 'refused');
    assert.equal(closed.outcome, 'saved');
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0900-r.md'), null);
    assert.equal(onRemote(q, 'wayfinder/briefs/2026-10-30-0902-p.md'), null);
    assert.notEqual(onRemote(q, 'wayfinder/briefs/2026-10-30-0901-d.md'), null);
    assert.notEqual(onRemote(q, 'wayfinder/briefs/2026-10-30-0903-o.md'), null);
});

test('close refuses a map directory that does not exist, and a map whose brief blocks a brief of another map', async () => {
    const q = setup({
        'wayfinder/bugs/map.md': '## Destination\n',
        'wayfinder/briefs/2026-10-30-0900-r.md': brief({ extra: ['ticket: bugs/tickets/01-a.md'] }),
        'wayfinder/briefs/2026-10-30-0901-w.md': brief({ extra: ['blocked-by: [briefs/2026-10-30-0900-r.md]'] }),
    });
    const before = git(q.remote, 'rev-parse', 'main');

    const unknown = await queue(q, q.one, 'close', q.one, 'bug');
    const blocking = await queue(q, q.one, 'close', q.one, 'bugs');

    assert.equal(unknown.outcome, 'refused');
    assert.equal(blocking.outcome, 'refused');
    assert.match(blocking.reason, /2026-10-30-0901-w\.md/);
    assert.equal(git(q.remote, 'rev-parse', 'main'), before);
});
