/**
 * 50 payment error scenarios for A/B benchmark.
 */

export interface Scenario {
  id: number;
  error: string;
  platform: 'coinbase' | 'tempo' | 'privy' | 'generic';
  category: string;
  expectedKnown: boolean;
  description: string;
  gasWastedUSD: number;
  gasOptimizable: number;
}

export const SCENARIOS: Scenario[] = [
  // === KNOWN ERRORS (Helix has seed genes — should be $0) ===
  { id: 1,  error: 'nonce mismatch: expected 42 got 38', platform: 'coinbase', category: 'nonce_error', expectedKnown: true, description: 'Coinbase nonce mismatch', gasWastedUSD: 0.12, gasOptimizable: 0.02 },
  { id: 2,  error: 'nonce too low', platform: 'coinbase', category: 'nonce_error', expectedKnown: true, description: 'Coinbase nonce too low', gasWastedUSD: 0.08, gasOptimizable: 0.02 },
  { id: 3,  error: 'InvalidNonce: stale nonce', platform: 'tempo', category: 'nonce_error', expectedKnown: true, description: 'Tempo stale nonce', gasWastedUSD: 0.10, gasOptimizable: 0.02 },
  { id: 4,  error: 'nonce already used', platform: 'privy', category: 'nonce_error', expectedKnown: true, description: 'Privy nonce reuse', gasWastedUSD: 0.09, gasOptimizable: 0.02 },
  { id: 5,  error: 'replacement transaction underpriced', platform: 'generic', category: 'nonce_error', expectedKnown: true, description: 'Generic underpriced replacement', gasWastedUSD: 0.15, gasOptimizable: 0.03 },

  { id: 6,  error: 'insufficient funds for gas * price + value', platform: 'coinbase', category: 'gas_error', expectedKnown: true, description: 'Coinbase insufficient gas', gasWastedUSD: 0.05, gasOptimizable: 0.03 },
  { id: 7,  error: 'max fee per gas less than block base fee', platform: 'coinbase', category: 'gas_error', expectedKnown: true, description: 'Coinbase gas below base', gasWastedUSD: 0.0, gasOptimizable: 0.04 },
  { id: 8,  error: 'gas limit exceeded', platform: 'tempo', category: 'gas_error', expectedKnown: true, description: 'Tempo gas limit', gasWastedUSD: 0.18, gasOptimizable: 0.03 },
  { id: 9,  error: 'transaction underpriced', platform: 'privy', category: 'gas_error', expectedKnown: true, description: 'Privy underpriced tx', gasWastedUSD: 0.0, gasOptimizable: 0.04 },
  { id: 10, error: 'intrinsic gas too low', platform: 'generic', category: 'gas_error', expectedKnown: true, description: 'Generic intrinsic gas', gasWastedUSD: 0.0, gasOptimizable: 0.03 },

  { id: 11, error: 'session expired', platform: 'tempo', category: 'session_error', expectedKnown: true, description: 'Tempo session expired', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 12, error: 'invalid API key', platform: 'coinbase', category: 'auth_error', expectedKnown: true, description: 'Coinbase invalid key', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 13, error: 'JWT token expired', platform: 'privy', category: 'auth_error', expectedKnown: true, description: 'Privy JWT expired', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 14, error: '401 Unauthorized', platform: 'generic', category: 'auth_error', expectedKnown: true, description: 'Generic 401', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 15, error: '403 Forbidden: policy violation', platform: 'coinbase', category: 'policy_error', expectedKnown: true, description: 'Coinbase policy violation', gasWastedUSD: 0, gasOptimizable: 0 },

  { id: 16, error: 'ETIMEDOUT', platform: 'generic', category: 'timeout_error', expectedKnown: true, description: 'Generic timeout', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 17, error: '429 Too Many Requests', platform: 'generic', category: 'rate_limit', expectedKnown: true, description: 'Generic rate limit', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 18, error: '502 Bad Gateway', platform: 'generic', category: 'server_error', expectedKnown: true, description: 'Generic bad gateway', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 19, error: '503 Service Unavailable', platform: 'generic', category: 'server_error', expectedKnown: true, description: 'Generic service unavailable', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 20, error: 'ECONNREFUSED', platform: 'generic', category: 'connection_error', expectedKnown: true, description: 'Generic connection refused', gasWastedUSD: 0, gasOptimizable: 0 },

  { id: 21, error: 'AA25: nonce validation failed', platform: 'coinbase', category: 'aa_error', expectedKnown: true, description: 'Coinbase AA25 nonce', gasWastedUSD: 0.20, gasOptimizable: 0.02 },
  { id: 22, error: 'AA21: sender not deployed', platform: 'coinbase', category: 'aa_error', expectedKnown: true, description: 'Coinbase AA21', gasWastedUSD: 0.25, gasOptimizable: 0.02 },
  { id: 23, error: 'paymaster deposit too low', platform: 'coinbase', category: 'paymaster_error', expectedKnown: true, description: 'Coinbase paymaster deposit', gasWastedUSD: 0.0, gasOptimizable: 0 },
  { id: 24, error: 'paymaster validation failed', platform: 'coinbase', category: 'paymaster_error', expectedKnown: true, description: 'Coinbase paymaster validation', gasWastedUSD: 0.15, gasOptimizable: 0.02 },
  { id: 25, error: 'bundler: replacement underpriced', platform: 'coinbase', category: 'bundler_error', expectedKnown: true, description: 'Coinbase bundler underpriced', gasWastedUSD: 0.10, gasOptimizable: 0.03 },

  // === SIMILAR ERRORS (variant messages, Helix should still match) ===
  { id: 26, error: 'nonce is 15 but expected 17', platform: 'coinbase', category: 'nonce_error', expectedKnown: true, description: 'Coinbase nonce variant', gasWastedUSD: 0.11, gasOptimizable: 0.02 },
  { id: 27, error: 'err: insufficient gas, have 21000 want 25000', platform: 'tempo', category: 'gas_error', expectedKnown: true, description: 'Tempo gas variant', gasWastedUSD: 0.07, gasOptimizable: 0.03 },
  { id: 28, error: 'Rate limit exceeded. Retry after 30s', platform: 'coinbase', category: 'rate_limit', expectedKnown: true, description: 'Coinbase rate limit variant', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 29, error: 'Request timeout after 30000ms', platform: 'privy', category: 'timeout_error', expectedKnown: true, description: 'Privy timeout variant', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 30, error: 'error 500: internal server error', platform: 'tempo', category: 'server_error', expectedKnown: true, description: 'Tempo 500 variant', gasWastedUSD: 0, gasOptimizable: 0 },

  // === NOVEL ERRORS (neither agent knows — both pay LLM cost) ===
  { id: 31, error: 'ERC-20: transfer amount exceeds allowance', platform: 'coinbase', category: 'allowance_error', expectedKnown: false, description: 'ERC-20 allowance', gasWastedUSD: 0.22, gasOptimizable: 0 },
  { id: 32, error: 'execution reverted: UNPREDICTABLE_GAS_LIMIT', platform: 'coinbase', category: 'revert_error', expectedKnown: false, description: 'Unpredictable gas limit revert', gasWastedUSD: 0.35, gasOptimizable: 0 },
  { id: 33, error: 'missing trie node', platform: 'generic', category: 'node_error', expectedKnown: false, description: 'Missing trie node', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 34, error: 'header not found', platform: 'generic', category: 'node_error', expectedKnown: false, description: 'Header not found', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 35, error: 'already known', platform: 'generic', category: 'duplicate_error', expectedKnown: false, description: 'Tx already known', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 36, error: 'max priority fee per gas higher than max fee per gas', platform: 'coinbase', category: 'eip1559_error', expectedKnown: false, description: 'EIP-1559 fee mismatch', gasWastedUSD: 0.0, gasOptimizable: 0.04 },
  { id: 37, error: 'execution reverted: STF', platform: 'tempo', category: 'swap_error', expectedKnown: false, description: 'Swap STF revert', gasWastedUSD: 0.28, gasOptimizable: 0 },
  { id: 38, error: 'execution reverted: INSUFFICIENT_OUTPUT_AMOUNT', platform: 'tempo', category: 'slippage_error', expectedKnown: false, description: 'Slippage exceeded', gasWastedUSD: 0.30, gasOptimizable: 0.02 },
  { id: 39, error: 'chain id mismatch: expected 8453, got 1', platform: 'privy', category: 'chain_error', expectedKnown: false, description: 'Wrong chain ID', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 40, error: 'insufficient balance for transfer', platform: 'privy', category: 'balance_error', expectedKnown: false, description: 'Insufficient balance', gasWastedUSD: 0.0, gasOptimizable: 0 },

  // === REPEATED ERRORS (test Gene Map learning — 2nd occurrence should be free) ===
  { id: 41, error: 'ERC-20: transfer amount exceeds allowance', platform: 'coinbase', category: 'allowance_error', expectedKnown: false, description: 'ERC-20 allowance (2nd)', gasWastedUSD: 0.22, gasOptimizable: 0 },
  { id: 42, error: 'execution reverted: UNPREDICTABLE_GAS_LIMIT', platform: 'coinbase', category: 'revert_error', expectedKnown: false, description: 'Gas limit revert (2nd)', gasWastedUSD: 0.35, gasOptimizable: 0 },
  { id: 43, error: 'missing trie node', platform: 'generic', category: 'node_error', expectedKnown: false, description: 'Trie node (2nd)', gasWastedUSD: 0, gasOptimizable: 0 },
  { id: 44, error: 'max priority fee per gas higher than max fee per gas', platform: 'coinbase', category: 'eip1559_error', expectedKnown: false, description: 'EIP-1559 (2nd)', gasWastedUSD: 0.0, gasOptimizable: 0.04 },
  { id: 45, error: 'execution reverted: STF', platform: 'tempo', category: 'swap_error', expectedKnown: false, description: 'STF revert (2nd)', gasWastedUSD: 0.28, gasOptimizable: 0 },

  // === SUCCESS CASES ===
  { id: 46, error: '', platform: 'coinbase', category: 'success', expectedKnown: true, description: 'Successful Coinbase tx', gasWastedUSD: 0, gasOptimizable: 0.03 },
  { id: 47, error: '', platform: 'tempo', category: 'success', expectedKnown: true, description: 'Successful Tempo tx', gasWastedUSD: 0, gasOptimizable: 0.03 },
  { id: 48, error: '', platform: 'privy', category: 'success', expectedKnown: true, description: 'Successful Privy tx', gasWastedUSD: 0, gasOptimizable: 0.02 },
  { id: 49, error: '', platform: 'coinbase', category: 'success', expectedKnown: true, description: 'Successful Coinbase tx 2', gasWastedUSD: 0, gasOptimizable: 0.03 },
  { id: 50, error: '', platform: 'generic', category: 'success', expectedKnown: true, description: 'Successful generic tx', gasWastedUSD: 0, gasOptimizable: 0.02 },
];
