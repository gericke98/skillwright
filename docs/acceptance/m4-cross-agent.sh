#!/usr/bin/env bash
# M4 acceptance (criterion 4): a distilled skill is installed into the
# cross-agent standard location (.agents/skills/) and is executable in SCRIPT
# MODE by a generic, non-Anthropic agent — i.e. any external process that runs
# `bskill run <slug>`. This script proves the mechanism end-to-end from the
# PUBLISHABLE bundle (the tarball's shipped bin), using a PATH shim as the
# "installed CLI". The live browser replay itself is covered by the M3
# real-Chromium integration tests; here we prove discovery + script-mode dispatch.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

# 1. Build the publishable bundle and expose `bskill` on PATH via a shim
#    (this stands in for `npm i -g bskill`).
pnpm --filter bskill bundle >/dev/null
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
BIN="$WORK/bin"; mkdir -p "$BIN"
cat > "$BIN/bskill" <<SHIM
#!/bin/sh
exec node "$REPO/packages/cli/bundle/bin.js" "\$@"
SHIM
chmod +x "$BIN/bskill"
export PATH="$BIN:$PATH"
export BSKILL_HOME="$WORK/lib"

# 2. Distill a fixture recording into a skill (as the shipped CLI).
cat > "$WORK/rec.json" <<'JSON'
{"title":"Delete an invoice","steps":[{"type":"navigate","url":"https://erp.test/invoices"},{"type":"change","selectors":[["aria/Invoice number"]],"value":"INV-1"},{"type":"click","selectors":[["aria/Delete"]]}],"x-bskill":{"version":1,"segment":{"id":"s","parentSkill":null,"recordedAt":"2026-07-07"}}}
JSON
bskill distill "$WORK/rec.json" >/dev/null
SLUG="delete-an-invoice"

# 3. Install into a fresh project's cross-agent skill roots.
PROJ="$WORK/proj"; mkdir -p "$PROJ"
bskill install "$SLUG" --project "$PROJ" >/dev/null

# 4. Discoverability: the skill is readable at the non-Anthropic agent path.
test -f "$PROJ/.agents/skills/$SLUG/SKILL.md" || { echo "FAIL: not discoverable in .agents/skills"; exit 1; }
echo "PASS discovery: .agents/skills/$SLUG/SKILL.md present"

# 5. Script-mode dispatch: any agent runs `bskill run <slug>`. With no endpoint
#    it fails fast with the setup instruction — proving CLI + skill + script path
#    are wired (exit code 1, setup message on stderr).
cd "$PROJ"
if out="$(bskill run "$SLUG" 2>&1)"; then
  echo "FAIL: expected a fast failure without an endpoint"; exit 1
fi
echo "$out" | grep -q "no endpoint" || { echo "FAIL: unexpected dispatch output: $out"; exit 1; }
echo "PASS script-mode dispatch: bskill run reached the replay path"

echo "M4 CROSS-AGENT ACCEPTANCE: PASS"
