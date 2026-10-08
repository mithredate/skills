#!/usr/bin/env bash
# Validate the marketplace manifest and every plugin in the repo using the
# official `claude plugin validate` command, plus structural checks that the
# official validator does not cover. Exits non-zero if any check fails.
# Used by CI; also safe to run locally before committing.
set -euo pipefail

cd "$(dirname "$0")/.."

for tool in claude jq node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "✘ \`$tool\` not found on PATH." >&2
    exit 127
  fi
done

failed=0
manifest=.claude-plugin/marketplace.json
TYPESCRIPT_VERSION=7.0.2

# The repo root is a marketplace, not a plugin. A root plugin.json makes
# installers treat the root as one empty plugin named "skills" and ignore
# the real plugins in subdirectories.
if [ -f .claude-plugin/plugin.json ]; then
  echo "✘ .claude-plugin/plugin.json must not exist at the repo root (root is a marketplace)."
  failed=1
fi

echo "→ marketplace (.)"
claude plugin validate . || failed=1

# Each top-level subdir with .claude-plugin/plugin.json is a plugin.
for plugin_json in */.claude-plugin/plugin.json; do
  plugin_dir=$(dirname "$(dirname "$plugin_json")")
  echo
  echo "→ plugin: $plugin_dir"
  claude plugin validate "$plugin_dir" || failed=1
  if ! jq -e --arg src "./$plugin_dir" '.plugins[] | select(.source == $src)' "$manifest" >/dev/null; then
    echo "✘ $plugin_dir is not registered in $manifest (source \"./$plugin_dir\")."
    failed=1
  fi
done

# Every skill path listed in the manifest must exist.
echo
echo "→ listed skills"
while read -r skill_path; do
  if [ ! -f "$skill_path/SKILL.md" ]; then
    echo "✘ $manifest lists $skill_path but $skill_path/SKILL.md does not exist."
    failed=1
  fi
done < <(jq -r '.plugins[] | .source as $s | (.skills // [])[] | "\($s)/\(.)"' "$manifest" | sed 's#^\./##; s#/\./#/#')

# Hook tests run the real hook with node:test.
echo
echo "→ hook tests"
node --test */hooks/*.test.mjs || failed=1

# Mod tests run the hooks module against the engine's test kit. Some builds,
# such as npm's latest in CI, have no `claude plugin test` yet.
echo
echo "→ mod tests"
if ! claude plugin --help 2>&1 | grep -E '^ +test\b' >/dev/null; then
  echo "⚠ this claude has no \`plugin test\`; skipped mod tests. Run them locally."
else for hooks_json in */hooks/hooks.json; do
  if jq -e '.modules' "$hooks_json" >/dev/null; then
    plugin_dir=$(dirname "$(dirname "$hooks_json")")
    echo "  $plugin_dir"
    claude plugin test "$plugin_dir" || failed=1
  fi
done; fi

# A mod's types come from the claude build. A `--plugin-dir` load writes them
# to .claude-plugin/types/ with no sign-in, and the empty prompt then makes
# claude exit. A build with no mods writes none.
echo
echo "→ mod types"
for hooks_json in */hooks/hooks.json; do
  jq -e '.modules' "$hooks_json" >/dev/null || continue
  plugin_dir=$(dirname "$(dirname "$hooks_json")")
  claude -p --plugin-dir "$plugin_dir" "" >/dev/null 2>&1 || true
  if [ ! -f "$plugin_dir/.claude-plugin/types/tsconfig.json" ]; then
    echo "⚠ this claude wrote no mod types; skipped the type check of $plugin_dir. Run it locally."
    continue
  fi
  echo "  $plugin_dir"
  npx --yes -p "typescript@$TYPESCRIPT_VERSION" tsc -p "$plugin_dir" || failed=1
done

echo
if [ "$failed" -ne 0 ]; then
  echo "✘ One or more validations failed."
  exit 1
fi
echo "✓ All validations passed."
