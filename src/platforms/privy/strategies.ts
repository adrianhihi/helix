import type { FailureClassification, RepairCandidate } from '../../core/types.js';

export function privyConstruct(failure: FailureClassification): RepairCandidate[] {
  // Privy-unique category: 'policy'
  if (failure.category === 'policy') {
    return [
      { id: 'split_transaction', strategy: 'split_transaction', description: 'Split into multiple transactions under spending limit', estimatedCostUsd: 0.02, estimatedSpeedMs: 400, requirements: [], score: 0, successProbability: 0.90, platform: 'privy' },
      { id: 'use_unrestricted_wallet', strategy: 'use_unrestricted_wallet', description: 'Switch to wallet with higher spending limits', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: ['alt_wallet'], score: 0, successProbability: 0.85, platform: 'privy' },
    ];
  }

  // For categories that overlap with Tempo (signature, balance, network),
  // Privy can add platform-specific candidates alongside Tempo's:
  if (failure.platform === 'privy' && failure.category === 'signature') {
    return [
      { id: 'refresh_nonce_from_chain', strategy: 'refresh_nonce', description: 'Sync wallet nonce with on-chain state', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: [], score: 0, successProbability: 0.93, platform: 'privy' },
      { id: 'cancel_pending_txs', strategy: 'cancel_pending_txs', description: 'Cancel stuck pending transactions to reset nonce', estimatedCostUsd: 0.01, estimatedSpeedMs: 600, requirements: [], score: 0, successProbability: 0.80, platform: 'privy' },
    ];
  }

  if (failure.platform === 'privy' && failure.category === 'balance') {
    return [
      { id: 'self_pay_gas', strategy: 'self_pay_gas', description: 'Fallback to self-pay gas in stablecoin', estimatedCostUsd: 0.01, estimatedSpeedMs: 300, requirements: ['stablecoin_balance'], score: 0, successProbability: 0.95, platform: 'privy' },
      { id: 'top_up_sponsor', strategy: 'top_up_sponsor', description: 'Top up gas sponsor wallet', estimatedCostUsd: 1.00, estimatedSpeedMs: 1000, requirements: ['reserve'], score: 0, successProbability: 0.88, platform: 'privy' },
    ];
  }

  if (failure.platform === 'privy' && failure.category === 'network') {
    return [
      { id: 'switch_chain_context', strategy: 'switch_network', description: 'Switch wallet chain context to target chain', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: [], score: 0, successProbability: 0.92, platform: 'privy' },
      { id: 'create_target_wallet', strategy: 'create_target_wallet', description: 'Create new wallet on target chain', estimatedCostUsd: 0, estimatedSpeedMs: 800, requirements: ['privy_api'], score: 0, successProbability: 0.85, platform: 'privy' },
    ];
  }

  return [];
}
