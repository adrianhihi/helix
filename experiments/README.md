# Helix Experiments

Eval harness for reproducing the benchmark results from the Helix launch post.

## Reproduce in 5 minutes

```bash
git clone https://github.com/adrianhihi/helix
cd helix
npm install
npx tsx scripts/benchmark/run.ts --verbose
```

## Experiment Index

| # | Name | Type | Transactions |
|---|------|------|-------------|
| 7 | LLM vs PCEC Classification | Offline (API calls) | 0 |
| 8 | GPT-5.4 Wrong Fix vs PCEC On-Chain | Base Mainnet | 6 |
| 8v2 | GPT-5.4 vs PCEC (slippage) | Base Mainnet | 6 |
| B | CoT Paradox | Offline | 0 |
| C | Multi-Step Compounding | Offline | 0 |
| Benchmark | 50 Payment Scenarios | Simulated | 0 |

## Data

Raw results are in each experiment subfolder.
On-chain transactions verifiable at basescan.org — wallet: 0x5BCeA8A5A625f254662c1CD5d46d0a2Cf9e0E023
