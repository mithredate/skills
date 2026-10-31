#!/usr/bin/env node
// brief-queue does every git and frontmatter step of the orchestrate brief queue.
//   list   <tracker repo> [<brief>]               with <brief>, only that brief and its body
//   write  <tracker repo> <brief file> [<brief>]  prints the hash of the pushed text
//   ready  <tracker repo> <brief> <hash>
//   take   <tracker repo>                         run it in the target repo
//   record <tracker repo> <brief> done|stuck <result file>
//   close  <tracker repo> <map directory>
// <brief> is the file name of a brief, or its path.
// It reads only the pushed state, and writes only in a checkout of its own.
// Each command prints one JSON line. A refusal or a failure exits 1.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const env = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };
const git = async (cwd, ...args) => (await exec('git', args, { cwd, env, maxBuffer: 1 << 26 })).stdout;

const STATUSES = ['draft', 'ready', 'in-progress', 'done', 'stuck'];
const KEYS = ['title', 'status', 'updated', 'ticket', 'blocked-by', 'result'];
const NAME = /^\d{4}-\d\d-\d\d-\d{4}-[a-z0-9-]+\.md$/;
// A path relative to the tracker. No segment starts with a dot, so `..` cannot leave the tracker.
const PATH = /^([\w-][\w.-]*\/)*[\w-][\w.-]*\.md$/;
const TICKET = /^[\w-][\w.-]*\/tickets\/[\w-][\w.-]*\.md$/;
const TARGETS = /^- Targets: `([\w.-]+)`, base branch `[\w./-]+`\.?$/;
const LINE_BREAK = /\r\n|[\n\r\u0085\u2028\u2029]/;
const PR = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;
const OVERDUE = 4 * 3600e3;

class Refusal extends Error {}
const refuse = (reason) => { throw new Refusal(reason); };
const now = () => new Date().toISOString().slice(0, 16) + 'Z';
const overdue = (b) => !(Date.now() - Date.parse(b.updated) < OVERDUE);
const clean = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').trim();
const items = (value) => /^\[(.*)\]$/.exec(value ?? '')?.[1].split(',').map((item) => item.trim()).filter(Boolean);

// The first value of each key. `bad` marks a line that is not `key: value`, or a key given twice.
function frontmatter(text) {
    const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text ?? '');
    const fields = Object.create(null);
    let bad = !match;
    for (const line of match ? match[1].split(LINE_BREAK) : []) {
        const pair = /^([\w-]+):[ \t]*(.*?)[ \t]*$/.exec(line);
        if (!pair || Object.hasOwn(fields, pair[1])) bad = true;
        else fields[pair[1]] = pair[2];
    }
    return { fields, bad, body: match ? text.slice(match[0].length) : text ?? '' };
}

function parseBrief(name, text) {
    const { fields, bad, body } = frontmatter(text);
    const brief = { name, body, hash: createHash('sha256').update(text ?? '').digest('hex').slice(0, 12), bad: bad || !NAME.test(name) };
    for (const [key, value] of Object.entries(fields)) {
        if (!KEYS.includes(key)) brief.bad = true;
        else if (key === 'blocked-by') brief[key] = items(value) ?? (brief.bad = true, []);
        else if (!value.startsWith('"')) brief[key] = value;
        else try { brief[key] = String(JSON.parse(value)); } catch { brief.bad = true; }
    }
    if (!TICKET.test(brief.ticket ?? 'x/tickets/x.md') || (brief['blocked-by'] ?? []).some((path) => !PATH.test(path))) brief.bad = true;
    return brief;
}

// The repo of the one Targets line of a brief, or undefined.
function target(body) {
    const lines = body.match(/^- Targets:.*$/gm) ?? [];
    return lines.length === 1 ? TARGETS.exec(lines[0])?.[1] : undefined;
}

function render(brief) {
    const lines = [`title: ${JSON.stringify(clean(brief.title))}`, `status: ${brief.status}`, `updated: ${now()}`];
    if (PATH.test(brief.ticket ?? '')) lines.push(`ticket: ${brief.ticket}`);
    const blockers = (brief['blocked-by'] ?? []).filter((path) => PATH.test(path));
    if (blockers.length) lines.push(`blocked-by: [${blockers.join(', ')}]`);
    if (brief.result) lines.push(`result: ${JSON.stringify(clean(brief.result).slice(0, 300))}`);
    return `---\n${lines.join('\n')}\n---\n${brief.body}`;
}

async function open(repo) {
    await git(repo, 'fetch', '-q', 'origin');
    const ref = (await git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).trim();
    const sha = (await git(repo, 'rev-parse', ref)).trim();
    const top = (await git(repo, 'ls-tree', '--name-only', sha)).split('\n');
    const tracker = top.includes('.wayfinder') ? '.wayfinder' : 'wayfinder';
    const files = new Set((await git(repo, 'ls-tree', '-r', '-z', '--name-only', sha, tracker)).split('\0'));
    return { repo, sha, branch: ref.replace(/^origin\//, ''), tracker, files };
}

// Null only for a file that is not in the pushed tree. A git error throws.
const read = async (q, path) => q.files.has(`${q.tracker}/${path}`) ? git(q.repo, 'cat-file', 'blob', `${q.sha}:${q.tracker}/${path}`) : null;
const list = (q, dir) => [...q.files].filter((file) => posix.dirname(file) === `${q.tracker}/${dir}` && file.endsWith('.md')).map((file) => posix.basename(file));
// The message of the last commit that deleted the file, or '' when no commit deleted it.
const deletion = (q, path) => git(q.repo, 'log', '-1', '--format=%B', '--diff-filter=D', q.sha, '--', `${q.tracker}/${path}`);

async function briefs(q) {
    return Promise.all(list(q, 'briefs').map(async (name) => {
        const brief = parseBrief(name, await read(q, `briefs/${name}`));
        if (!STATUSES.includes(brief.status)) brief.bad = true;
        return brief;
    }));
}

async function brief(q, name) {
    if (!NAME.test(name)) refuse('bad brief name');
    const text = await read(q, `briefs/${name}`);
    return text === null ? null : parseBrief(name, text);
}

// A blocker is open unless the script shows it closed: a file that parses with `status: closed`, or a file that a commit deleted.
// A `done` brief is deleted once its PRs merge. An id or a file that the script cannot read counts as open.
async function blocked(q, brief, deleted) {
    const paths = [...brief['blocked-by'] ?? []];
    if (brief.ticket) {
        const ticket = frontmatter(await read(q, brief.ticket));
        const ids = ticket.bad ? undefined : items(ticket.fields['blocked-by']);
        if (!ids) return true;
        const dir = posix.dirname(brief.ticket);
        const found = new Set();
        for (const name of ids.length ? list(q, dir) : []) {
            const { fields, bad } = frontmatter(await read(q, `${dir}/${name}`));
            if (!bad && ids.includes(fields.id)) found.add(fields.id), paths.push(`${dir}/${name}`);
        }
        if (ids.some((id) => !found.has(id))) return true;
    }
    for (const path of paths.filter((path) => !deleted.includes(path))) {
        const text = await read(q, path);
        const { fields, bad } = frontmatter(text);
        if (text === null ? !await deletion(q, path) : bad || fields.status !== 'closed') return true;
    }
    return false;
}

async function merged(brief) {
    for (const url of brief.result?.match(PR) ?? []) {
        const state = await exec('gh', ['pr', 'view', url, '--json', 'state', '-q', '.state']).then((r) => r.stdout.trim(), () => '');
        if (state !== 'MERGED') return false;
    }
    return true;
}

let leftover;

// Commits `changes`, a map of tracker paths to text or null for a delete, in a new checkout, and pushes that one commit.
async function save(q, changes, message, retries = 3) {
    const co = mkdtempSync(join(tmpdir(), 'brief-queue-'));
    try {
        await git(q.repo, 'worktree', 'add', '-q', '--detach', co, q.sha);
        const files = Object.keys(changes).map((path) => `${q.tracker}/${path}`);
        for (const [path, text] of Object.entries(changes)) {
            const file = join(co, q.tracker, path);
            if (text === null) rmSync(file);
            else mkdirSync(dirname(file), { recursive: true }), writeFileSync(file, text);
        }
        await git(co, 'add', '-A', '--', ...files);
        await git(co, 'commit', '-q', '-m', message);
        for (let attempt = 0; ; attempt++) {
            // The push holds exactly this one commit, and the commit changes only the files of this step.
            const commits = (await git(co, 'rev-list', `origin/${q.branch}..HEAD`)).split('\n').filter(Boolean);
            const changed = (await git(co, 'diff', '--name-only', '--no-renames', '-z', 'HEAD^', 'HEAD')).split('\0').filter(Boolean);
            if (commits.length !== 1 || changed.some((file) => !files.includes(file))) refuse('the push holds more than this step');
            try {
                return await git(co, 'push', '-q', 'origin', `HEAD:refs/heads/${q.branch}`);
            } catch (error) {
                if (attempt >= retries) throw error;
                await git(co, 'fetch', '-q', 'origin');
                await git(co, 'rebase', '-q', `origin/${q.branch}`).catch(async (conflict) => {
                    await git(co, 'rebase', '--abort').catch(() => {});
                    throw conflict;
                });
            }
        }
    } finally {
        // ponytail: a checkout that the sandbox cannot remove stays, and the output names it.
        await git(q.repo, 'worktree', 'remove', '--force', co).catch(() => { leftover = co; });
    }
}

const commands = {
    async list(q, path) {
        const one = path?.split('/').pop();
        return {
            outcome: 'listed',
            briefs: (await briefs(q)).filter((b) => !one || b.name === one).map(({ body, name, ...rest }) => ({
                path: `${q.tracker}/briefs/${name}`, ...rest, overdue: rest.status === 'in-progress' && overdue(rest), ...one && { body },
            })),
        };
    },

    async write(q, file, path) {
        const existing = path?.split('/').pop();
        const input = parseBrief(existing ?? '0000-00-00-0000-new.md', readFileSync(file, 'utf8'));
        if (input.bad || !input.title) refuse('bad frontmatter');
        if (!target(input.body)) refuse('the Targets line must be one line: - Targets: `<repo>`, base branch `<branch>`');
        const missing = (input['blocked-by'] ?? []).filter((path) => !q.files.has(`${q.tracker}/${path}`));
        if (missing.length) refuse(`no such blocker: ${missing.join(', ')}`);
        const slug = clean(input.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-+|-+$/g, '') || 'brief';
        const time = now();
        const name = existing ?? `${time.slice(0, 10)}-${time.slice(11, 13)}${time.slice(14, 16)}-${slug}.md`;
        const current = await brief(q, name);
        if (current && !existing) refuse(`the brief ${name} exists`);
        if (['in-progress', 'done'].includes(current?.status)) refuse(`the brief is ${current.status}`);
        const text = render({ ...input, status: 'draft', result: '' });
        const changes = { [`briefs/${name}`]: text };
        if (input.ticket) {
            const ticket = await read(q, input.ticket) ?? refuse('ticket missing');
            const linked = frontmatter(ticket).fields.brief;
            if (linked && linked !== `briefs/${name}`) refuse(`the ticket has the brief ${linked}`);
            const head = /^---\n[\s\S]*?\n(?=---)/.exec(ticket)?.[0] ?? refuse('bad ticket frontmatter');
            const field = `brief: briefs/${name}\n`;
            changes[input.ticket] = (/^brief:.*\n/m.test(head) ? head.replace(/^brief:.*\n/m, field) : head + field) + ticket.slice(head.length);
        }
        await save(q, changes, `brief-queue: draft ${name}`);
        return { outcome: 'saved', brief: `${q.tracker}/briefs/${name}`, status: 'draft', hash: parseBrief(name, text).hash };
    },

    // The yes binds to the text: `hash` is the hash that `write` printed for the text that the user read.
    async ready(q, path, hash) {
        const name = path.split('/').pop();
        const current = await brief(q, name);
        if (current?.bad !== false || current.status !== 'draft') refuse(`the brief is ${current?.status ?? 'missing'}, not draft`);
        if (current.hash !== hash) refuse('the pushed text is not the text of this hash');
        await save(q, { [`briefs/${name}`]: render({ ...current, status: 'ready' }) }, `brief-queue: ready ${name}`);
        return { outcome: 'saved', brief: `${q.tracker}/briefs/${name}`, status: 'ready' };
    },

    async record(q, path, status, file) {
        const name = path.split('/').pop();
        if (!['done', 'stuck'].includes(status)) refuse('status must be done or stuck');
        const current = await brief(q, name) ?? refuse('no such brief');
        await save(q, { [`briefs/${name}`]: render({ ...current, status, result: readFileSync(file, 'utf8') }) }, `brief-queue: ${status} ${name}`);
        return { outcome: 'saved', brief: `${q.tracker}/briefs/${name}`, status };
    },

    async close(q, map) {
        const mine = (await briefs(q)).filter((b) => b.ticket?.startsWith(`${map.replace(/\/+$/, '')}/`));
        const busy = mine.filter((b) => b.status === 'in-progress').map((b) => b.name);
        if (busy.length) refuse(`in-progress: ${busy.join(', ')}`);
        const gone = mine.filter((b) => b.status !== 'done').map((b) => b.name);
        if (gone.length) await save(q, Object.fromEntries(gone.map((name) => [`briefs/${name}`, null])), `brief-queue: close ${map}`);
        return { outcome: 'saved', deleted: gone.map((name) => `${q.tracker}/briefs/${name}`) };
    },

    async take(q) {
        const origin = (await git(process.cwd(), 'remote', 'get-url', 'origin')).trim();
        const repo = origin.replace(/\.git$/, '').split(/[/:]/).pop() || refuse(`origin has no repo name: ${origin}`);
        const all = (await briefs(q)).filter((b) => !b.bad || b.status !== 'stuck');

        // 1. Set each bad or overdue brief to stuck, and delete each done brief whose PRs merged.
        const changes = {};
        for (const b of all) {
            const path = `briefs/${b.name}`;
            if (b.bad) changes[path] = render({ ...b, status: 'stuck', result: 'bad frontmatter' });
            else if (b.status === 'in-progress' && overdue(b)) changes[path] = render({ ...b, status: 'stuck', result: `no update since ${b.updated}` });
            else if (b.status === 'done' && await merged(b)) changes[path] = null;
        }
        const stuck = Object.keys(changes).filter((path) => changes[path]).map((path) => `${q.tracker}/${path}`);
        const deleted = Object.keys(changes).filter((path) => changes[path] === null);

        // 2. Claim the oldest ready brief for this repo whose blockers are closed, unless a fresh brief is in progress.
        const busy = all.some((b) => !b.bad && b.status === 'in-progress' && !overdue(b));
        let claim;
        for (const b of busy ? [] : all) {
            if (b.bad || b.status !== 'ready' || target(b.body) !== repo || await blocked(q, b, deleted)) continue;
            claim = b;
            changes[`briefs/${b.name}`] = render({ ...b, status: 'in-progress' });
            break;
        }

        // 3. Push. A lost claim race is not retried. The race is lost when the remote moved.
        if (Object.keys(changes).length) {
            try {
                await save(q, changes, claim ? `brief-queue: take ${claim.name}` : 'brief-queue: tidy', claim ? 0 : 3);
            } catch (error) {
                if (!claim || error instanceof Refusal) throw error;
                await git(q.repo, 'fetch', '-q', 'origin');
                if ((await git(q.repo, 'rev-parse', `origin/${q.branch}`)).trim() === q.sha) throw error;
                return { outcome: 'busy', stuck: [] };
            }
        }
        if (!claim) return { outcome: busy ? 'busy' : 'nothing ready', stuck };
        const copy = join(mkdtempSync(join(tmpdir(), 'brief-')), claim.name);
        writeFileSync(copy, changes[`briefs/${claim.name}`]);
        return { outcome: 'claimed', brief: `${q.tracker}/briefs/${claim.name}`, title: claim.title, copy, stuck };
    },
};

// Each printed value gets the cleaning of a written value. The body keeps its lines, as in the file.
const print = (result) => console.log(JSON.stringify({ ...result, ...leftover && { leftover } }, (key, value) => typeof value === 'string' && key !== 'body' ? clean(value) : value));

const [command, repo, ...args] = process.argv.slice(2);
try {
    if (!commands[command] || !repo) refuse('usage: brief-queue list|write|ready|take|record|close <tracker repo> ...');
    print(await commands[command](await open(repo), ...args));
} catch (error) {
    print({ outcome: error instanceof Refusal ? 'refused' : 'failed', reason: error instanceof Refusal ? error.message : error.stderr || error.message });
    process.exitCode = 1;
}
