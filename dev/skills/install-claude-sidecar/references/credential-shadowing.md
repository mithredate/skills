# Credential Shadowing

Hide credential files from Claude by mounting `/dev/null` over each file.
The files stay intact on the host. Inside the container, they appear
empty.

> Scope note: This hides files from the model's view of the
> workspace. It does not isolate credentials that the app's code needs at
> runtime, such as a `DATABASE_URL` environment variable. That code runs
> in the same container and can still read them. Credential isolation
> from the model is future work in claude-sidecar, not yet built.

## Discovering Credential Files

Check `.gitignore` and `.dockerignore` for credential patterns:

```bash
grep -E '\.(env|pem|key|crt|credentials|secret)|\bsecrets?\b|\bcredentials?\b|\.npmrc|service.account' .gitignore .dockerignore 2>/dev/null
```

Look for these files:

- `.env*` files, such as `.env`, `.env.local`, and `.env.production`.
- `*.pem`, `*.key`, and `*.crt` files. These are certificates and keys.
- `*credentials*` and `*secrets*` files.
- `.npmrc` and `.pypirc` files. These hold package manager auth.
- `service-account*.json` files. These hold cloud provider credentials.

Show the discovered files to the user when you ask about credential
shadowing.

## Applying Shadows

Add volume mounts to the `claude` service. Use the project's real host
path, `${PWD}`. This matches the `${PWD}:${PWD}` project mount. Make each
mount writable, not `:ro`. A read-only bind of `/dev/null` can fail on
some systems:

```yaml
volumes:
  # Shadow credential files (appear empty to Claude)
  - /dev/null:${PWD}/.env
  - /dev/null:${PWD}/.credentials.json
```

## Common Files to Shadow

- `.env`, `.env.local`, `.env.production`
- `.credentials.json`, `credentials.json`
- `secrets.yaml`, `secrets.json`
- `.npmrc`, if it holds auth tokens
- `service-account.json`

## User Instructions

To shadow more files, add volume mounts in this format:

```yaml
- /dev/null:${PWD}/<path-to-sensitive-file>
```

Example for a database config:

```yaml
- /dev/null:${PWD}/config/database.yml
```
