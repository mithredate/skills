PR title: feat(guard-infra): ask before a privileged infra call, and fail closed on any word that names a tool

## Why

The privileged-command guard in `personal` searched the command text for tool names. Run on 12 commands, it let three dangerous calls through and blocked harmless ones:

```
allow  sh -c 'kubectl delete pod web-1'                 missed
allow  bash -lc "helm uninstall web"                    missed
allow  /opt/homebrew/bin/kubectl delete pod web-1       missed
BLOCK  grep -n kubectl README.md                        false alarm
BLOCK  echo "run kubectl delete pod web-1 yourself"     false alarm
```

It also blocked the commit of this PR, because the commit message names the tools. And it only refused. The user had to copy the command and run it by hand.

## What

- **`guard-infra`, a new mod.** A `tool.call` hook on Bash finds each `aws`, `aws-vault`, `kubectl`, `helm`, or `terraform apply|destroy` call that is not a read.
- **The guard fails closed (`commands.ts`).** It splits the line the way the shell does. Then any word that names a tool asks, in any case and by full path, with two exceptions:
  - The program never runs its words: `echo`, `printf`, `grep`, `rg`, `cat`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`, `tr`, `jq`, `tee`, `less`, `which`, `type`, `command -v`, and `git` or `gh` without `-c`, `-x`, `--exec`, `bisect`, `alias`, or `extension`. This is what keeps `grep -n kubectl README.md` and a commit message quiet.
  - The call is a known read. A read ends the scan only where the tool is the program, so a second `find -exec` is still read.
- **What the parser reads:**
  - A word with a blank in it is a script, as in `sh -c '…'`, `watch '…'`, or `eval '…'`.
  - A heredoc or here-string given to a program that is not text-only is its script, as for `bash <<'EOF'` or a `python3` heredoc.
  - Text that a text-only program writes asks when a program that is not text-only reads it from a pipe or a substitution, as in `echo '…' | sh`, `| sudo bash`, `source <(echo …)`, or `bash -c "$(cat <<'EOF' …)"`.
  - The scripts inside `$(…)`, `<(…)`, backticks, `${…}`, a redirection target, and an unquoted heredoc run.
  - `$'…'` decodes its escapes, `<<\EOF` ends at `EOF`, and a `<<` that never closes also reads the lines after it as commands.
  - A tool's name inside a word that is not a script, such as `ls kubectl/` or `helm3`, asks.
- **The read-only lists are unchanged**: `kubectl get`, `aws … list-*`, `aws s3 ls`, `helm list`, and so on. A read that returns a secret still asks.
- **Run or Cancel.** A call that is not a read opens Claude Code's question dialog. That dialog reaches the user in every permission mode. A permission `ask` from `tool.check` would go to the mode's decider, which in auto mode is the classifier.
  - **Run** runs the call, and the model sees the output.
  - **Cancel** refuses the call, and the model is told not to retry.
  - **A typed answer** refuses the call, and the model reads the text.
  - **Esc, or no one to ask, as in `claude -p`,** refuses the call, and the model hands the user the command.
  - A hook failure refuses the call through `.catch`.
- **The old classic hook is deleted**, so two guards never run side by side. The rule in `work-like-mehrdad` now says the mod asks. `personal` goes to 0.1.6.
- README and marketplace entries added.

The first version of this PR knew a list of wrappers and shell forms. A review ran 18 forms that it did not know, and each one ran with no question, for example `find -exec`, `sudo --user root`, and a heredoc into `sh`. The old text search caught most of them. Now a false alarm costs one click, so failing closed is cheaper than a list. A second review of the fail-closed parser found 10 more gaps, listed in the second fix commit, and they are closed. Some false alarms come back: a `for` loop's words, because the loop can run them as `$c`, a tool's name given to a program that is not on the text-only list, such as `xargs grep kubectl` or `| awk`, and a commit made with `git -c`.

Known limits, the first two marked with a `ponytail:` comment:
- A program word from a variable, such as `$KUBECTL delete`, is not seen.
- A script file, such as `bash deploy.sh`, is not read.
- The read check is the old hook's. An unlisted boolean global flag shifts its positionals, so `aws --debug s3 mv list-x s3://b/k` reads as `list-x`, a read.

The user picked this option from three: keep blocking, Claude Code's permission ask, or this mod.

The guard needs mods, so a build before 2.1.287 has no guard. Install `guard-infra@skills` before you update `personal@skills`, or there is a gap with no guard.

## Verified

- `claude plugin test guard-infra`: 7 pass, 0 fail.
  - A table test covers 108 commands. These include the 26 assertions from the old hook's tests, the 3 misses, the forms from both reviews, and the false alarms and reads that must stay quiet, such as `git commit -m "$(cat <<'EOF' …)"` and `kubectl logs $(kubectl get pod … -o name)`.
  - Hook tests drive `$.tool.call` with a stand-in dialog for Run, Cancel, a typed answer, Esc, a guard that throws, and no question for a read.
- A probe of the 91 commands from the first review gives the expected verdict for each.
- The tests fail when the code breaks. Each of 23 mutations makes a test fail, one per branch, for example `.catch`, the text-only list, the `git` words, the pipe rule, the substitution rule, `||`, heredoc input, `${…}`, `$'…'`, the read scan, and the case of a tool's name.
- A fuzz of 200,000 random shell-like lines: no throw, no hang, slowest 0.55 ms.
- `./scripts/validate.sh` on the branch with `main` merged in: all validations pass, including every mod's tests and type check.
- Not yet seen in a live session. After the merge and an update of `personal@skills` and `guard-infra@skills`, `sh -c 'helm version'` is a harmless way to see the dialog.

## Links

- Planned in this session: "S1 safety mod" (hold and ask with Run and Cancel).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

