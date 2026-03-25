# helix-agent-sdk

Python SDK for [Helix](https://github.com/adrianhihi/helix) — self-healing infrastructure for AI agent payments.

## Install

```bash
pip install helix-agent-sdk
```

### Option A: Docker (recommended)

```bash
docker run -d -p 7842:7842 adrianhihi/helix-server
```

### Option B: Node.js

```bash
npm install -g @helix-agent/core
npx helix serve --port 7842
```

## Quick Start

### Method 1: Client

```python
from helix_agent import HelixClient

client = HelixClient(platform="coinbase")
result = client.repair("AA25 invalid account nonce")
print(f"Strategy: {result.strategy}")  # refresh_nonce
print(f"Immune: {result.immune}")      # True on 2nd call
```

### Method 2: Decorator

```python
from helix_agent import helix_wrap

@helix_wrap(platform="coinbase", max_retries=3)
def send_payment(to: str, amount: float):
    return agent.transfer(to, amount)

result = send_payment("0x...", 1.5)
```

### Method 3: Context Manager

```python
from helix_agent import helix_guard

with helix_guard("tempo") as guard:
    try:
        result = agent.transfer(to, amount)
    except Exception as e:
        repair = guard.repair(str(e))
        if repair.immune:
            result = agent.transfer(to, amount)
```

## Features (via Helix Server)

The Python SDK talks to the Helix server which provides:

- **17 Coinbase patterns** — CDP API, ERC-4337, x402, policy, network
- **Cross-platform immunity** — genes learned on Tempo/Privy auto-heal Coinbase errors
- **LLM fallback** — unknown errors classified by Claude/GPT in real-time ($0.001), then cached forever ($0)
- **Gene Telemetry** — anonymous network learning, coverage grows over time
- **321 TypeScript tests + 14 Python tests** — production-grade reliability

Enable LLM on the server:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
docker run -d -p 7842:7842 -e ANTHROPIC_API_KEY adrianhihi/helix-server
```

## Architecture

```
┌──────────────────┐     HTTP/JSON    ┌──────────────────┐
│ Your Python Agent│ ──────────────→  │ Helix Server     │
│ (AgentKit, etc)  │                  │ PCEC + Gene Map  │
│                  │ ←──────────────  │ LLM + Telemetry  │
│ pip install      │    Strategy      │ docker run or    │
│ helix-agent-sdk  │                  │ npm install      │
└──────────────────┘                  └──────────────────┘
```

All intelligence runs server-side. The Python SDK is a lightweight HTTP client.
Your agent gets the full power of PCEC, Gene Map, LLM, and network learning.

## Configuration

```python
HELIX_URL=http://localhost:7842  # env var

client = HelixClient(
    base_url="http://localhost:7842",
    platform="coinbase",
    agent_id="my-agent-1",
)
```

## Supported Platforms

- `tempo` — Tempo L1 blockchain
- `privy` — Privy embedded wallets
- `coinbase` — Coinbase CDP + AgentKit
- `generic` — Any HTTP/RPC service
