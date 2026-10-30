PR title: feat(guard-infra): ask before a privileged infra call, and find it where the shell runs it

## Why

The old classic hook in `personal` (`personal/hooks/guard-privileged-commands.mjs`) searched command text for tool names. It missed `sh -c 'kubectl delete pod web-1'`, `bash -lc "helm uninstall web"`, `/opt/homebrew/bin/kubectl delete pod web-1`, and blocked harmless `grep -n kubectl README.md` and `echo "run kubectl delete ..."`. It only refused.

## What

- `guard-infra`, a new mod. A `tool.call` hook on Bash finds each `aws`, `aws-vault`, `kubectl`, `helm`, or `terraform apply|destroy` call that is not a read.
- Shell-aware parsing (`commands.ts`): splits the line the way the shell does and checks only the word that runs: after reserved words, assignments, and wrappers `env`, `sudo`, `xargs`, `timeout`, `nice`, `command`, `exec`; inside `sh -c '…'`, `bash -lc "…"`, `eval`, `$(…)`, `<(…)`, backticks; by base name. Quotes, redirection targets, and heredoc bodies are text.
- The read-only lists are unchanged from the old hook (`kubectl get`, `aws … list-*`, `aws s3 ls`, `helm list`...). A read that returns a secret still asks.
- Run or Cancel: a non-read call opens Claude Code's question dialog, which reaches the user in every permission mode. Run runs the call. Cancel refuses and tells the model not to retry. A typed answer refuses and the model reads the text. Esc, or no one to ask (`claude -p`), refuses and the model hands the user the command. A hook failure refuses through `.catch`.
- The old classic hook is deleted. `work-like-mehrdad` rule now says the mod asks. `personal` goes to 0.1.6. README and marketplace entries added.
- Known limit (ponytail comment): `$KUBECTL delete` is not seen.

## Verified

`claude plugin test guard-infra` 6 pass; a table test covers 41 commands including all 30 cases from the old hook's tests.
