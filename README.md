# 🧬 Helix

**Self-healing infrastructure for AI agent payments.**

Two lines to integrate. Any platform. Every failure fixed once, remembered forever.

[![npm](https://img.shields.io/npm/v/@helix-agent/core)](https://www.npmjs.com/package/@helix-agent/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

<!-- GIF of `npm run demo` terminal output goes here -->
<!-- <p align="center"><img src="docs/demo.gif" width="720" /></p> -->

## The Problem

AI agents make payments. Payments fail. Every agent handles this differently — or doesn't handle it at all.

- **Insufficient balance** → agent crashes, user loses money
- **Wrong network** → transaction reverts, gas wasted
- **Nonce desync** → transactions stuck in mempool for hours
- **Compliance block** → agent retries forever, never succeeds

Today, every agent team writes their own retry logic. Tomorrow, they all use Helix.

## Quick Start

```bash
npm install @helix-agent/core
```

```typescript
import { wrap } from '@helix-agent/core';

// Wrap any async function — payments, signing, API calls
const resilientPay = wrap(fetch);

// Same input, same output. Failures become self-healing.
const result = await resilientPay('https://api.service.com/pay', { ... });
```

That's it. Two lines. When `fetch` fails:
1. **Perceive** — classify the error (balance? nonce? compliance?)
2. **Construct** — generate repair candidates from all platform adapters
3. **Evaluate** — score candidates on cost, speed, requirements, historical success
4. **Commit** — execute the winning repair, retry the original call
5. **Gene** — store the fix. Next time → instant immune fix in <100ms.

## Supported Platforms

| Platform | Scenarios | What Helix Handles |
|----------|-----------|-------------------|
| **Tempo / MPP** | 13 | Balance, session, currency, nonce, batch, service, DEX, compliance, cascade, off-ramp, token pause, sponsor, network |
| **Privy** | 4 unique | Policy spending limits, nonce desync, gas sponsor, cross-chain |
| **Generic HTTP** | 3 | Rate limit (429), server error (500), timeout |
| **Stripe** | 🔜 | Card declined, expired card, rate limit |

## Cross-Platform Immunity

This is what makes Helix different from a retry library.

```
Tempo agent hits nonce error     → PCEC repairs it → Gene stored ✅
                                   (code: verification-failed, category: signature)

...later...

Privy agent hits nonce desync    → Gene Map lookup → IMMUNE ⚡
                                   Same (code, category) → instant fix!

Same failure category. Same fix. Different platform.
Every fix makes every platform stronger.
```

The Gene Map stores by `(code, category)` — **not** by platform. A fix learned from Tempo automatically protects Privy, Stripe, and any future platform with the same failure class.

Run `npm run demo` to see this live — Privy scenarios 15-17 resolve instantly using Genes learned from Tempo scenarios 4, 12, and 13.

## All 20 Failure Scenarios

| # | Platform | Scenario | PCEC Strategy | Cross-Platform? |
|---|----------|----------|---------------|----------------|
| 1 | Tempo | Insufficient Balance | swap_currency / reduce_request | |
| 2 | Tempo | Session Expired | renew_session | |
| 3 | Tempo | Currency Mismatch | swap_direct / switch_service | |
| 4 | Tempo | Nonce Mismatch | refresh_nonce | Gene → Privy #15 |
| 5 | Tempo | Batch Revert | remove_and_resubmit | |
| 6 | Tempo | Service Down (paid) | retry_with_receipt | Gene → Generic #19 |
| 7 | Tempo | DEX Slippage | split_swap | |
| 8 | Tempo | TIP-403 Compliance Block | switch_stablecoin | |
| 9 | Tempo | Cascade Failure | refund_waterfall | |
| 10 | Tempo | Off-Ramp Failure | hold_and_notify | |
| 11 | Tempo | Token Pause | switch_stablecoin (immune) | |
| 12 | Tempo | Fee Sponsor Exhausted | self_pay_gas | Gene → Privy #16 |
| 13 | Tempo | Network Mismatch **[REAL]** | switch_network | Gene → Privy #17 |
| 14 | Privy | Policy Spending Limit | split_transaction | |
| 15 | Privy | Nonce Desync | refresh_nonce | ⚡ from Tempo #4 |
| 16 | Privy | Gas Sponsor Exhausted | self_pay_gas | ⚡ from Tempo #12 |
| 17 | Privy | Cross-Chain Mismatch | switch_network | ⚡ from Tempo #13 |
| 18 | Generic | 429 Rate Limited | backoff_retry | |
| 19 | Generic | 500 Server Error | retry / switch_provider | ⚡ from Tempo #6 |
| 20 | Generic | Request Timeout | retry | |

> Scenario #13 is not simulated — we ran `npx mppx` against OpenAI's MPP gateway and hit `TIP20 Uninitialized` in production.

## How It Works

```
Error → PERCEIVE → CONSTRUCT → EVALUATE → COMMIT → GENE
         │           │            │          │        │
         │           │            │          │        └─ Store fix in Gene Map (SQLite)
         │           │            │          └─ Execute winning strategy
         │           │            └─ Score candidates (cost × speed × history × requirements)
         │           └─ Generate repair candidates from ALL platform adapters
         └─ Chain through platform adapters until one classifies the error

On repeat encounter:
Error → PERCEIVE → GENE MAP HIT → IMMUNE ⚡ (50-100ms, skip Construct+Evaluate+Commit)
```

The Gene Map is keyed by `(failure_code, category)` — **not** by platform. This single architectural decision is what enables cross-platform immunity.

## Integration Examples

### Tempo / MPP
```typescript
import { wrap } from '@helix-agent/core';
import { Mppx, tempo } from 'mppx/client';

Mppx.create({ methods: [tempo({ account })] });
const resilientFetch = wrap(fetch);
const data = await resilientFetch('https://openai.mpp.tempo.xyz/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ model: 'gpt-4', messages: [...] }),
});
```

### Privy Wallets
```typescript
import { wrap } from '@helix-agent/core';

const resilientSign = wrap(privy.wallets.ethereum.signTransaction.bind(privy));
const tx = await resilientSign(walletId, { to: '0x...', value: '100' });
```

### Any HTTP Service
```typescript
import { wrap } from '@helix-agent/core';

const resilientCall = wrap(fetch);
const result = await resilientCall('https://any-api.com/endpoint');
// 429? 500? Timeout? Helix handles it.
```

### Advanced: Direct Engine Access
```typescript
import { createEngine } from '@helix-agent/core';

const engine = createEngine({ agentId: 'my-agent', platforms: ['tempo', 'privy'] });

try {
  await riskyOperation();
} catch (error) {
  const result = await engine.repair(error);
  if (result.success) {
    console.log(`Fixed via ${result.winner.strategy} in ${result.totalMs}ms`);
    if (result.immune) console.log('⚡ Instant fix from Gene Map!');
  }
}
```

## Demo

```bash
npm run demo          # All 20 scenarios, cross-platform immunity test
npm run demo:tempo    # Tempo-only (13 scenarios + immunity)
npm run demo:privy    # Privy + cross-platform immunity from Tempo Genes
npm run dash          # Minecraft isometric dashboard on :7842
```

## CLI

```bash
npx helix init          # Interactive setup wizard
npx helix status        # Live PCEC event stream + Gene Map
npx helix dash          # Start the isometric dashboard
```

## Adding a New Platform

```typescript
import type { PlatformAdapter } from '@helix-agent/core';

const myAdapter: PlatformAdapter = {
  name: 'my-platform',

  perceive(error) {
    if (error.message.includes('my-specific-error'))
      return { code: 'payment-insufficient', category: 'balance',
               severity: 'high', platform: 'my-platform',
               details: error.message, timestamp: Date.now() };
    return null; // not my error, try next adapter
  },

  construct(failure) {
    if (failure.category === 'balance')
      return [{ id: 'my_fix', strategy: 'my_fix',
                description: 'My custom balance fix',
                estimatedCostUsd: 0, estimatedSpeedMs: 200,
                requirements: [], score: 0, successProbability: 0.9,
                platform: 'my-platform' }];
    return [];
  },
};

// Register it
import { createEngine } from '@helix-agent/core';
const engine = createEngine();
engine.registerAdapter(myAdapter);
```

Your adapter's Genes automatically benefit from — and contribute to — every other platform's learned fixes.

## Architecture

```
helix/
├── src/
│   ├── core/                   # 100% platform-agnostic
│   │   ├── types.ts            # All types + interfaces
│   │   ├── bus.ts              # SSE EventBus (500-event ring buffer)
│   │   ├── gene-map.ts         # SQLite Gene Map (WAL mode)
│   │   ├── pcec.ts             # PCEC engine (pluggable perceive/construct)
│   │   └── index.ts            # wrap() + createEngine() exports
│   │
│   ├── platforms/              # Platform-specific adapters
│   │   ├── index.ts            # Registry + default adapter chain
│   │   ├── tempo/              # 13 scenarios
│   │   ├── privy/              # 4 unique scenarios
│   │   ├── generic/            # 3 HTTP scenarios
│   │   └── stripe/             # Placeholder
│   │
│   ├── demo/                   # Demo scripts
│   ├── cli/                    # helix init/status/dash
│   └── dashboard/              # Isometric lab visualization
```

## Roadmap

- [x] Tempo / MPP — 13 scenarios, full PCEC pipeline
- [x] Privy — 4 scenarios + cross-platform immunity
- [x] Generic HTTP — 3 scenarios (429, 500, timeout)
- [x] Cross-platform Gene sharing
- [x] Isometric dashboard with 20 inject buttons
- [ ] Stripe — card payments, subscription failures
- [ ] Circle — USDC operations
- [ ] Coinbase — exchange operations
- [ ] LLM fallback — Claude/GPT for unknown failure analysis
- [ ] Gene Registry — `helix gene push/pull` (share Genes across teams)
- [ ] Shared Gene Network — cross-agent, cross-org immunity

## Contributing

PRs welcome. Especially:
- **New platform adapters** — see "Adding a New Platform" above
- **New failure scenarios** with real error messages from production
- **Repair strategy improvements** backed by data
- **Dashboard enhancements**

## License

MIT
