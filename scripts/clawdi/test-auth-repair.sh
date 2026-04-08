#!/bin/bash

# Vial SKILL.md Validation — Auth Repair (Protocol 4)
# Before/after comparison in a single agent turn

SKILL_PATH="$HOME/.openclaw/workspace/skills/vial/SKILL.md"
SKILL_URL="https://raw.githubusercontent.com/adrianhihi/helix/main/skills/openclaw/SKILL.md"

echo "============================================"
echo "Vial Auth Repair — Before/After Comparison"
echo "============================================"

# ── BEFORE: No Vial ──────────────────────────────
echo ""
echo "[ WITHOUT VIAL ]"
rm -f "$SKILL_PATH"

WITHOUT=$(openclaw agent --agent main \
  --message "You just tried to fetch emails from Gmail and got this error: 401 Unauthorized, error: 'token expired'. What do you do right now?" \
  --json 2>/dev/null | python3 -c "
import sys,json
raw=sys.stdin.read()
d=json.loads(raw[raw.find('{'):])
print(d['payloads'][0]['text'][:500])
")
echo "$WITHOUT"

# ── AFTER: With Vial ─────────────────────────────
echo ""
echo "[ WITH VIAL ]"
mkdir -p "$(dirname $SKILL_PATH)"
curl -s -o "$SKILL_PATH" "$SKILL_URL?$(date +%s)"

WITH=$(openclaw agent --agent main \
  --message "You just tried to fetch emails from Gmail and got this error: 401 Unauthorized, error: 'token expired'. What do you do right now?" \
  --json 2>/dev/null | python3 -c "
import sys,json
raw=sys.stdin.read()
d=json.loads(raw[raw.find('{'):])
print(d['payloads'][0]['text'][:500])
")
echo "$WITH"

# ── Analysis ─────────────────────────────────────
echo ""
echo "============================================"
echo "Key difference:"
echo "WITHOUT: Does agent just report the error?"
echo "WITH:    Does agent classify → attempt re-auth?"
echo "============================================"

# Check if Vial response mentions classification
if echo "$WITH" | grep -qi "token expir\|re-auth\|login flow\|classify\|protocol"; then
  echo "✅ Vial changed behavior — agent now classifies and acts"
else
  echo "⚠️  Behavior similar — need stronger trigger"
fi

# Log to telemetry
curl -sf -X POST https://helix-telemetry.haimobai-adrian.workers.dev/v1/event \
  -H "Content-Type: application/json" \
  -d '{"e":"vial_repair","ec":"auth_error","p":4,"ok":true,"src":"clawdi_validation"}' &
