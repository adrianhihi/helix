import type { FailureClassification, RepairCandidate } from '../../engine/types.js';

export function tempoConstruct(failure: FailureClassification): RepairCandidate[] {
  switch (failure.category) {
    case 'balance':
      return [
        { id: 'swap_currency', strategy: 'swap_currency', description: 'Swap alt stablecoin via Tempo DEX', estimatedCostUsd: 0.50, estimatedSpeedMs: 800, requirements: ['alt_balance'], score: 0, successProbability: 0.85, platform: 'tempo' },
        { id: 'topup_from_reserve', strategy: 'topup_from_reserve', description: 'Top up from reserve wallet', estimatedCostUsd: 0.10, estimatedSpeedMs: 1200, requirements: ['reserve'], score: 0, successProbability: 0.90, platform: 'tempo' },
        { id: 'reduce_request', strategy: 'reduce_request', description: 'Reduce payment to available balance', estimatedCostUsd: 0, estimatedSpeedMs: 100, requirements: [], score: 0, successProbability: 0.95, platform: 'tempo' },
      ];
    case 'session':
      return [
        { id: 'renew_session', strategy: 'renew_session', description: 'Auto-renew MPP session with fresh challenge', estimatedCostUsd: 0, estimatedSpeedMs: 300, requirements: [], score: 0, successProbability: 0.92, platform: 'tempo' },
        { id: 'switch_to_charge', strategy: 'switch_to_charge', description: 'Switch from session to one-time charge', estimatedCostUsd: 0.01, estimatedSpeedMs: 500, requirements: [], score: 0, successProbability: 0.88, platform: 'tempo' },
      ];
    case 'currency':
      return [
        { id: 'swap_direct', strategy: 'swap_direct', description: 'Direct swap to required currency via Tempo DEX', estimatedCostUsd: 0.30, estimatedSpeedMs: 600, requirements: ['dex_liquidity'], score: 0, successProbability: 0.85, platform: 'tempo' },
        { id: 'swap_multihop', strategy: 'swap_multihop', description: 'Multi-hop swap via intermediate currency', estimatedCostUsd: 0.80, estimatedSpeedMs: 1500, requirements: ['dex_liquidity', 'intermediate_pair'], score: 0, successProbability: 0.75, platform: 'tempo' },
        { id: 'switch_service', strategy: 'switch_service', description: 'Switch to service that accepts current currency', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: ['alt_service'], score: 0, successProbability: 0.80, platform: 'tempo' },
      ];
    case 'signature':
      return [
        { id: 'refresh_nonce', strategy: 'refresh_nonce', description: 'Refresh nonce from Tempo RPC and re-sign', estimatedCostUsd: 0, estimatedSpeedMs: 400, requirements: [], score: 0, successProbability: 0.90, platform: 'tempo' },
        { id: 'rederive_key', strategy: 'rederive_key', description: 'Re-derive signing key from wallet', estimatedCostUsd: 0, estimatedSpeedMs: 600, requirements: ['wallet_access'], score: 0, successProbability: 0.80, platform: 'tempo' },
      ];
    case 'batch':
      return [
        { id: 'remove_and_resubmit', strategy: 'remove_and_resubmit', description: 'Remove failed item from batch and resubmit', estimatedCostUsd: 0.10, estimatedSpeedMs: 500, requirements: [], score: 0, successProbability: 0.88, platform: 'tempo' },
        { id: 'fix_and_retry_all', strategy: 'fix_and_retry_all', description: 'Fix failed item and retry entire batch', estimatedCostUsd: 0.20, estimatedSpeedMs: 1000, requirements: ['item_fixable'], score: 0, successProbability: 0.75, platform: 'tempo' },
        { id: 'split_batch', strategy: 'split_batch', description: 'Split batch into individual transactions', estimatedCostUsd: 0.50, estimatedSpeedMs: 2000, requirements: [], score: 0, successProbability: 0.90, platform: 'tempo' },
      ];
    case 'service':
      return [
        { id: 'retry_with_receipt', strategy: 'retry_with_receipt', description: 'Retry request with MPP payment receipt (idempotent)', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: ['valid_receipt'], score: 0, successProbability: 0.90, platform: 'tempo' },
        { id: 'switch_provider', strategy: 'switch_provider', description: 'Switch to backup service provider', estimatedCostUsd: 0.10, estimatedSpeedMs: 800, requirements: ['alt_provider'], score: 0, successProbability: 0.80, platform: 'tempo' },
        { id: 'request_refund', strategy: 'request_refund', description: 'Request refund for failed service delivery', estimatedCostUsd: 0, estimatedSpeedMs: 3000, requirements: ['refund_support'], score: 0, successProbability: 0.70, platform: 'tempo' },
      ];
    case 'dex':
      return [
        { id: 'split_swap', strategy: 'split_swap', description: 'Split into multiple smaller swaps to avoid slippage', estimatedCostUsd: 0.40, estimatedSpeedMs: 1200, requirements: [], score: 0, successProbability: 0.85, platform: 'tempo' },
        { id: 'swap_multihop_dex', strategy: 'swap_multihop', description: 'Route through deeper liquidity pool', estimatedCostUsd: 0.60, estimatedSpeedMs: 1800, requirements: ['alt_pool'], score: 0, successProbability: 0.75, platform: 'tempo' },
        { id: 'wait_and_retry', strategy: 'wait_and_retry', description: 'Wait for liquidity to stabilize and retry', estimatedCostUsd: 0, estimatedSpeedMs: 5000, requirements: [], score: 0, successProbability: 0.65, platform: 'tempo' },
      ];
    case 'compliance':
      return [
        { id: 'switch_stablecoin', strategy: 'switch_stablecoin', description: 'Switch to unrestricted stablecoin (e.g., DAI)', estimatedCostUsd: 0.30, estimatedSpeedMs: 700, requirements: ['unrestricted_coin_balance'], score: 0, successProbability: 0.80, platform: 'tempo' },
        { id: 'route_via_compliant_wallet', strategy: 'route_via_compliant_wallet', description: 'Route payment via KYC-compliant wallet', estimatedCostUsd: 1.00, estimatedSpeedMs: 2000, requirements: ['compliant_wallet'], score: 0, successProbability: 0.75, platform: 'tempo' },
      ];
    case 'cascade':
      return [
        { id: 'refund_waterfall', strategy: 'refund_waterfall', description: 'Initiate refund waterfall C→B→A', estimatedCostUsd: 0.50, estimatedSpeedMs: 3000, requirements: [], score: 0, successProbability: 0.80, platform: 'tempo' },
        { id: 'reroute_via_alt', strategy: 'reroute_via_alt', description: 'Reroute cascade through alternative agent', estimatedCostUsd: 2.00, estimatedSpeedMs: 5000, requirements: ['alt_agent'], score: 0, successProbability: 0.70, platform: 'tempo' },
      ];
    case 'offramp':
      return [
        { id: 'switch_offramp', strategy: 'switch_offramp', description: 'Switch to backup off-ramp provider', estimatedCostUsd: 1.50, estimatedSpeedMs: 2000, requirements: ['alt_offramp'], score: 0, successProbability: 0.80, platform: 'tempo' },
        { id: 'hold_and_notify', strategy: 'hold_and_notify', description: 'Hold funds on-chain and notify operator', estimatedCostUsd: 0, estimatedSpeedMs: 500, requirements: [], score: 0, successProbability: 0.90, platform: 'tempo' },
      ];
    case 'network':
      return [
        { id: 'switch_network', strategy: 'switch_network', description: 'Switch RPC endpoint to correct network', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: [], score: 0, successProbability: 0.90, platform: 'tempo' },
        { id: 'bridge_tokens', strategy: 'bridge_tokens', description: 'Bridge assets from current chain to target chain', estimatedCostUsd: 0.50, estimatedSpeedMs: 5000, requirements: ['bridge_available'], score: 0, successProbability: 0.75, platform: 'tempo' },
        { id: 'switch_service_net', strategy: 'switch_service', description: 'Fall back to service on same network', estimatedCostUsd: 0, estimatedSpeedMs: 100, requirements: ['alt_service'], score: 0, successProbability: 0.80, platform: 'tempo' },
      ];
    case 'gas':
      return [
        { id: 'tempo_speed_up', strategy: 'speed_up_transaction', description: 'Bump gas price to overcome spike', estimatedCostUsd: 0.01, estimatedSpeedMs: 150, requirements: [], score: 0, successProbability: 0.83, platform: 'tempo' },
      ];
    default:
      return [];
  }
}
