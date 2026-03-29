# Vial

[![npm](https://img.shields.io/npm/v/@vial/core?color=cb3837)](https://www.npmjs.com/package/@vial/core)
[![license](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![tests](https://img.shields.io/badge/tests-541%2B-brightgreen)](#)

**Self-evolving repair framework for autonomous agents.**

Your agent failed. Vial diagnosed it, fixed it, and remembered. Next time — instant fix, zero cost. Domain-agnostic: payments, APIs, CI/CD, or anything else.

```typescript
import { wrap } from '@vial/core';

const safeCall = wrap(myFunction, { mode: 'auto' });
await safeCall(args);
// Failed? Vial handles it. You never knew.
```

---

## How It Works

```
Error → Perceive → Construct → Evaluate → Commit → Verify → Gene
           │           │           │          │         │       │
      What broke?   Find fixes   Score them  Execute  Worked?  Remember
```

Every fix is stored in the **Gene Map** — a knowledge base scored by reinforcement learning. Fixes compound across agents and over time.

## Quick Start

```bash
npm install @vial/core
```

**Option A: Use a built-in adapter**

```typescript
import { wrap } from '@vial/core';
import { apiAdapter } from '@vial/adapter-api';

const safeFetch = wrap(myApiCall, { adapter: apiAdapter, mode: 'auto' });
await safeFetch('https://api.example.com/data');
// 429? backoff + retry. 500? retry. ETIMEDOUT? backoff + retry.
```

**Option B: Build your own adapter**

```typescript
import { wrap } from '@vial/core';
import type { PlatformAdapter } from '@vial/core';

const myAdapter: PlatformAdapter = {
  name: 'my-service',
  perceive(error) {
    const msg = typeof error === 'string' ? error : error.message;
    if (msg.includes('rate limit'))
      return { code: 'rate-limited', category: 'throttle', strategy: 'backoff_retry' };
    if (msg.includes('timeout'))
      return { code: 'timeout', category: 'network', strategy: 'retry' };
    return null;
  },
  getPatterns() {
    return [
      { pattern: /rate limit/i, code: 'rate-limited', category: 'throttle', strategy: 'backoff_retry' },
      { pattern: /timeout/i, code: 'timeout', category: 'network', strategy: 'retry' },
    ];
  },
};

const safeCall = wrap(myFunction, { adapter: myAdapter, mode: 'auto' });
```

## What's Inside

**Core Engine**
- **PCEC Pipeline** — 6-stage repair loop: Perceive → Construct → Evaluate → Commit → Verify → Gene
- **Gene Map** — SQLite-backed knowledge base with Q-value reinforcement learning
- **wrap()** — One-line integration, automatic error interception and retry
- **Self-Refine** — Failed strategy? Reflect, exclude it, try the next best option

**Learning**
- **Meta-Learning** — 3 similar fixes → learns pattern → 4th variant is instant
- **Adaptive Weights** — Auto-tunes scoring dimensions per error category
- **Causal Graph** — Predicts which errors follow which
- **Negative Knowledge** — Remembers what didn't work, avoids repeating mistakes
- **Prompt Optimizer** — LLM classification accuracy improves automatically over time
- **Gene Dream** — Memory consolidation during idle time

**Safety**
- **7 Pre-execution Constraints** — Never modifies recipient, calldata, or dangerous params
- **4-layer Adversarial Defense** — Reputation, verification, anomaly detection, auto-rollback
- **Cost Ceilings** — Configurable limits on repair cost

**Evolution**
- **Self-Play** — Autonomous error discovery via challenger/repair/verifier loop
- **Federated Learning** — Privacy-preserving distributed learning across agents
- **Auto Strategy Generation** — LLM creates new repair methods from failure analysis
- **Auto Adapter Discovery** — Detects when new domains need support

## Three Modes

| Mode | Behavior | Risk |
|------|----------|------|
| `observe` | Diagnose only, never execute | Zero |
| `auto` | Diagnose + fix params + retry | Low |
| `full` | Auto + aggressive strategies | Medium |

## Built With Vial

| Product | Domain | Patterns |
|---------|--------|----------|
| [Helix](https://github.com/adrianhihi/helix) | AI agent payments | 40+ (Coinbase, Tempo, Privy) |
| [@vial/adapter-api](https://github.com/adrianhihi/helix/tree/main/packages/adapter-api) | HTTP/API calls | 21 (429, 500, timeout, auth) |
| *Your adapter* | Any domain | Implement `PlatformAdapter` |

## Research

Vial implements ideas from:

| Paper | Module |
|-------|--------|
| [Reflexion](https://arxiv.org/abs/2303.11366) | Negative Knowledge |
| [ExpeL](https://arxiv.org/abs/2308.10144) | Conditional Genes |
| [Voyager](https://arxiv.org/abs/2305.16291) | Auto Strategy Generation |
| [Self-Refine](https://arxiv.org/abs/2303.17651) | Self-Refine loop |
| [DSPy](https://arxiv.org/abs/2310.03714) | Prompt Optimizer |
| [Mem0](https://arxiv.org/abs/2504.19413) | Gene Dream |

## Contributing

The best way to contribute is to write a `PlatformAdapter` for a domain you care about. See the [API adapter](https://github.com/adrianhihi/helix/tree/main/packages/adapter-api) for a complete example.

## License

MIT
