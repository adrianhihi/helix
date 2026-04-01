export interface RootCause {
  hint: string;
  likelyCause: string;
  suggestedAction: string;
  isLikelySystematic: boolean;
}

const ROOT_CAUSE_MAP: Record<string, RootCause> = {
  'verification-failed:signature': { hint: 'concurrent_wallet_access', likelyCause: 'Multiple agents sharing one wallet cause nonce conflicts', suggestedAction: 'Use separate wallets per agent, or enable Helix nonce manager', isLikelySystematic: true },
  'payment-insufficient:balance': { hint: 'underfunded_wallet', likelyCause: 'Wallet balance too low for transaction + gas', suggestedAction: 'Top up wallet or reduce transaction amount', isLikelySystematic: false },
  'token-uninitialized:network': { hint: 'wrong_chain_config', likelyCause: 'Agent configured for wrong chain (testnet vs mainnet, or wrong L2)', suggestedAction: 'Check chainId and RPC URL configuration', isLikelySystematic: true },
  'rate-limited:auth': { hint: 'api_quota_exceeded', likelyCause: 'Too many requests to API endpoint', suggestedAction: 'Implement request queuing or upgrade API tier', isLikelySystematic: false },
  'policy-violation:policy': { hint: 'spending_limit_config', likelyCause: 'Transaction exceeds configured spending limit or allowlist', suggestedAction: 'Adjust policy limits in dashboard or split transaction', isLikelySystematic: true },
  'server-error:service': { hint: 'upstream_outage', likelyCause: 'Upstream service is down or experiencing issues', suggestedAction: 'Retry with backoff, or switch to backup endpoint', isLikelySystematic: false },
  'payment-required:service': { hint: 'payment_not_confirmed', likelyCause: 'Payment was sent but service did not receive confirmation', suggestedAction: 'Check on-chain receipt and retry with proof', isLikelySystematic: false },
  'timeout:service': { hint: 'network_congestion', likelyCause: 'Network congestion or RPC node overloaded', suggestedAction: 'Increase timeout, switch RPC endpoint, or retry later', isLikelySystematic: false },
  'tip-403:compliance': { hint: 'token_compliance_block', likelyCause: 'Token or address blocked by compliance rules', suggestedAction: 'Switch to a different stablecoin or verify address compliance', isLikelySystematic: true },
  'malformed-credential:service': { hint: 'bad_tx_encoding', likelyCause: 'Transaction parameters malformed or missing required fields', suggestedAction: 'Check transaction encoding and populate all required fields', isLikelySystematic: true },
  'swap-reverted:dex': { hint: 'dex_liquidity_or_slippage', likelyCause: 'Insufficient DEX liquidity or slippage exceeded tolerance', suggestedAction: 'Split swap into smaller amounts or increase slippage tolerance', isLikelySystematic: false },
  'cascade-failure:cascade': { hint: 'multi_agent_dependency_chain', likelyCause: 'One agent in a chain failed, causing downstream agents to fail', suggestedAction: 'Check upstream agent status, refund completed steps', isLikelySystematic: false },
  'tx-reverted:batch': { hint: 'userop_validation_failed', likelyCause: 'UserOperation validation or execution reverted on-chain', suggestedAction: 'Check calldata, gas limits, and paymaster configuration', isLikelySystematic: false },
};

export function getRootCause(code: string, category: string): RootCause | null {
  return ROOT_CAUSE_MAP[`${code}:${category}`] ?? null;
}
