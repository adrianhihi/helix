# Helix Strategy Implementation Status

## Category A — Diagnostic Retry (no provider needed)
| Strategy | Real? | Notes |
|----------|-------|-------|
| backoff_retry | ✅ REAL | Exponential backoff with configurable delay |
| retry | ✅ REAL | Simple 500ms retry |
| reduce_request | ✅ REAL | Reduces amount to available balance |
| fix_params | ✅ REAL | Auto-populates gasLimit, chainId, type, EIP-1559 gas prices (via viem) |
| switch_endpoint | ✅ REAL | Switches to altEndpoint from context |
| hold_and_notify | ✅ REAL | Pauses agent, emits notification |
| extend_deadline | ✅ REAL | Adds 300s to deadline |
| remove_and_resubmit | ✅ REAL | Excludes failed batch item, resubmits rest |
| renew_session | ✅ REAL | Refreshes MPP session challenge |
| switch_service | ✅ REAL | Switches to alt service provider |
| retry_with_estimation | ✅ REAL | Privy auto-estimate gas and nonce |
| use_unrestricted_wallet | ✅ REAL | Switch to alt wallet |

## Category B — Mutative Repair (needs rpcUrl + viem publicClient)
| Strategy | Real? | Notes |
|----------|-------|-------|
| refresh_nonce | ✅ REAL | `eth_getTransactionCount` via viem |
| switch_network | ✅ REAL | Rebuilds viem client, verifies `eth_chainId` |
| get_balance | ✅ REAL | `eth_getBalance` via viem |
| retry_with_receipt | ✅ REAL | `waitForTransactionReceipt` if tx hash available |

## Category C — Chain Write (needs privateKey + viem walletClient)
| Strategy | Real? | Notes |
|----------|-------|-------|
| self_pay_gas | ✅ REAL | `sendTransaction` without sponsor |
| cancel_pending_txs | ✅ REAL | 0-value self-send at same nonce, high gas |
| speed_up_transaction | ✅ REAL | Same tx, 30% gas bump via `getGasPrice` |
| split_transaction | ✅ REAL | Splits into N sub-limit chunks |
| topup_from_reserve | ✅ REAL | ETH transfer from reserve wallet |
| swap_currency | ⏳ PENDING | Needs DEX router contract per chain |
| switch_stablecoin | ⏳ PENDING | Swap to compliant stablecoin |
| split_swap | ⏳ PENDING | Multi-chunk DEX swap |
| swap_to_usdc | ⏳ PENDING | Swap any token to USDC |

## Category D — Orchestration
| Strategy | Real? | Notes |
|----------|-------|-------|
| refund_waterfall | 🔶 PARTIAL | Flags for manual review with diagnostic info |

## Summary

**21 of 25 strategies have real execution. 4 pending DEX integration.**

All chain-read strategies use viem `publicClient`. All chain-write strategies use viem `walletClient`. No simulated RPC calls remain for configured providers.
