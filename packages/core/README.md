# @helix-agent/core

> Agent payment intelligence — predict costs, optimize execution, fix failures.
>
> Powered by [VialOS Runtime](https://github.com/adrianhihi/vialos-runtime)

## Install

```bash
npm install @helix-agent/core
```

> **Do NOT use `npm install helix`** — that's a different package. Always use `@helix-agent/core`.

## Quick Start

```javascript
// Start the server
// npx @helix-agent/core serve --port 7842 --mode observe

// Or use programmatically
import { wrap } from '@helix-agent/core';

const safePay = wrap(myPaymentFunction, { mode: 'auto', platform: 'coinbase' });
const result = await safePay({ to: '0x...', value: 1000n });
// Failed? Helix diagnoses, fixes, retries. You never knew.
```

## What It Does

Helix wraps your agent's payment transactions with a self-evolving intelligence layer:

1. **Fix failures** — 61 error patterns across Coinbase, Tempo, Privy, and generic HTTP/API
2. **Learn from every transaction** — Gene Map accumulates repair strategies with success rates (Q-values)
3. **Get smarter over time** — Gene Dream consolidates knowledge, Self-Play evolves strategies

### PCEC Engine (6-stage repair loop)

```
Perceive → Construct → Evaluate → Commit → Verify → Gene
```

Each repair makes the next one smarter. The Gene Map is your agent's immune system.

## Platform Support

- **Coinbase** — 17 patterns (CDP, AgentKit, ERC-4337, x402, Paymaster)
- **Tempo** — 13 patterns (nonce, session, DEX, MPP)
- **Privy** — 7 patterns (policy, gas, cross-chain, embedded wallet)
- **Generic API** — 21 patterns (throttle, server, timeout, auth, client, data)
- **Generic Blockchain** — 3 patterns (429, 500, timeout)

## REST API

```bash
# Start server
npx @helix-agent/core serve --port 7842 --mode observe

# Repair a failure
curl -X POST http://localhost:7842/repair \
  -H 'Content-Type: application/json' \
  -d '{"error": "nonce too low", "platform": "coinbase"}'

# Check Gene Map stats
curl http://localhost:7842/status

# Interactive dashboard
open http://localhost:7842/dashboard
```

## Docker

```bash
docker run -d -p 7842:7842 adrianhihi/helix-server
```

## Python SDK

```bash
pip install helix-agent-sdk
```

```python
from helix_agent import HelixClient
client = HelixClient("http://localhost:7842")
result = client.repair("nonce too low", platform="coinbase")
```

## Telemetry

Helix collects anonymous usage data to understand error pattern distribution. No wallet addresses, private keys, transaction hashes, or user-identifiable information is ever sent.

To opt out:
```bash
export HELIX_TELEMETRY=false
```

## VialOS Beta Features

```bash
npx @helix-agent/core serve --port 7842 --mode observe --beta
```

Enables: `GET /vial/status`, VialOS metadata in health endpoint, dashboard badge.

## v2.6.0 Highlights

- **Self-Refine** — iterative failure refinement (arXiv 2303.17651)
- **Prompt Optimizer** — DSPy-style prompt self-optimization (arXiv 2310.03714)
- **API Adapter** — 21 HTTP/API error patterns across 7 categories
- **Nonce classification** — improved cross-platform nonce detection
- **VialOS beta** — `--beta` flag for VialOS Runtime integration
- **MPPScan** — x402 payment protocol discovery

## Stats

526 tests passing · Schema v12 · 61 error patterns · 5 platforms · 8 research papers implemented

## Links

- [GitHub](https://github.com/adrianhihi/helix)
- [VialOS Runtime](https://github.com/adrianhihi/vialos-runtime)
- [Python SDK](https://pypi.org/project/helix-agent-sdk/)
- [Docker](https://hub.docker.com/r/adrianhihi/helix-server)

## License

MIT
