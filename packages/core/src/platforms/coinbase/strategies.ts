import type { FailureClassification, RepairCandidate } from '../../engine/types.js';

export function coinbaseConstruct(failure: FailureClassification): RepairCandidate[] {
  if (failure.platform === 'coinbase' && failure.category === 'auth') {
    return [
      { id: 'cb_backoff', strategy: 'backoff_retry', description: 'Exponential backoff and retry after rate limit', estimatedCostUsd: 0, estimatedSpeedMs: 500, requirements: [], score: 0, successProbability: 0.90, platform: 'coinbase' },
    ];
  }

  if (failure.category === 'policy') {
    return [
      { id: 'cb_split_userop', strategy: 'split_transaction', description: 'Split userOperation into smaller ops under spend limit', estimatedCostUsd: 0.02, estimatedSpeedMs: 500, requirements: [], score: 0, successProbability: 0.85, platform: 'coinbase' },
      { id: 'cb_self_pay', strategy: 'self_pay_gas', description: 'Bypass Paymaster, pay gas directly from account', estimatedCostUsd: 0.05, estimatedSpeedMs: 300, requirements: ['privateKey'], score: 0, successProbability: 0.90, platform: 'coinbase' },
      { id: 'cb_switch_wallet', strategy: 'switch_endpoint', description: 'Switch to address with remaining quota', estimatedCostUsd: 0, estimatedSpeedMs: 100, requirements: ['alt_wallet'], score: 0, successProbability: 0.80, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.category === 'signature') {
    return [
      { id: 'cb_refresh_nonce', strategy: 'refresh_nonce', description: 'Fetch nonce from EntryPoint for smart account', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: ['rpcUrl'], score: 0, successProbability: 0.93, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.category === 'balance') {
    return [
      { id: 'cb_increase_gas', strategy: 'fix_params', description: 'Increase verificationGasLimit and preVerificationGas', estimatedCostUsd: 0, estimatedSpeedMs: 100, requirements: [], score: 0, successProbability: 0.85, platform: 'coinbase' },
      { id: 'cb_fund_account', strategy: 'topup_from_reserve', description: 'Fund smart account with ETH for prefund', estimatedCostUsd: 0.10, estimatedSpeedMs: 2000, requirements: ['privateKey'], score: 0, successProbability: 0.80, platform: 'coinbase' },
      { id: 'cb_reduce', strategy: 'reduce_request', description: 'Reduce transaction value to fit within gas budget', estimatedCostUsd: 0, estimatedSpeedMs: 50, requirements: [], score: 0, successProbability: 0.90, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.code === 'paymaster-balance-low') {
    return [
      { id: 'cb_reduce_paymaster', strategy: 'reduce_request', description: 'Reduce transaction value to fit paymaster deposit', estimatedCostUsd: 0, estimatedSpeedMs: 100, requirements: [], score: 0, successProbability: 0.80, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.code === 'gas-estimation-failed') {
    return [
      { id: 'cb_speed_est', strategy: 'speed_up_transaction', description: 'Increase gas to pass estimation', estimatedCostUsd: 0.01, estimatedSpeedMs: 150, requirements: [], score: 0, successProbability: 0.82, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.category === 'gas') {
    return [
      { id: 'cb_speed_up', strategy: 'speed_up_transaction', description: 'Bump gas price by 30% for faster inclusion', estimatedCostUsd: 0.01, estimatedSpeedMs: 150, requirements: [], score: 0, successProbability: 0.88, platform: 'coinbase' },
      { id: 'cb_fix_gas', strategy: 'fix_params', description: 'Auto-populate gas parameters', estimatedCostUsd: 0.01, estimatedSpeedMs: 150, requirements: [], score: 0, successProbability: 0.85, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.category === 'batch') {
    return [
      { id: 'cb_remove_resubmit', strategy: 'remove_and_resubmit', description: 'Remove failed tx and resubmit', estimatedCostUsd: 0.01, estimatedSpeedMs: 300, requirements: [], score: 0, successProbability: 0.85, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.category === 'network') {
    return [
      { id: 'cb_switch_net', strategy: 'switch_network', description: 'Switch to correct network for x402 payment', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: ['rpcUrl'], score: 0, successProbability: 0.92, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.category === 'session') {
    return [
      { id: 'cb_refresh_quote', strategy: 'retry', description: 'Request fresh transfer quote and retry', estimatedCostUsd: 0, estimatedSpeedMs: 300, requirements: [], score: 0, successProbability: 0.88, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.code === 'malformed-credential') {
    return [
      { id: 'cb_fix_params', strategy: 'fix_params', description: 'Fix transaction encoding and populate missing fields', estimatedCostUsd: 0, estimatedSpeedMs: 50, requirements: [], score: 0, successProbability: 0.85, platform: 'coinbase' },
      { id: 'cb_new_idempotency', strategy: 'retry', description: 'Generate new idempotency key and retry', estimatedCostUsd: 0, estimatedSpeedMs: 100, requirements: [], score: 0, successProbability: 0.90, platform: 'coinbase' },
    ];
  }

  if (failure.platform === 'coinbase' && failure.code === 'server-error') {
    return [
      { id: 'cb_retry', strategy: 'retry', description: 'Retry after server/connection error', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: [], score: 0, successProbability: 0.92, platform: 'coinbase' },
    ];
  }

  if (failure.code === 'timeout' && failure.platform === 'coinbase') {
    return [
      { id: 'cb_extend_deadline', strategy: 'extend_deadline', description: 'Extend userOperation deadline by 300s', estimatedCostUsd: 0, estimatedSpeedMs: 50, requirements: [], score: 0, successProbability: 0.90, platform: 'coinbase' },
      { id: 'cb_backoff', strategy: 'backoff_retry', description: 'Wait and retry with extended timeout', estimatedCostUsd: 0, estimatedSpeedMs: 2000, requirements: [], score: 0, successProbability: 0.80, platform: 'coinbase' },
    ];
  }

  return [];
}
