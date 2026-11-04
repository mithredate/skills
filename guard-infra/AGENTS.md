# guard-infra

- **Isolate agents with the Claude Code sandbox.** Do not propose a container. A Docker sidecar with an egress firewall failed. Its OAuth went stale, MCP SSO callbacks needed host network, and the firewall broke when CDN addresses changed.
- **A call that fails in the sandbox retries outside it with the review of the permission mode.** Do not add `excludedCommands` to `sandbox.json`. An excluded command runs outside the sandbox on every call, where it can read `~/.aws`, for example `soffice --cat`.
- **A sandboxed call writes only in the session's folder.** Do not add `~/projects`, or another folder that holds a repo, to `allowWrite`. Claude Code protects the `.git` config and hooks only in the session's folder. A `denyWrite` glob does not fully protect them in other folders. Git can also read its config from outside `.git`. If a sandboxed call changes the git config of a repo, git later runs that code outside the sandbox. Keep every `denyWrite` entry.
