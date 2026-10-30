PR title: feat(show-session, tidy-transcript): open commands and agents from the pane, fold a run from its end, keep long notes bright

## Brief

- Why: Mehrdad cannot see the details of a shell command or an agent in the `show-session` pane, the pane has no close control, and its flat text is hard to scan. In the transcript, an unfolded `tidy-transcript` run pushes its fold line off screen while a Bash call prints output, so he cannot fold it again. Important notes, such as answers and review verdicts written before a tool call, go dim a few seconds after they show.
- Goal: One PR on `main` changes both mods. The pane opens a Bash row or an agent with a click, closes with Escape or a `✕`, and draws cards in the style of the reference pane. An unfolded run folds from a line under its last row. A long note stays bright and shows in full.
- Targets: `mithredate-skills` (this repo), base branch `main`. Plugins `show-session` and `tidy-transcript`.
- Decisions:
  - Redesign `show-session`, do not deprecate it. No other view lists the session's skills and folders. Mehrdad agreed in the prep session.
  - The two mods change in one PR. Mehrdad asked for this.
  - Style reference: a pane in another repo. Take its rounded card per section, its chip titles with a count, and its thin line between items. Do not take its hex colors. Keep the theme color names of the current pane, because hex colors do not follow a light theme.
  - Close: open the pane with `closeOnEscape: true`, and draw a `✕` Button with `role="dismiss"` in the header. Claude Code draws its own close mark only on a docked pane.
  - Bash rows: newest first, the newest 8. A click opens a row in place, and a second click closes it. An open row shows the full command, the first 20 lines of the output, and `… N more lines` when the output is longer.
  - Agent rows: a click shows that agent's transcript in the main view, as the tasks list does (`$.ui.view({ agentId })`).
  - The set of open rows lives in module memory. A mod reload closes them. `tidy-transcript` keeps its threads the same way.
  - `tidy-transcript`: an unfolded run draws its fold line at the top and again under its last row. A click on either line folds the run.
  - `tidy-transcript`: a note longer than 300 characters is never drawn dim, and it shows its full text in place of Claude Code's one-line summary (`isSummary` rows). In 638 notes of Mehrdad's last 60 sessions, 90% were 186 characters or shorter, and the 14 over 350 characters were answers, corrections, review verdicts, and briefings.
  - Hypothesis: 20 output lines show the result of most commands. Check: Mehrdad opens 5 rows in his next session and says if one needs more.
  - Hypothesis: 300 characters splits status notes from important notes. Check: in his next sessions, Mehrdad reports any dim important note or bright status line.
- FR:
  - `/show-session` still opens the pane and closes it when the pane is open.
  - With the pane focused, Escape closes it. A press on the header's `✕` closes it.
  - The pane draws the header (model, context share, cost, minutes), then one rounded card each for Skills, Dirs, Bash, and Agents. Each card starts with a chip that names the section and its count. A thin line separates the rows of a card.
  - A section with no rows still shows its card with `no <section> yet`.
  - The Bash card lists the newest 8 calls, newest first. Each row shows the state mark (`✓`, `✗`, or `●` while it runs), the description or the first line of the command, and `▸` when closed or `▾` when open.
  - A press on a Bash row opens it: the full command, then the first 20 lines of the output, then `… N more lines` when more exist. A second press closes it. A running call shows its command and no output.
  - A press on an agent row shows that agent's transcript in the main view.
  - In the transcript, an unfolded run draws its fold line under its last row too. A press on that line folds the run, as a press on the top line does.
  - In the transcript, a note longer than 300 characters draws bright with its full text, also when Claude Code gives the row as a summary. A note of 300 characters or fewer draws dim as before.
- NFR:
  - No new runtime dependency.
  - No `$.state` contract. Module memory only.
  - Theme color names only. No hex colors.
  - Name each limit as a constant: 8 Bash rows, 20 output lines, 300 note characters.
  - Bump the patch version in `show-session/.claude-plugin/plugin.json` and `tidy-transcript/.claude-plugin/plugin.json`.
  - Update the `show-session` and `tidy-transcript` lines in `README.md`, and the `show-session` description in `.claude-plugin/marketplace.json` if it no longer matches.
  - Out of scope: a copy button, a special rule for the text before `AskUserQuestion` (the length rule covers both such notes in the data), and changes to any skill.
  - Mod API: load the `plugin-authoring` skill. Its types file documents `ButtonProps.role`, `PaneOpenArgs.closeOnEscape`, `$.ui.view`, and `AssistantMessage.isSummary`.
- Verification:
  - `claude plugin test show-session` passes with new tests: a press on a Bash row shows the full command and 20 output lines with `… 5 more lines` for a 25-line output, a second press hides them, a press on `✕` closes the pane, and a press on an agent row calls `$.ui.view` with that agent's id.
  - `claude plugin test tidy-transcript` passes with new tests: an unfolded run draws a second fold line under its last row, and a press on it folds the run. A note of 301 characters draws bright, and an `isSummary` row of that note draws the full text. A note of 300 characters draws dim.
  - Test data for the notes: a long note such as "The reviewer returned NOT SAFE, so nothing is merged yet. Its blocking finding is correct. …" padded past 300 characters, and a short note such as "Next is the parser rewrite."
  - `./scripts/validate.sh` passes locally. This runs the mod tests and the mod type checks, which CI skips.
  - Load the branch copy in a session with `claude --plugin-dir show-session --plugin-dir tidy-transcript`, and show Mehrdad the pane and an unfolded run before the merge.

