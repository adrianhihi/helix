<div align="center">

# Helix

**Self-healing infrastructure for AI agent payments**

Every payment failure on the internet should only need to be solved once.

[![CI](https://github.com/adrianhihi/helix/actions/workflows/ci.yml/badge.svg)](https://github.com/adrianhihi/helix/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@helix-agent/core)](https://www.npmjs.com/package/@helix-agent/core)
[![tests](https://img.shields.io/badge/tests-288%20passing-brightgreen)]()
[![license](https://img.shields.io/npm/l/@helix-agent/core)](LICENSE)

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [API](#api) · [Dashboard](#dashboard) · [MCP Server](#mcp-server)

</div>

---

## The Problem

AI agents fail at payments. A lot.

```
Agent tries to pay → nonce mismatch → retry → wrong chain → retry → gas too low → give up
```

Every agent team builds the same retry logic. The same error handling. The same on-call rotations. **None of them learn from each other.**

## The Solution

Helix wraps your agent with a self-healing immune system. When a payment fails, Helix diagnoses the error, selects a repair strategy, executes it, verifies the fix, and stores the solution in a **Gene Map** — so the same failure never costs you twice.

```
Error → PERCEIVE → CONSTRUCT → EVALUATE → COMMIT → VERIFY → GENE MAP
                                                              ↓
Next time: Error → Gene Map hit → IMMUNE ⚡ (<100ms, $0)
```

**Retry is a hammer. PCEC is a surgeon.**

## Quick Start

```bash
npm install @helix-agent/core
```

```typescript
import { wrap } from '@helix-agent/core';

const safePay = wrap(myPaymentFunction, {
  mode: 'observe',        // diagnose only (default) — zero risk
  agentId: 'my-agent',
  maxRepairCostUsd: 0.50, // cost ceiling for auto-repairs
});

const result = await safePay({ to: '0x...', amount: '1.0' });
```

**That's it.** One import, one wrap. Your agent now self-heals.

## How It Works

### PCEC Engine

| Stage | What happens | Time |
|-------|-------------|------|
| **Perceive** | Classify error → code + category + severity + root cause | <1ms |
| **Construct** | Generate candidate repair strategies, ranked by Q-value | <1ms |
| **Evaluate** | Score candidates: cost, speed, safety, Gene Map history | <1ms |
| **Commit** | Execute the winning strategy (if mode allows) | varies |
| **Verify** | Validate the repair actually worked (SAGE paper) | <1ms |
| **Gene** | Store successful fix in Gene Map for future immunity | <1ms |
| **Predict** | Predict next likely failure, preload Gene into cache | <1ms |

### Gene Map — Collective Immunity

The Gene Map is a local database of proven repair strategies:

- **Q-value scoring** (MemRL paper) — reinforcement learning ranks strategies
- **Seed Genes** — new users get 12 pre-loaded immunities from day 1
- **Gene Combine** (ELL paper) — duplicate genes merge into stronger ones
- **Root cause hints** (MAST paper) — systematic failures get flagged
- **Failure attribution** — track which agent, which step, which workflow
- **Gene links** (A-Mem paper) — co-occurring failures are linked
- **Adaptive α** — new Genes learn fast, old Genes stay stable
- **Bayesian Q ± σ** — tracks uncertainty, Thompson Sampling for exploration
- **Context-aware lookup** — adjusts Q-value based on gas price, time, chain ID
- **Predictive Failure Graph** — predicts next error, preloads Gene
- **Strategy Chains** — multi-step repairs [refresh_nonce → speed_up_transaction]

### Three Safety Modes

| Mode | Execution | Use case |
|------|-----------|----------|
| `observe` | Diagnose only, zero execution | Default, CI testing |
| `auto` | Execute Category A+B (no fund movement) | Production read-only |
| `full` | Execute Category C (fund movement) | Production with cost ceiling |

## Platform Coverage

| Platform | Scenarios | Examples |
|----------|-----------|---------|
| **Tempo/MPP** | 13 | balance, nonce, session, DEX, compliance, cascade |
| **Privy** | 7 | policy, gas sponsor, cross-chain, broadcast |
| **Coinbase** | 8+ | CDP API, Paymaster/ERC-4337, x402 |
| **Generic HTTP** | 3 | 429, 500, timeout |
| **Any** | ∞ | `wrap()` works on any async function |

**31 scenarios. 26 real strategies. 5 platforms. 288 tests across 32 files.**

## API

### `wrap(fn, options)`

```typescript
const safeFn = wrap(myFunction, {
  mode: 'observe' | 'auto' | 'full',
  agentId: 'my-agent',
  maxRepairCostUsd: 0.50,
  blockStrategies: ['self_pay_gas'],
  onRepair: (result) => console.log(result),
  onSystematic: (alert) => pagerduty.trigger(alert),
  verify: (result, args) => result.amount === args[0].amount,
  otel: { tracer, meter },
  registry: { url: 'https://registry.helix-agent.dev' },
});
```

### `simulate(options)` — Test without executing

```typescript
import { simulate } from '@helix-agent/core';

const result = simulate({ error: 'AA25 Invalid account nonce' });
console.log(result.recommended.strategy); // 'refresh_nonce'
console.log(result.immune);               // true (seed gene)
console.log(result.rootCauseHint);         // 'concurrent_wallet_access'
```

### Engine API

```typescript
import { createEngine } from '@helix-agent/core';

const engine = createEngine({ mode: 'observe', agentId: 'bot-1' });
const result = await engine.repair(error, context);

engine.getGeneMap().gc();                    // combine + prune
engine.getGeneMap().getAgentStats('bot-1');  // failure attribution
engine.getGeneMap().getRelatedFailures('verification-failed', 'signature');
```

## CLI

```bash
npx helix status                              # Gene Map health
npx helix simulate "AA25 Invalid account nonce" # dry-run diagnosis
npx helix gc                                   # garbage collection
npx helix stats bot-1                          # agent attribution
npx helix audit                                # repair audit log
npx helix audit --json                         # export for SIEM
```

## Dashboard

```bash
npm run dash  # → http://localhost:7842
```

## MCP Server

```bash
npx @helix-agent/mcp
```

Tools: `helix_diagnose` · `helix_repair` · `helix_gene_status` · `helix_check_immunity`

## MPP API

Live at `https://helix-production-e110.up.railway.app`

```bash
curl -X POST .../v1/diagnose \
  -H "Content-Type: application/json" \
  -d '{"error": "AA25 Invalid account nonce"}'
```

Listed on [mppscan.com](https://mppscan.com).

## Research Foundations

| Paper | Implementation |
|-------|----------------|
| MemRL (2026) | Gene Map Q-value scoring |
| SAGE (2025) | PCEC Verify stage |
| ELL (2025) | Gene Combine |
| MAST (2025) | Root cause hints |
| ReasoningBank | Gene reasoning fields |
| A-Mem | Gene relationship links |
| Who&When | Failure attribution |

## What's New in v1.5

- **Error Embedding** — 28 known error signatures, fuzzy matching when exact match fails
- **Strategy A/B Testing** — controlled experiments, 90/10 traffic split, auto-evaluation
- **Gene Registry** — push/pull shared repair knowledge across instances
- **OpenTelemetry** — optional tracing spans + metrics for Datadog/Grafana
- **Audit Log** — every repair recorded, exportable for compliance

## Technology Roadmap

### Causal Repair Graph
Moving beyond statistical correlation to causal inference. When PCEC repairs a nonce error, the Causal Graph traces the root cause: concurrent wallet access → shared nonce pool → nonce conflict. This enables preventive repairs — fixing the cause before the symptom appears.
- Status: Architecture designed, Predictive Failure Graph (statistical) shipped in v1.5

### Federated Gene Learning
Upgrading Gene Registry from simple push/pull to federated reinforcement learning. Each agent trains Q-values locally and shares only gradient updates — never raw error data. The Registry aggregates gradients using differential privacy, producing a global model that improves every agent without exposing anyone's data.
- Status: Gene Registry (v1.5) provides the foundation. Federated layer in development.

### Formal Safety Verification
Every repair strategy is verified against safety constraints before execution using SMT-based constraint checking: balance ≥ minimum, gas ≤ ceiling, recipient ∈ whitelist. If verification fails, the strategy is blocked and PCEC falls back to observe mode. Aerospace-grade safety for agent payments.
- Status: Three-tier safety model (observe/auto/full) shipped. Formal verification layer in development.

### Meta-Learning Repair
Few-shot repair learning: after seeing 3 nonce errors repaired, the system learns the "nonce error repair pattern" and can fix the 4th variant with a single example. Built on top of Context-Aware Gene Map's cross-platform transfer mechanism.
- Status: Context-aware lookup and cross-platform transfer shipped in v1.5. Meta-learning layer in development.

### Adversarial Robustness
Four-layer defense against Gene Registry poisoning: reputation scoring, multi-agent verification (3 independent agents must validate), anomaly detection on Q-value trajectories, and automatic rollback to last known safe state.
- Status: Push threshold + pull discount + natural selection shipped in v1.5. Full adversarial defense in development.

## Gene Map Architecture Evolution

```
v1.0  Gene Map         — Local SQLite, fixed α, string matching
v1.2  + LLM Fallback   — Claude/GPT classify unknown errors
v1.3  + Adaptive RL     — Bayesian Q ± σ, Thompson Sampling, strategy chains
v1.4  + Otel + Audit    — OpenTelemetry spans, repair audit log
v1.5  + Registry + AI   — Gene Registry, error embedding, A/B testing
next  + Causal + Federated — Causal repair graphs, federated learning
```

## Docs

📖 [User Runbook](docs/RUNBOOK.md) — Complete guide from installation to production

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

---

<div align="center">

**We're not competing with LLMs. We're caching their intelligence.**

[npm](https://www.npmjs.com/package/@helix-agent/core) · [GitHub](https://github.com/adrianhihi/helix) · [API](https://helix-production-e110.up.railway.app/health) · [mppscan](https://mppscan.com)

</div>
