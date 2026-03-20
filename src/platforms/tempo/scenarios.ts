// 13 Tempo demo scenarios — matching helix-tempo's proven set

export interface DemoScenario {
  id: number;
  name: string;
  errorCode: string;
  errorMessage: string;
  tag: 'live' | 'mock' | 'vision' | 'real';
}

export const tempoScenarios: DemoScenario[] = [
  { id: 1, name: 'Insufficient Balance', errorCode: 'payment-insufficient', errorMessage: 'Payment of 500 USDC failed: insufficient balance (have 12.50 USDC)', tag: 'live' },
  { id: 2, name: 'Session Expired', errorCode: 'invalid-challenge', errorMessage: 'MPP session sess_7x2k expired at 2026-03-18T10:00:00Z', tag: 'live' },
  { id: 3, name: 'Currency Mismatch', errorCode: 'method-unsupported', errorMessage: 'Service requires EURC payment, agent holds USDC', tag: 'live' },
  { id: 4, name: 'Signature Failure', errorCode: 'verification-failed', errorMessage: 'Transaction signature invalid: nonce mismatch (expected 42, got 41)', tag: 'live' },
  { id: 5, name: 'Batch Revert', errorCode: 'tx-reverted', errorMessage: 'Batch tx reverted: item 3/5 failed (recipient 0xdead not found)', tag: 'live' },
  { id: 6, name: 'Service Down', errorCode: 'payment-required', errorMessage: 'HTTP 500 from api.service.com after payment — receipt txn_abc123 is valid', tag: 'mock' },
  { id: 7, name: 'DEX Slippage', errorCode: 'swap-reverted', errorMessage: 'Swap reverted: slippage exceeded 1% (actual 3.2%) on USDC→EURC pool', tag: 'mock' },
  { id: 8, name: 'Compliance Block', errorCode: 'tip-403', errorMessage: 'TIP-403: USDT transfer blocked by compliance policy for jurisdiction EU-RESTRICTED', tag: 'mock' },
  { id: 9, name: 'Cascade Failure', errorCode: 'cascade-failure', errorMessage: 'Agent chain A→B→C: agent C payment failed, waterfall refund needed', tag: 'vision' },
  { id: 10, name: 'Off-Ramp Failed', errorCode: 'offramp-failed', errorMessage: 'Bank transfer to IBAN DE89... failed: provider Moonpay returned error 503', tag: 'vision' },
  { id: 11, name: 'Token Pause', errorCode: 'tip-403', errorMessage: 'USDT contract paused by issuer — all transfers blocked', tag: 'mock' },
  { id: 12, name: 'Sponsor Exhausted', errorCode: 'payment-insufficient', errorMessage: 'Gas sponsor wallet exhausted — agent cannot submit transactions', tag: 'mock' },
  { id: 13, name: 'Network Mismatch', errorCode: 'token-uninitialized', errorMessage: 'Uninitialized token account: USDC not deployed on Tempo testnet', tag: 'real' },
];
