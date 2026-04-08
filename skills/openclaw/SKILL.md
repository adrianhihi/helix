---
name: vial
description: Vial self-healing runtime — loop detection, auth repair, and rate limit recovery for AI agents.
user-invocable: true
homepage: https://github.com/adrianhihi/helix
metadata: { "openclaw": { "emoji": "🔧", "version": "0.3.0", "author": "vial.ai", "tags": ["reliability", "self-healing", "error-recovery", "monitoring"], "telemetry": "https://helix-telemetry.haimobai-adrian.workers.dev/v1/event", "telemetryDataSent": ["event_type", "protocol_number", "success_flag", "source_tag"], "telemetryNoPII": true } }
---

# Vial Self-Healing Runtime v0.3

Active on this agent. Vial helps recover from common failures automatically.

## How Vial chooses a repair strategy

Before applying any protocol, Vial queries the Gene Map for the optimal
strategy based on real repair data from the Vial network:

```
exec("result=$(curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/repair?ec={error_code}&platform=clawdi' --max-time 2 2>/dev/null) && echo $result || echo '{\"strategy\":\"use_default\"}'")
```

If the Gene Map returns a strategy with confidence > 0.7, use it.
Otherwise fall back to the protocols below.

The Gene Map learns from every repair across all Vial users — the more
agents use Vial, the more accurate the strategies become.

**Privacy note:** Vial logs repair events locally to `/tmp/vial.log`. 
Optionally sends anonymous telemetry (event type + outcome only, no user data) 
to `helix-telemetry.haimobai-adrian.workers.dev`. No credentials, messages, 
or personal data are ever transmitted.

---

## Protocol 1 — Loop Detection

**When:** You have given 2+ consecutive text-only responses without calling any tool.

**Recommended action:**
- Stop adding more text explanation
- Execute the pending task using the appropriate tool (exec, browser, message, etc.)
- If uncertain what to execute, ask the user to clarify before proceeding

**Optional local log:**
```
exec("echo 'VIAL_1_LOOP|$(date +%s)|loop_detected' >> /tmp/vial.log 2>/dev/null || true")
```

---

## Protocol 2 — Task Chain

**When:** You completed one step of a clearly multi-step request (e.g. "write X and send it").

**Recommended action:**
- Proceed to the next step without asking for confirmation IF the next step is non-destructive
- Always ask before: deleting files, sending emails/messages publicly, making purchases, or any irreversible action

**Optional local log:**
```
exec("echo 'VIAL_2_CHAIN|$(date +%s)|proceeded' >> /tmp/vial.log 2>/dev/null || true")
```

---

## Protocol 3 — Rate Limit Recovery

**When:** Any tool returns 429, "quota exceeded", "too many requests", or "model unavailable".

**Recommended action:**
1. Wait the suggested retry-after period (default: 30s)
2. Retry the same request once
3. If still failing, inform the user and suggest checking model settings

**Optional local log:**
```
exec("echo 'VIAL_3_RATE|$(date +%s)|retry' >> /tmp/vial.log 2>/dev/null || true")
```

---

## Protocol 4 — Auth Repair

**When:** Any tool returns 401, 403, "unauthorized", or "token expired".

**Classify the error first:**

| Signal | Action |
|--------|--------|
| "expired" / "invalid token" | Trigger re-auth using OpenClaw's existing connector login flow (no new credentials requested) |
| "insufficient scope" / "permission denied" | Inform user — they need to re-grant scope manually |
| Generic 401 | Inform user to re-check connector settings in Clawdi dashboard |

**Note:** Re-auth only uses OpenClaw's built-in connector flows. Vial does not 
access, store, or transmit any credentials.

**Optional local log:**
```
exec("echo 'VIAL_4_AUTH|$(date +%s)|classified' >> /tmp/vial.log 2>/dev/null || true")
```

---

## Protocol 5 — Session Recovery

**When:** Tool returns unexpected disconnection, timeout, or "session not found".

**Recommended action:**
1. Wait 5 seconds
2. Retry the operation once
3. If retry succeeds, continue without surfacing the error to the user
4. If retry fails, report the specific error with context

**Optional local log:**
```
exec("echo 'VIAL_5_SESSION|$(date +%s)|retry' >> /tmp/vial.log 2>/dev/null || true")
```

---

## Protocol 6 — Silent Failure Detection

**When:** A tool returns success but the expected outcome did not occur (file not created, message not sent, etc.).

**Recommended action:**
1. Verify the outcome with a follow-up read or check
2. If verification fails, retry the original operation once
3. If second attempt also fails silently, surface the issue to the user with details

**Optional local log:**
```
exec("echo 'VIAL_6_SILENT|$(date +%s)|verified' >> /tmp/vial.log 2>/dev/null || true")
```

---

## Clawdi Agent Notes

**CEO Agent** — email/calendar 401 errors are almost always token expiry (Protocol 4). Classify before reporting to user.

**Crypto Agent** — DeFi tool timeouts and rate limits: retry once (Protocol 3/5) before surfacing to user. On-chain delays are normal.

**Stock Agent** — if market data returns empty, verify once (Protocol 6) before reporting "no data available".

---

## Local Log

Repair events are optionally written to `/tmp/vial.log`:
```
VIAL_{PROTOCOL}|{unix_timestamp}|{detail}
```

This file stays on the local machine. It is never read or transmitted by Vial 
unless you explicitly share it. Telemetry (if enabled) sends only the event 
type and outcome — never log contents or user data.

---
*Vial self-healing runtime v0.3 · github.com/adrianhihi/helix · vial.ai*
