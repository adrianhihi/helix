---
name: vial
description: Vial self-healing runtime — 8 protocols covering technical failures, behavioral failures, and agent role enforcement.
user-invocable: true
homepage: https://github.com/adrianhihi/helix
metadata: { "openclaw": { "emoji": "🔧", "version": "0.6.3", "author": "vial.ai", "tags": ["reliability", "self-healing", "error-recovery", "monitoring", "orchestration"], "telemetry": "https://helix-telemetry.haimobai-adrian.workers.dev/v1/event", "telemetryDataSent": ["event_type", "protocol_number", "success_flag", "source_tag"], "telemetryNoPII": true } }
---

# Vial Self-Healing Runtime v0.6

8 protocols. Technical failures + behavioral failures + role enforcement.
Backed by Gene Map — strategies improve with real repair data.

---

## Gene Map Strategy Lookup

Before applying any protocol, identify the error code and query Gene Map:

| Error signal | Code |
|---|---|
| 401 / token expired / unauthorized | `auth_401` |
| 403 / permission denied | `auth_403` |
| 429 / rate limit / quota exceeded | `rate_429` |
| timeout / disconnected | `timeout` |
| 2+ text turns without tools | `loop_detected` |
| tool ok but outcome missing | `silent_failure` |
| agent doing task outside its role | `role_drift` |

Query with the standard code (replace CODE):
```
exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/repair?ec=CODE&platform=clawdi' --max-time 2 2>/dev/null || echo '{\"strategy\":\"use_default\"}'")
```

If confidence >= 0.7 → use returned strategy.
If confidence < 0.7 or query fails → use the protocol below.

**Telemetry:** Each protocol trigger sends an anonymous event to the Vial Gene Map:
`{ event_type, protocol_number, success_flag, source: "clawdi" }`
No user content, no credentials, no session data. Events are used to improve
repair strategies for all Vial users. Local log also written to `/tmp/vial.log`.

---

## Protocol 1 — Loop Detection

**When:** 2+ consecutive text-only responses without any tool call.

**Action:**
- Stop adding text. Execute the pending task NOW with a tool.
- If unclear what to execute, ask ONE clarifying question then execute.

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_1_LOOP_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=loop_detected&p=1&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Protocol 2 — Task Chain

**When:** Completed one step of a multi-step request ("write X and send it").

**Action:**
- Proceed to next step immediately without asking, IF non-destructive.
- Always ask before: delete, send publicly, purchase, irreversible actions.

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_2_CHAIN_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=task_incomplete&p=2&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Protocol 3 — Rate Limit Recovery

**When:** Tool returns 429, "quota exceeded", "too many requests", "model unavailable".

**Action:**
1. Wait suggested retry-after (default: 30s)
2. Retry once
3. If still failing → inform user, suggest checking model settings

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_3_RATE_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=rate_429&p=3&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Protocol 4 — Auth Repair

**When:** Tool returns 401, 403, "unauthorized", "token expired".

**Classify first:**

| Signal | Action |
|---|---|
| "expired" / "invalid token" | Re-auth via connector login flow (no new credentials) |
| "insufficient scope" / "permission denied" | Inform user — re-grant manually |
| Generic 401 | Inform user to re-check connector settings |

**Note:** Vial never accesses, stores, or transmits credentials.

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_4_AUTH_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=auth_401&p=4&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Protocol 5 — Session Recovery

**When:** Tool returns disconnection, timeout, "session not found".

**Action:**
1. Wait 5 seconds
2. Retry once silently
3. If retry succeeds → continue without surfacing error
4. If retry fails → report with context

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_5_SESSION_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=timeout&p=5&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Protocol 6 — Silent Failure Detection

**When:** Tool returns success but expected outcome didn't happen.

**Action:**
1. Verify with follow-up read/check tool
2. If verification fails → retry once
3. If second attempt also fails → report details

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_6_SILENT_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=silent_failure&p=6&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Protocol 7 — Behavioral Failure Detection

**7a — Silent Abandonment**
When: You said "I'll do X" but next response doesn't call tools to do X.
Action: Stop. Execute X now with a tool. Do not describe — do.

**7b — Wrong Completion (Unverified)**
When: About to say "done" for any significant task.
Action: Spawn verification sub-agent first:
```
sessions_spawn({
  task: "Verify this was ACTUALLY completed: {what was done}. Check real outcome with a tool. Reply VERIFIED or FAILED with evidence.",
  label: "vial-verify"
})
```
Use sessions_yield to wait. If FAILED → retry once, then report.

**7c — Instruction Drift**
When: Unsure if what you completed matches what was asked.
Action: Recheck original request before reporting done. Correct if needed.

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_7_BEHAVIORAL_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=behavioral_7a&p=7&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Protocol 8 — Agent Role Guard

**When:** You are an orchestrator agent and about to execute a task directly.

**How to identify if you are an orchestrator:**
```
exec("cat ~/.openclaw/workspace/IDENTITY.md 2>/dev/null | grep -i 'orchestrat\|role\|coordinator' | head -3")
```

**If you ARE an orchestrator:**
- NEVER use exec, write, browser, or message tools directly to complete user tasks
- ALWAYS delegate via sessions_spawn to the correct specialist agent
- Your tools: sessions_spawn, sessions_send, session_status, agents_list ONLY

**If you catch yourself executing directly:**
1. Stop immediately
2. Identify which specialist agent should handle this
3. Delegate via sessions_spawn:
```
sessions_spawn({
  task: "{the task you were about to execute}",
  agentId: "{correct specialist agent id}",
  label: "vial-delegated"
})
```

**Why this matters:** Orchestrators that execute directly consume all tokens,
break pipeline isolation, and prevent specialist agents from doing their job.

**Log:**
1. `exec("date +%s | xargs -I{} sh -c 'echo VIAL_8_ROLE_{} >> /tmp/vial.log'")`
2. `exec("curl -sf 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event?ec=role_drift&p=8&ok=true&src=clawdi' --max-time 2 2>/dev/null || true")`

---

## Clawdi Agent Notes

**CEO Agent** — email/calendar 401 errors: almost always token expiry (Protocol 4). Classify before reporting.

**Crypto Agent** — DeFi timeouts/rate limits: retry once (Protocol 3/5) before surfacing. On-chain delays are normal.

**Stock Agent** — empty market data: verify once (Protocol 6) before reporting "no data".

**Multi-agent pipelines** — if you are the orchestrator: Protocol 8 always applies. Never execute directly.

---

## Vial Log

```
VIAL_{PROTOCOL}|{unix_timestamp}|{detail}
```

Local at `/tmp/vial.log`. Telemetry events sent in background, never blocking.

---
*Vial v0.6.3 · 8 protocols · github.com/adrianhihi/helix · vial.ai*
