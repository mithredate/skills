#!/usr/bin/env bash
# The workspace of blast-radius-clean-report-group, plus bin/gh. That stub
# lists one other open PR, number 12, whose diff is open-pr.patch.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bash "$here/../blast-radius-scaffold.sh" "$here"
mkdir -p bin
cp "$here/open-pr.patch" bin/pr-12.diff
cat > bin/gh <<STUB
#!/usr/bin/env bash
dir=\$(cd "\$(dirname "\$0")" && pwd)
case "\$1 \$2" in
  "pr list") echo '[{"number":12,"title":"feat(roles): add a finance role that sees all data"},{"number":13,"title":"feat(reports): let admins export the bookings as JSON"}]' ;;
  "pr diff")
    [[ \$3 == 12 ]] || { echo "no diff for PR \$3" >&2; exit 1; }
    if [[ \${4:-} == --name-only ]]; then echo data/roles.json; else cat "\$dir/pr-12.diff"; fi ;;
  *) echo "gh stub: unsupported: \$*" >&2; exit 1 ;;
esac
STUB
chmod +x bin/gh
