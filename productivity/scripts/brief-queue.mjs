#!/usr/bin/env node
// brief-queue does every git and frontmatter step of the orchestrate brief queue.
//   list   <tracker repo> [<brief>]               with <brief>, only that brief and its body
//   write  <tracker repo> <brief file> [<brief>]
//   ready  <tracker repo> <brief>
//   take   <tracker repo>                      run it in the target repo
//   record <tracker repo> <brief> done|stuck <result file>
// <brief> is the file name of a brief, or its path.
//   close  <tracker repo> <map directory>
// It reads only the pushed state, and writes only in a checkout of its own.
// Each command prints one JSON line. A refusal or a failure exits 1.
import { execFile } from 'node:child_process';
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
    const fields = {};
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
    const brief = { name, body, bad: bad || !NAME.test(name) };
    for (const [key, value] of Object.entries(fields)) {
        if (!KEYS.includes(key)) brief.bad = true;
        else if (key === 'blocked-by') brief[key] = items(value) ?? (brief.bad = true, []);
        else if (!value.startsWith('"')) brief[key] = value;
        else try { brief[key] = String(JSON.parse(value)); } catch { brief.bad = true; }
    }
    if ([brief.ticket ?? 'x.md', ...brief['blocked-by'] ?? []].some((path) => !PATH.test(path))) brief.bad = true;
    return brief;
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
    return { repo, sha, branch: ref.replace(/^origin\//, ''), tracker: top.includes('.wayfinder') ? '.wayfinder' : 'wayfinder' };
}

const read = (q, path) => git(q.repo, 'cat-file', 'blob', `${q.sha}:${q.tracker}/${path}`).catch(() => null);

async function list(q, dir) {
    const tree = await git(q.repo, 'ls-tree', '-z', `${q.sha}:${q.tracker}/${dir}`).catch(() => '');
    return tree.split('\0').map((entry) => entry.split('\t')).filter(([meta, name]) => meta.includes(' blob ') && name.endsWith('.md')).map(([, name]) => name);
}

async function briefs(q) {
    return Promise.all((await list(q, 'briefs')).map(async (name) => {
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

// A blocker is closed when its file is gone or has `status: closed`. A `done` brief is gone once its PRs merge.
async function blocked(q, brief, deleted) {
    const paths = [...brief['blocked-by'] ?? []];
    if (brief.ticket) {
        const ids = items(frontmatter(await read(q, brief.ticket)).fields['blocked-by']) ?? [];
        const dir = posix.dirname(brief.ticket);
        for (const name of ids.length ? await list(q, dir) : []) {
            if (ids.includes(frontmatter(await read(q, `${dir}/${name}`)).fields.id)) paths.push(`${dir}/${name}`);
        }
    }
    for (const path of paths) {
        const text = deleted.includes(path) ? null : await read(q, path);
        if (text !== null && frontmatter(text).fields.status !== 'closed') return true;
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
        const slug = clean(input.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-+|-+$/g, '') || 'brief';
        const time = now();
        const name = existing ?? `${time.slice(0, 10)}-${time.slice(11, 13)}${time.slice(14, 16)}-${slug}.md`;
        if ((await brief(q, name))?.status === 'in-progress') refuse('the brief is in-progress');
        const changes = { [`briefs/${name}`]: render({ ...input, status: 'draft', result: '' }) };
        if (input.ticket) {
            const ticket = await read(q, input.ticket) ?? refuse('ticket missing');
            const linked = frontmatter(ticket).fields.brief;
            if (linked && linked !== `briefs/${name}`) refuse(`the ticket has the brief ${linked}`);
            const head = /^---\n[\s\S]*?\n(?=---)/.exec(ticket)?.[0] ?? refuse('bad ticket frontmatter');
            const field = `brief: briefs/${name}\n`;
            changes[input.ticket] = (/^brief:.*\n/m.test(head) ? head.replace(/^brief:.*\n/m, field) : head + field) + ticket.slice(head.length);
        }
        await save(q, changes, `brief-queue: draft ${name}`);
        return { outcome: 'saved', brief: `${q.tracker}/briefs/${name}`, status: 'draft' };
    },

    async ready(q, path) {
        const name = path.split('/').pop();
        const current = await brief(q, name);
        if (current?.bad !== false || current.status !== 'draft') refuse(`the brief is ${current?.status ?? 'missing'}, not draft`);
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
        const repo = origin.replace(/\.git$/, '').split(/[/:]/).pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // The Targets line names the repo exactly, so `CakeClub` does not match `CakeClubBackend`.
        const targets = new RegExp(`^- (Targets|Repos):(.*[^\\w.-])?${repo}([^\\w.-]|$)`, 'm');
        const all = await briefs(q);
        const changes = {};
        const stuck = [];
        for (const b of all) {
            if (b.bad && b.status !== 'stuck') changes[`briefs/${b.name}`] = render({ ...b, status: 'stuck', result: 'bad frontmatter' });
            else if (!b.bad && b.status === 'in-progress' && overdue(b)) changes[`briefs/${b.name}`] = render({ ...b, status: 'stuck', result: `no update since ${b.updated}` });
            else if (!b.bad && b.status === 'done' && await merged(b)) changes[`briefs/${b.name}`] = null;
            if (changes[`briefs/${b.name}`]) stuck.push(`${q.tracker}/briefs/${b.name}`);
        }
        const busy = all.some((b) => !b.bad && b.status === 'in-progress' && !overdue(b));
        const deleted = Object.keys(changes).filter((path) => changes[path] === null);
        let claim;
        for (const b of busy ? [] : all) {
            if (!b.bad && b.status === 'ready' && targets.test(b.body) && !await blocked(q, b, deleted)) {
                claim = b;
                break;
            }
        }
        if (claim) changes[`briefs/${claim.name}`] = render({ ...claim, status: 'in-progress' });
        if (Object.keys(changes).length) {
            try {
                await save(q, changes, claim ? `brief-queue: take ${claim.name}` : 'brief-queue: tidy', claim ? 0 : 3);
            } catch (error) {
                // A lost claim race is not retried. The race is lost when the remote moved.
                await git(q.repo, 'fetch', '-q', 'origin').catch(() => {});
                const moved = (await git(q.repo, 'rev-parse', `origin/${q.branch}`)).trim() !== q.sha;
                if (claim && moved && !(error instanceof Refusal)) return { outcome: 'busy', stuck: [] };
                throw error;
            }
        }
        if (!claim) return { outcome: busy ? 'busy' : 'nothing ready', stuck };
        const copy = join(mkdtempSync(join(tmpdir(), 'brief-')), claim.name);
        writeFileSync(copy, changes[`briefs/${claim.name}`]);
        return { outcome: 'claimed', brief: `${q.tracker}/briefs/${claim.name}`, title: claim.title, copy, stuck };
    },
};

const [command, repo, ...args] = process.argv.slice(2);
try {
    if (!commands[command] || !repo) refuse('usage: brief-queue list|write|ready|take|record|close <tracker repo> ...');
    const result = await commands[command](await open(repo), ...args);
    console.log(JSON.stringify({ ...result, ...leftover && { leftover } }));
} catch (error) {
    const reason = error instanceof Refusal ? error.message : clean(error.stderr || error.message);
    console.log(JSON.stringify({ outcome: error instanceof Refusal ? 'refused' : 'failed', reason, ...leftover && { leftover } }));
    process.exitCode = 1;
}
