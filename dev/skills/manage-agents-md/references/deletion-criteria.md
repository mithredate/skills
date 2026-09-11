# Deletion criteria

A line goes on the deletion table when one of these holds. Each row carries the line, the criterion, and the evidence.

- **The line names something that no longer exists.** It can be a path, script, command, package, branch, or file that does not exist. Check with `ls`, `git ls-files`, the manifest, or `--help`.
- **The environment now states it.** Examples are a linter rule, a manifest script or target, and a config value. The what belongs to the environment. Only the how stays in the file.
- **A newer line contradicts it.** Two rules can address the same subject. Delete the older one and check the newer one against the code.
- **The code does not follow it.** A convention that the codebase violates in most places is not a rule. Propose deletion, or a rule that applies to new code only. Do not silently keep the line.
- **The line is transitional.** Examples are the words "legacy", "deprecated", "for backward compatibility", "until X lands", and "for now". Read the date and the state that the line names. When the transition ends, delete the line.
- **The line restates the agent's defaults.** A line that changes nothing in the agent's behaviour adds length without adding value.

Deletion is a one-place edit. When a rule repeats a document, point at the document instead of keeping a copy of the rule.
