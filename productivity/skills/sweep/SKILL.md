---
name: sweep
description: Checks the live state of the PRs, issues, pages, and threads linked from the `.wayfinder/` tracker of an orchestrator repo, on any host such as GitHub, Linear, Jira, Confluence, Notion, or Slack, and gives each fact from a session its place in the tracker. Use when orchestrate starts work on a map or ends a session, when sup builds its report, or when the user says "sweep", "check the PRs", or "what changed".
---

# Sweep

The tracker of an orchestrator repo is a record. It shows the world at the time a session last wrote it. A link to a PR, an issue, a page, or a thread shows the world now. Sweep makes the record match the world. The file format of the tracker belongs to `productivity:orchestrate`.

The caller names a mode:

- **write** mode: the caller edits the tracker files, then commits. Orchestrate uses this mode.
- **report** mode: the caller prints the result table and writes nothing. Sup uses this mode.

## Sources

`.wayfinder/sources.md` lists each host that the tracker links to. Sweep owns this file.

```markdown
# Sources

| Host | Holds | Live |
|---|---|---|
| `github.com/<org>` | PRs, issues | yes |
| `<team>.atlassian.net` | Jira issues, Confluence pages | yes |
| `docs.<vendor>.com` | vendor docs | no |
```

A **live link** is a link to a host with `Live: yes`. Its target can change. A host with `Live: no` holds pages that do not change the state of a ticket, for example vendor docs. The `no` rows stop the same host from showing as new in every session.

## Live links

1. For each map that the caller names, collect these files:
   - the row of the map in `.wayfinder/README.md`
   - each ticket with `status: open`
   - each closed ticket with a `## Brief` section
2. Get every link from these files.
   ```bash
   grep -oHE 'https?://[^] )>"]+' <files> | sort -u
   ```
3. Match each link to the longest Host in `sources.md`. Skip a link whose host has `Live: no`.
4. If no Host matches a link, the host is new. Give the host one row in the result table, with the place `sources.md`. If `sources.md` is missing, every host is new.
5. If a ticket has a `## Brief` with a git repo in its Targets or in an older Repos line, and no PR link, search for the PR with `gh search prs "<ticket path>"`. `dev:fire` names the ticket path in each PR body.
6. If a `waiting` row has no link, mark the row "check by hand".

The step is done when each live link is listed with the file that holds it, and each new host has a row.

## Check

Check all live links in parallel, with one call for each link. Use the MCP tool or the CLI that the session has for the host. Compare the status, the last edit, and the comments after the date in the record.

For a GitHub PR, use `gh pr view <url> --json state,reviewDecision,mergedAt,statusCheckRollup`. The review state and the CI state are easy to miss.

If the session has no tool for the host, or the call fails, mark the link "not checked" and give the reason. Do not guess the state.

The step is done when each live link has a state or a "not checked" mark.

## Session items

Use this section only at the end of an orchestrate session. List each answer from the user, each fact that you found, and each new term. For each item, name its place: a ticket resolution, a new ticket, Not yet specified, Out of scope, the map's Notes, `CONTEXT.md`, or an ADR.

## Result

Write one table. It has one row for each live link whose state is different from the record, one row for each new host, and one row for each session item.

| Item | The record says | Now | Place |
|---|---|---|---|
| [Subscription spec PR](https://github.com/org/repo/pull/12) | waiting Amin since 2026-10-03 | approved 2026-10-04 | index row, status `open` |
| `acme.atlassian.net` | not in `sources.md` | Jira issues, Live `yes` | `sources.md` |

For a new host, the Now column gives what the host holds and the Live value. Set Live to `yes` when the host holds items that can change: PRs, issues, pages that people edit, or threads. A live link whose state matches the record gets no row. After the table, give the number of links checked. Then list each link marked "not checked" or "check by hand".

- In write mode, write each row to its place. The step is done when each row is written.
- In report mode, print the table and write nothing.
