# Deletion criteria

A line goes on the deletion table when one of these holds. Each row carries the line, the criterion, and the evidence.

- **It names something that no longer exists.** A path, script, command, package, branch, or file that is not there. Check with `ls`, `git ls-files`, the manifest's scripts, `--help`.
- **The environment now states it.** A linter rule, a manifest script, a config value. The lookup is cheap; the line is a cache gone stale.
- **A newer line contradicts it.** Two rules on the same subject: the older one goes, the newer one is checked against the code.
- **The code does not follow it.** A convention the codebase violates in most places is a wish, not a rule. Propose deletion or a ratchet, never silent retention.
- **It is transitional.** "Legacy", "deprecated", "for backward compatibility", "until X lands", "for now": read the date and the state; when the transition is over, the line goes with it.
- **It restates the agent's defaults.** A line that changes nothing in behaviour pays load to say nothing.

Deletion is a one-place edit. When a rule was cached from a document, point at the document instead of keeping the copy.
