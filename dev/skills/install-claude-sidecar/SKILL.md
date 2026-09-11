---
name: install-claude-sidecar
description: "This skill sets up Claude Sidecar integration in a Docker-based project. Use when the user asks to 'add claude container', 'setup claude-sidecar', 'integrate claude container', 'add claude to docker compose', 'containerize claude', or 'run claude in docker', or wants Claude Code to run as a container service with project toolchains and an egress firewall."
---

# Claude Sidecar Installer

This skill sets up Claude Sidecar. Claude Sidecar runs Claude Code in one
container next to a project. The image installs toolchains, such as node, go,
and python, on demand through [mise](https://mise.jdx.dev). Claude runs build
and test commands directly in the container. Claude reaches the project's
services, such as a database or a cache, over the compose network by name.
The container has no command bridge and no Docker socket access. A startup
firewall allows only approved outbound connections. Claude runs as a
non-root user.

## Workflow

1. Check the project's tech stack, compose file, services, and toolchain version pins.
2. Add or create the `claude` service in the compose file. This uses one container for Claude.
3. Check that toolchains resolve. mise reads `.tool-versions` or `mise.toml`.
4. If the firewall needs more domains, add `.sidecar/allowed-domains.txt`.
5. **Ask about credential shadowing.** Then discover the files, confirm them, and apply the shadow.
6. Seed the Claude auth files and config from the host.

## Step 1: Analyze Project

Find these facts about the project:

- Find the tech stack: the language, the framework, and the package manager.
- Find the compose file, `compose.yml` or `docker-compose.yml`, and its services.
- Find which services the Claude container must reach, such as a database,
  a cache, or a queue. Claude reaches these services by name over the
  compose network.
- Find the toolchain version pins in `.tool-versions`, `mise.toml`, `.nvmrc`,
  `go.mod`, or `.python-version`. If none of these files exist, suggest a
  new `mise.toml` file for reproducible versions. Without it, mise still
  installs a default version.

## Step 2: Add the claude service

Add the `claude` service to the project's compose file. This lets `claude`
share the project network and reach its services. If no compose file
exists, create `compose.yml`.

```yaml
services:
  claude:
    image: ghcr.io/mithredate/claude-sidecar:latest
    stdin_open: true
    tty: true
    # Egress firewall (remove this cap_add block to disable the firewall)
    cap_add:
      - NET_ADMIN
      - NET_RAW
    environment:
      # Config dir for the firewall's allowed-domains.txt (under the project)
      - SIDECAR_CONFIG_DIR=${PWD}/.sidecar
      # Auto-trust mise configs under the project so toolchain pins work
      - MISE_TRUSTED_CONFIG_PATHS=${PWD}
      # On Linux, match the host user so mounted files are owned correctly:
      # - PUID=1000
      # - PGID=1000
      # Connection info the app code needs (the container holds these for now —
      # credential isolation from the model is not yet implemented):
      # - DATABASE_URL=postgres://app:secret@db:5432/app
    volumes:
      # Mount the project at its REAL host path (source == target) so Claude's
      # per-project MCP config + session history (keyed by absolute path) match.
      - ${PWD}:${PWD}
      # Persistent Claude home: auth, config, and installed toolchains persist.
      - claude-home:/home/claude
      # Read-only auth seeds, copied into the volume on first start only (Step 6).
      - ./.credentials.json:/seed/credentials.json:ro
      - ${HOME}/.claude.json:/seed/claude.json:ro
      # Shadow this project's secret files from the model (Step 5).
      - /dev/null:${PWD}/.env
      - /dev/null:${PWD}/.credentials.json
    working_dir: ${PWD}

volumes:
  claude-home:
```

Docker Compose reads `${PWD}` and `${HOME}` from the host shell. This makes
the setup portable across machines. The path inside the container equals
the path on the host.

## Step 3: Toolchains (mise)

The setup needs no bridge and no per-command config. mise reads the
project's `.tool-versions` or `mise.toml` file and resolves the toolchain.
mise installs the toolchain on first use, from a prebuilt package, so this
step is fast. Installs stay in the `claude-home` volume.
`MISE_TRUSTED_CONFIG_PATHS=${PWD}`, set in Step 2, lets mise trust the
project's config. The user does not need to run `mise trust` by hand.

If the project has no version file, recommend a new `mise.toml` file:

```toml
[tools]
node = "22"      # or go, python, etc. — match the project
```

## Step 4: Allowed Domains (Optional)

The firewall builds an allow list of domains when the container starts. It
always adds the GitHub IP ranges to this list. If the project needs more
hosts than the defaults, create `.sidecar/allowed-domains.txt`:

```text
# Anthropic + Claude Code
api.anthropic.com
console.anthropic.com
statsig.anthropic.com
sentry.io
# Package registry + mise toolchain downloads
registry.npmjs.org
mise.jdx.dev
objects.githubusercontent.com
nodejs.org
go.dev
dl.google.com
storage.googleapis.com
# Project-specific APIs / MCP server hosts
# api.example.com
```

A custom file replaces the built-in defaults completely. Include the
Anthropic, npm, and mise hosts shown above, and add any MCP server domains.
Add the domain of each MCP server the project uses. If you miss a domain,
that MCP server cannot connect. To turn off the firewall, remove the
`cap_add` block from the compose file.

> Limitation: The firewall resolves each domain to an IP address one time,
> at container start. A CDN can change its IP addresses later. This can
> break a long-running container until you restart it.

## Step 5: Shadow Credential Files (Optional)

### 5.1: Ask User

"Do you want to shadow credential files? This hides files such as
`.env`, keys, and certificates from Claude. The skill does this by mounting
`/dev/null` over each file. The files stay intact on your host. Inside the
container, they appear empty."

If the user declines, skip to Step 6.

### 5.2: Discover Credentials

Find candidate files with the patterns in
[references/credential-shadowing.md](references/credential-shadowing.md):

```bash
grep -E '\.(env|pem|key|crt|credentials|secret)|\bsecrets?\b|\bcredentials?\b|\.npmrc|service.account' .gitignore .dockerignore 2>/dev/null
find . -maxdepth 3 -type f \( -name ".env*" -o -name "*.pem" -o -name "*.key" -o -name "*credentials*" -o -name "*secret*" -o -name ".npmrc" -o -name "service-account*.json" \) 2>/dev/null | grep -vE 'node_modules|vendor'
```

### 5.3–5.4: Confirm + Ask for More

Show the user the files you found. Ask which files to shadow. Ask if there
are more files, not yet found, to shadow.

### 5.5: Apply Shadows

Add each confirmed file as a `/dev/null` mount. Make the mount writable,
not `:ro`. A read-only, `:ro`, mount of `/dev/null` can fail on some
systems:

```yaml
volumes:
  - /dev/null:${PWD}/.env
  - /dev/null:${PWD}/config/secrets.yaml
```

See [references/credential-shadowing.md](references/credential-shadowing.md).

## Step 6: Seed Claude Auth + Config

The setup seeds auth and config into the `claude-home` volume on first
start, only if the volume is empty. Because of this, the user does not log
in again or set up again when the container restarts. Provide two seed
files before you run `docker compose up`:

1. **`.credentials.json`** must hold the full credential blob: both
   `claudeAiOauth` and `mcpOAuth`. Without `mcpOAuth`, MCP servers stay
   unauthenticated:

   ```bash
   # macOS — capture the WHOLE keychain blob
   security find-generic-password -s "Claude Code-credentials" -w > .credentials.json
   # Linux — the file already contains the full blob
   cp ~/.claude/.credentials.json .credentials.json
   ```

   Check that both keys are present:
   ```bash
   python3 -c "import json;print(list(json.load(open('.credentials.json')).keys()))"
   # -> ['claudeAiOauth', 'mcpOAuth']
   ```

2. **`~/.claude.json`** holds the onboarding state, the `oauthAccount`, and
   the per-project `mcpServers`. Compose mounts this file from the host.
   You do not need to copy it.

**Add to `.gitignore`:** `.credentials.json`

> Limitation: The seeded OAuth credentials are shared with the host
> account. A new login on the host can invalidate the container's copy.
> For a long-lived container, authenticate it on its own instead. Use an
> interactive `/login` inside the container, or use an API key.

**Re-authenticate or reset:** Run `docker compose down -v`. This removes
the volume. The setup seeds new files on the next start.

## Post-Setup Commands

```bash
docker compose up -d claude                          # Start
docker compose exec claude claude                    # Run Claude interactively
docker compose exec -e CLAUDE_YOLO=1 claude claude   # YOLO mode (skip permissions)
docker compose down                                  # Stop
```

The `claude` wrapper inside the image switches to the non-root `claude`
user by itself. Because of this, `docker compose exec claude claude` works
with no `-u` flag.

## Error Handling

### No compose file exists
Create `compose.yml` with the `claude` service from Step 2.

### Toolchain not found / fails to install
The image installs the version pinned in the project's mise config, on
first use. If this install fails, check two things. First, check the
firewall from Step 4. The toolchain download host might not be on the
allow list. Second, check that the project pins a real version.

### Claude can't reach the database / a service
Make sure `claude` and the service are in the same compose file or
network. Connect to the service by its name, for example `db:5432`. By
default, the firewall allows the internal Docker subnet.
