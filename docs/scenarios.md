# Helix Failure Scenarios

20 total scenarios across 4 platforms. Gene Map stores by `(code, category)` — not by platform — enabling cross-platform immunity.

## Tempo / MPP (13 scenarios)

| # | Name | Error Code | Category | Tag |
|---|------|-----------|----------|-----|
| 1 | Insufficient Balance | payment-insufficient | balance | LIVE |
| 2 | Session Expired | invalid-challenge | session | LIVE |
| 3 | Currency Mismatch | method-unsupported | currency | LIVE |
| 4 | Signature / Nonce Failure | verification-failed | signature | LIVE |
| 5 | Batch Revert | tx-reverted | batch | LIVE |
| 6 | Service Down After Payment | payment-required | service | MOCK |
| 7 | DEX Slippage | swap-reverted | dex | MOCK |
| 8 | TIP-403 Compliance Block | tip-403 | compliance | MOCK |
| 9 | Cascade Failure | cascade-failure | cascade | VISION |
| 10 | Off-Ramp Failed | offramp-failed | offramp | VISION |
| 11 | Token Pause Mid-Transfer | tip-403 | compliance | MOCK |
| 12 | Fee Sponsor Exhausted | payment-insufficient | balance | MOCK |
| 13 | Network Mismatch | token-uninitialized | network | **REAL** |

> Scenario #13 is not simulated. We ran `npx mppx` against OpenAI's MPP gateway and hit `TIP20 Uninitialized` in production.

## Privy Wallet (4 unique scenarios)

| # | Name | Error Code | Category | Tag |
|---|------|-----------|----------|-----|
| 14 | Policy Spending Limit | policy-violation | policy | LIVE |
| 15 | Nonce Desync | verification-failed | signature | LIVE |
| 16 | Gas Sponsor Exhausted | payment-insufficient | balance | MOCK |
| 17 | Cross-Chain Mismatch | token-uninitialized | network | MOCK |

### Privy Error Messages (from production patterns)

- **#14**: `Privy policy engine rejected transaction: AMOUNT_EXCEEDS_LIMIT. Policy "max_transfer_500" limits single transfer to 500 USDC. Requested: 2500 USDC`
- **#15**: `Transaction nonce mismatch: wallet internal nonce=47 but chain nonce=45. Two pending transactions may be stuck in mempool`
- **#16**: `Privy automated gas sponsorship balance depleted. Sponsor wallet 0x1234...5678 has 0 USDC. Cannot pay gas for agent transaction`
- **#17**: `Privy wallet wlt_stu901 is provisioned on Ethereum mainnet but transaction targets Tempo chain (chainId: 42069). Cannot sign for mismatched chain`

## Generic HTTP (3 scenarios)

| # | Name | Error Code | Category | Tag |
|---|------|-----------|----------|-----|
| 18 | 429 Rate Limited | rate-limited | auth | LIVE |
| 19 | 500 Server Error | server-error | service | LIVE |
| 20 | Request Timeout | timeout | service | LIVE |

## Cross-Platform Immunity Matrix

The following Tempo Genes automatically heal Privy and Generic errors:

| Tempo Gene | Category | Privy Scenario | Generic Scenario |
|-----------|----------|---------------|-----------------|
| #4 Nonce Mismatch | signature | #15 Nonce Desync | — |
| #6 Service Down | service | — | #19 Server Error |
| #12 Sponsor Exhausted | balance | #16 Gas Sponsor | — |
| #13 Network Mismatch | network | #17 Cross-Chain | — |

This works because the Gene Map is keyed by `(failure_code, category)`, not by platform. Same category = same fix = instant immunity across all platforms.
