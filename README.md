<div align="center">

# Helix

**Self-healing infrastructure for AI agent payments**

[![npm](https://img.shields.io/npm/v/@helix-agent/core?style=flat-square&color=f0a030)](https://www.npmjs.com/package/@helix-agent/core)
[![tests](https://img.shields.io/badge/tests-335%20passed-4ade80?style=flat-square)](https://github.com/adrianhihi/helix/actions)
[![recovery](https://img.shields.io/badge/recovery-90.3%25-60a5fa?style=flat-square)]()
[![platforms](https://img.shields.io/badge/platforms-Tempo%20%7C%20Coinbase%20%7C%20Privy-a78bfa?style=flat-square)]()
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

Your agent's payment fails. Helix diagnoses, repairs, and learns — automatically.
Not a retry wrapper. A wrapper with a brain.

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Benchmarks](#benchmarks) · [REST API](#rest-api) · [Demo](#demo)

</div>

---

## Demo

![Helix Demo](assets/demo.gif)

*Session expiry, nonce mismatch, gas errors — all diagnosed and repaired in <1ms.*

## Quick Start

```bash
npm install @helix-agent/core
```

```typescript
import { wrap } from '@helix-agent/core';

// Before: hope for the best
await agent.pay(invoice);

// After: self-healing
await wrap(agent.pay)(invoice);
```

That's it. One line. Helix handles the rest.

## How It Works

Helix uses **PCEC** (Perceive → Construct → Evaluate → Commit) — a biologically-inspired self-repair loop:

```
Error occurs
    ↓
⚡ Perceive  — 4-layer classification (adapter → embedding → LLM → unknown)
    ↓
🧬 Construct — Generate repair candidates from Gene Map
    ↓
📊 Evaluate  — Bayesian Q-value + Thompson Sampling
    ↓
✅ Commit    — Execute → verify → learn → Gene Map update
    ↓
Second time same error → IMMUNE in <1ms
```

The **Gene Map** remembers every repair. Agent A's failure becomes Agent B's immunity.

### Three Layers of Intelligence

| Layer | What | Speed | Cost |
|-------|------|-------|------|
| Pattern Match + Gene Map | 90% of errors | <5ms | $0 |
| LLM Fallback (Claude/GPT) | 10% unknown errors | ~1-6s | $0.001 |
| Gene Telemetry | Network learns, coverage grows | Background | $0 |

## Benchmarks

| Approach | Recovery Rate | Notes |
|----------|:------------:|-------|
| Naive Retry | 22.6% | Same retry for all errors |
| Error-Specific | 67.7% | Manual error handling |
| **Helix PCEC** | **90.3%** | Auto-diagnosis + strategy selection |

Tested on 31 payment failure scenarios across Tempo, Coinbase, and Privy. [Full benchmark →](docs/benchmark.md)

## Platform Coverage

| Platform | Patterns | Coverage | Strategies |
|----------|:--------:|:--------:|:----------:|
| **Coinbase CDP** | 25+ | ERC-4337, Paymaster, x402, Policy | 8 unique |
| **Tempo MPP** | 13 | Session, nonce, gas, RPC | 6 unique |
| **Privy** | 7 | Embedded wallet, signing, gas sponsor | 5 unique |
| **Stripe** | 5 | Payment intents, webhooks | 4 unique |
| **Generic** | 10 | HTTP, timeout, rate limit | 4 unique |

## REST API

Helix runs as a sidecar. Any language can use it:

```bash
# Start server
npx helix serve --port 7842 --mode observe

# Send error for diagnosis
curl -X POST http://localhost:7842/repair \
  -H "Content-Type: application/json" \
  -d '{"error":"nonce mismatch: expected 0, got 50","platform":"tempo"}'
```

```json
{
  "success": true,
  "failure": { "code": "verification-failed", "category": "signature", "severity": "high" },
  "strategy": { "name": "refresh_nonce", "action": "refresh_state" },
  "repairMs": 1,
  "immune": true
}
```

Python, Go, Rust — anything that speaks HTTP.

## Docker

```bash
docker run -d -p 7842:7842 adrianhihi/helix-server
```

Or with docker-compose:
```bash
docker-compose up -d
```

## v1.7 — Failure Learning + Multi-D Scoring

**Failure Learning**: When the same (error, strategy) pair fails 5 times, Helix auto-distills a defensive Gene that blocks the failing strategy in that condition.

**6-Dimension Scoring**: Q-value expanded from 1D to 6D — accuracy, cost efficiency, latency, safety, transferability, reliability.

## Demo Scripts

```bash
python3 examples/demos/run.py general   # All platforms
python3 examples/demos/run.py privy     # Privy-specific
python3 examples/demos/run.py coinbase  # Coinbase CDP (17 patterns)
python3 examples/demos/run.py mpp       # MPP/Tempo
python3 examples/demos/run.py v17       # v1.7 features
```

## Architecture

```
┌─────────────────────────────────────────┐
│              User Objective              │
└───────────────┬─────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│     PCEC Engine (Perceive → Commit)     │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐  │
│  │Perceive │→│Construct │→│Evaluate │  │
│  │4-layer  │ │Gene Map  │ │Bayesian │  │
│  │classify │ │candidates│ │Q-value  │  │
│  └─────────┘ └──────────┘ └────┬────┘  │
│                                ↓        │
│                          ┌─────────┐    │
│                          │ Commit  │    │
│                          │execute  │    │
│                          │+verify  │    │
│                          │+learn   │    │
│                          └─────────┘    │
└───────────────┬─────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│            Gene Map (SQLite)            │
│  Bayesian Q-values × 6 dimensions      │
│  Failure learning + defensive genes     │
│  Cross-platform gene transfer           │
└─────────────────────────────────────────┘
```

## Python SDK

```bash
# Start Helix server
docker run -d -p 7842:7842 adrianhihi/helix-server

# Install Python SDK
pip install helix-agent-sdk
```

```python
from helix_agent import HelixClient

client = HelixClient(platform="coinbase")
result = client.repair("AA25 invalid account nonce")
print(f"Strategy: {result.strategy}, Immune: {result.immune}")
```

Also available: `@helix_wrap` decorator and `helix_guard` context manager. See [python/README.md](python/README.md).

## Vision

Helix is a **vertical agent for payment reliability** — a "wrapper with a brain" that deeply integrates into agent payment workflows.

1. **Agentic Workflow**: PCEC is a multi-agent repair pipeline — four specialized agents collaborate on each repair with configurable human-in-the-loop via three safety modes.

2. **Proprietary Data Moat**: Gene Map is Helix's core data asset. Every repair generates a data point that doesn't exist on the internet or in any LLM's training set. More agents = more data = better repairs = more agents.

3. **Progressive Automation**: Day 1, LLM handles 100% of novel diagnoses ($0.001/repair). Day 30, Gene Map handles 90% ($0/repair). Day 180, Gene Map handles 99%. Cost decreases with usage, not increases.

## Roadmap

- [x] PCEC engine + Gene Map core
- [x] 5 platform adapters (Tempo, Coinbase, Privy, Stripe, Generic)
- [x] REST API for cross-language integration
- [x] Failure learning + multi-dimensional scoring
- [x] Error Embedding (28 signatures, fuzzy matching)
- [x] Strategy A/B Testing (90/10 traffic split)
- [x] Gene Registry (push/pull shared knowledge)
- [x] OpenTelemetry + Audit Log
- [x] Gene Dream (background memory consolidation)
- [ ] Self-Play (autonomous evolution)
- [ ] Federated Gene Learning
- [ ] Formal Safety Verification

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

## CLI

```bash
npx helix status                              # Gene Map health
npx helix simulate "AA25 Invalid account nonce" # dry-run diagnosis
npx helix serve --port 7842 --mode observe    # REST API server
npx helix audit                                # repair audit log
npx helix gc                                   # garbage collection
npx helix stats bot-1                          # agent attribution
```

## MCP Server

```bash
npx @helix-agent/mcp
```

Tools: `helix_diagnose` · `helix_repair` · `helix_gene_status` · `helix_check_immunity`

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

---

<div align="center">

**Built by [Helix](https://github.com/adrianhihi)** · npm install @helix-agent/core

</div>
