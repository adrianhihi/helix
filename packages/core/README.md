# @helix-agent/core

**Self-healing infrastructure for AI agent payments.**

Every payment failure only needs to be solved once. `wrap()` makes any async function self-healing.

[![npm](https://img.shields.io/npm/v/@helix-agent/core)](https://www.npmjs.com/package/@helix-agent/core)
[![tests](https://img.shields.io/badge/tests-351%20passed-4ade80?style=flat-square)](https://github.com/adrianhihi/helix/actions)
[![recovery](https://img.shields.io/badge/recovery-90.3%25-60a5fa?style=flat-square)]()
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)]()

## Install

```bash
# One-line install
curl -sSL https://helix-cnj.pages.dev/install.sh | bash

# Or npm
npm install @helix-agent/core

# Python
pip install helix-agent-sdk

# Docker
docker run -d -p 7842:7842 adrianhihi/helix-server
```

## Quick Start

```typescript
import { wrap } from '@helix-agent/core';

const safePay = wrap(myPaymentFunction, { mode: 'auto' });
const result = await safePay({ to: '0x...', amount: 100 });
// If it fails → Helix diagnoses → repairs → retries → you get the result
```

**That's it.** One line. Your agent now self-heals.

## How It Works

```
Error → PERCEIVE → CONSTRUCT → EVALUATE → COMMIT → VERIFY → GENE MAP
                                                              ↓
Next time: Error → Gene Map hit → IMMUNE ⚡ (<1ms)
```

When your function throws, Helix:
1. **Perceives** — classifies the error (nonce? balance? rate limit?)
2. **Constructs** — generates repair candidates from all platform adapters
3. **Evaluates** — scores by cost, speed, and historical success (Q-value)
4. **Commits** — executes the winning strategy
5. **Verifies** — confirms the fix actually worked
6. **Stores Gene** — next time → instant IMMUNE fix

## Three Layers of Intelligence

| Layer | What | Speed | Cost |
|-------|------|-------|------|
| **Pattern Match + Gene Map** | 90% of known errors | <5ms | $0 |
| **LLM Fallback** (Claude/GPT) | 10% unknown errors | ~1-6s | $0.001 |
| **Gene Telemetry** | Network learns, coverage grows | Background | $0 |

LLM is optional. Works without it. Enable with:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

When LLM classifies an unknown error, the result is cached in Gene Map. Next time → IMMUNE, no LLM, $0.

## Three Safety Modes

```typescript
wrap(fn, { mode: 'observe' })  // Diagnose only. Zero risk. Default.
wrap(fn, { mode: 'auto' })     // Retry + param fix. No fund movement.
wrap(fn, { mode: 'full' })     // All repairs including chain writes.
```

## Platform Coverage

| Platform | Patterns | Examples |
|----------|:--------:|---------|
| **Coinbase CDP** | 17 | CDP API, ERC-4337, Paymaster, x402, Policy |
| **Tempo/MPP** | 13 | nonce, session, DEX, compliance, cascade |
| **Privy** | 7 | policy, gas sponsor, cross-chain, signing |
| **Generic HTTP** | 3 | 429, 500, timeout |

**31+ scenarios. 26 strategies. 4 platforms. 351+ tests.**

## Python SDK

Coinbase AgentKit, LangChain, CrewAI are Python. We have a native SDK:

```bash
# Option A: Docker (no Node.js needed)
docker run -d -p 7842:7842 adrianhihi/helix-server
pip install helix-agent-sdk

# Option B: Node.js
npx helix serve --port 7842
pip install helix-agent-sdk
```

```python
from helix_agent import HelixClient, helix_wrap, helix_guard

# Method 1: Explicit client
client = HelixClient(platform="coinbase")
result = client.repair("AA25 invalid account nonce")

# Method 2: Decorator (auto-retry on failure)
@helix_wrap(platform="coinbase", max_retries=3)
def send_payment(to, amount):
    return agent.transfer(to, amount)

# Method 3: Context manager
with helix_guard("tempo") as guard:
    repair = guard.repair("nonce too low")
```

PyPI: https://pypi.org/project/helix-agent-sdk/

## Docker

```bash
docker run -d -p 7842:7842 adrianhihi/helix-server
```

Or with docker-compose:
```bash
docker-compose up -d
```

## REST API

```bash
npx helix serve --port 7842 --mode observe
```

```bash
curl -X POST http://localhost:7842/repair \
  -H 'Content-Type: application/json' \
  -d '{"error":"AA25 invalid account nonce","platform":"coinbase"}'
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /repair | Diagnose + get repair strategy |
| GET | /health | Server health + schema version |
| GET | /genes | List all genes |
| GET | /status | Full server stats |
| POST | /dream | Trigger Gene Dream cycle |
| GET | /dream/status | Dream readiness + last stats |
| GET | /schema | Migration status |
| POST | /api/telemetry | Report anonymous discoveries |

## Gene Telemetry

Every LLM discovery is optionally reported (anonymized) to improve seed genes for all users:

```typescript
wrap(fn, {
  mode: 'auto',
  llm: { provider: 'anthropic', enabled: true },
  telemetry: { enabled: true },
});
```

Opt-in only. No addresses, keys, or amounts sent. Default: disabled.

## Gene Dream

Background memory consolidation — inspired by human REM sleep and Claude Code's Auto Dream.

When your agent is idle, Gene Dream automatically:
1. **Clusters** similar genes by error similarity
2. **Prunes** failed strategies (Q < 0.15, 3+ consecutive failures)
3. **Consolidates** duplicate genes into stronger meta-genes
4. **Enriches** context (cross-platform coverage)
5. **Reindexes** for faster lookups

```bash
npx helix dream                                    # Manual trigger
curl -X POST http://localhost:7842/dream -d '{"force":true}'  # Via API
```

Idle Scheduler: auto-triggers after 5min inactivity (light) or 30min (full dream).

## Data Versioning

Gene Map schema evolves across versions. Helix auto-migrates on startup:

```
v1 → Base schema (genes table + Q-value RL)
v2 → Gene Dream (gene_meta table + dream state)
v3 → Gene Telemetry (gene_discoveries table)
```

```bash
curl http://localhost:7842/schema     # Check migration status
npx helix migrate                    # Manual migrate
```

On major version jumps, old Q-values decay by 10% — strategies that worked on v1 may not be optimal on v3.

## Key Features

- **Gene Map** — SQLite database of proven repairs. Bayesian Q ± σ scoring. Seed genes for day-1 immunity
- **Cross-Platform Immunity** — Fix learned on Tempo auto-heals same error on Coinbase
- **Adaptive Learning Rate** — New genes learn fast, old genes stay stable
- **Strategy Chains** — Multi-step repairs [refresh_nonce → speed_up_transaction]
- **Predictive Failure Graph** — Predicts next error, preloads Gene into cache
- **Context-Aware Lookup** — Q-value adjusted by gas price, time, chain ID
- **Error Embedding** — 28 known signatures, fuzzy matching when exact match fails
- **A/B Testing** — Controlled strategy experiments, 90/10 traffic split
- **Gene Registry** — Push/pull shared knowledge across instances
- **OpenTelemetry** — Optional tracing spans + metrics
- **Audit Log** — Every repair recorded, exportable for compliance
- **Business Verify** — Custom verification callbacks
- **Failure Learning** — Auto-distills defensive genes after repeated failures
- **Multi-Dimensional Scoring** — 6-dimension Q-value (accuracy, cost, latency, safety, transferability, reliability)
- **Gene Dream** — Background memory consolidation (cluster, prune, consolidate, enrich, reindex)
- **Data Versioning** — Schema migrations with Q-value decay on major upgrades

## API

```typescript
import { wrap, createEngine, simulate } from '@helix-agent/core';

// wrap() — main API
const safeFn = wrap(fn, {
  mode: 'auto',
  agentId: 'my-agent',
  maxRepairCostUsd: 1.00,
  verify: (result, args) => result.amount === args[0].amount,
  otel: { tracer, meter },
  onRepair: (result) => console.log(result.winner?.strategy),
});

// createEngine() — advanced
const engine = createEngine({ mode: 'observe' });
const result = await engine.repair(new Error('nonce mismatch'));

// simulate() — CI testing
const diagnosis = simulate({ error: 'AA25 invalid account nonce' });
```

## CLI

```bash
npx helix serve --port 7842 --mode observe  # REST API server
npx helix status                             # Gene Map health
npx helix simulate "AA25 invalid nonce"      # Dry-run diagnosis
npx helix audit                              # Repair audit log
npx helix gc                                 # Garbage collection
npx helix stats my-agent                     # Agent attribution
npx helix dream                              # Gene Dream consolidation
npx helix migrate                            # Schema migration check
npx helix scan ./src                         # Scan for payment patterns
```

## Scan Your Codebase

```bash
# Find payment error patterns in your code
npx helix scan ./src

# JSON output
npx helix scan ./src --json

# GitHub Actions annotation format
npx helix scan ./src --format github
```

## CI/CD Integration

```yaml
# .github/workflows/helix-scan.yml
name: Helix Payment Safety
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g @helix-agent/core
      - run: npx helix scan ./ --format github
        continue-on-error: true
```

## Documentation

- [GitHub](https://github.com/adrianhihi/helix) — Source, examples, dashboard
- [User Runbook](https://github.com/adrianhihi/helix/blob/main/docs/RUNBOOK.md) — Install to production
- [Benchmark](https://github.com/adrianhihi/helix/blob/main/docs/benchmark.md) — 90.3% recovery rate
- [CONTRIBUTING](https://github.com/adrianhihi/helix/blob/main/CONTRIBUTING.md) — How to contribute

## License

MIT
