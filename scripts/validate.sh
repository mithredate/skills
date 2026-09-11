#!/usr/bin/env bash
# Validate the marketplace manifest and every plugin in the repo using the
# official `claude plugin validate` command, plus structural checks that the
# official validator does not cover. Exits non-zero if any check fails.
# Used by CI; also safe to run locally before committing.
set -euo pipefail

cd "$(dirname "$0")/.."

for tool in claude jq python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "✘ \`$tool\` not found on PATH." >&2
    exit 127
  fi
done

failed=0
manifest=.claude-plugin/marketplace.json

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

# The frontmatter of every skill, agent and command must parse as YAML and
# carry a description. The official validator passed a broken agent
# frontmatter on one machine while CI rejected it (2026-09-11, PR #34).
echo
echo "→ frontmatter"
if ! python3 -c 'import yaml' 2>/dev/null; then
  echo "✘ python3 module \`yaml\` not found. Install with: pip3 install pyyaml" >&2
  exit 127
fi
while read -r file; do
  python3 - "$file" <<'PY' || failed=1
import sys, yaml
path = sys.argv[1]
text = open(path).read()
if not text.startswith("---\n"):
    sys.exit(f"✘ {path}: no frontmatter.")
end = text.find("\n---", 4)
if end < 0:
    sys.exit(f"✘ {path}: frontmatter not closed.")
try:
    data = yaml.safe_load(text[4:end])
except yaml.YAMLError as e:
    sys.exit(f"✘ {path}: frontmatter is not valid YAML: {str(e).splitlines()[0]}")
if not isinstance(data, dict) or not data.get("description"):
    sys.exit(f"✘ {path}: frontmatter needs a description.")
PY
done < <(git ls-files '*/skills/*/SKILL.md' '*/agents/*.md' '*/commands/*.md')

echo
if [ "$failed" -ne 0 ]; then
  echo "✘ One or more validations failed."
  exit 1
fi
echo "✓ All validations passed."
