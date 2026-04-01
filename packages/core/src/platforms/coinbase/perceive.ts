import type { FailureClassification, Platform } from '../../engine/types.js';

export function coinbasePerceive(error: Error, _context?: Record<string, unknown>): FailureClassification | null {
  const msg = error.message;
  const platform: Platform = 'coinbase';

  // ── CDP API / Server Wallet Errors ──

  if (msg.toLowerCase().includes('unauthorized') || (msg.toLowerCase().includes('api key') && (msg.includes('invalid') || msg.includes('expired'))))
    return { code: 'rate-limited', category: 'auth', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('rate_limit_exceeded') || (msg.includes('429') && msg.includes('cdp')))
    return { code: 'rate-limited', category: 'auth', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('faucet_limit_exceeded') || (msg.toLowerCase().includes('faucet') && msg.toLowerCase().includes('limit')))
    return { code: 'rate-limited', category: 'auth', severity: 'low', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('transfer_quote_expired') || (msg.includes('quote') && msg.includes('expired')))
    return { code: 'invalid-challenge', category: 'session', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('transfer_amount_out_of_bounds') || (msg.includes('amount') && msg.includes('out of bounds')))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('idempotency_error') || (msg.includes('422') && msg.includes('idempotency')))
    return { code: 'malformed-credential', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('malformed_transaction') || msg.includes('Malformed unsigned transaction'))
    return { code: 'malformed-credential', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('internal_server_error') || (msg.includes('500') && msg.includes('cdp')))
    return { code: 'server-error', category: 'service', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('bad_gateway') || (msg.includes('502') && !msg.includes('x402')))
    return { code: 'server-error', category: 'service', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('service_unavailable') || (msg.includes('503') && !msg.includes('x402') && !msg.includes('-32503')))
    return { code: 'server-error', category: 'service', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('network_timeout') || (msg.includes('timed_out') && !msg.includes('gateway')))
    return { code: 'timeout', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('504') || (msg.includes('timed_out') && msg.includes('gateway')))
    return { code: 'timeout', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('network_connection_failed'))
    return { code: 'server-error', category: 'service', severity: 'high', platform, details: msg, timestamp: Date.now() };

  // ── Gas / Fee Errors ──

  if (msg.includes('underpriced') || msg.includes('replacement transaction'))
    return { code: 'gas-underpriced', category: 'gas', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.toLowerCase().includes('gas') && (msg.toLowerCase().includes('too low') || msg.toLowerCase().includes('intrinsic gas')))
    return { code: 'gas-too-low', category: 'gas', severity: 'high', platform, details: msg, timestamp: Date.now() };

  // ── Paymaster / Bundler / ERC-4337 Errors ──

  if (msg.includes('paymaster') && (msg.includes('deposit') || msg.includes('balance')) && (msg.includes('low') || msg.includes('insufficient')))
    return { code: 'paymaster-balance-low', category: 'balance', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('GAS_ESTIMATION_ERROR') || msg.includes('-32004') || msg.includes('Gas estimation failed'))
    return { code: 'gas-estimation-failed', category: 'gas', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('AA25') || msg.includes('Invalid account nonce'))
    return { code: 'verification-failed', category: 'signature', severity: 'high', platform, details: msg, timestamp: Date.now() };

  // ERC20 balance exceeded (must be before generic revert check)
  if (msg.toLowerCase().includes('exceeds balance') || (msg.includes('ERC20') && msg.includes('transfer amount')))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('EXECUTION_REVERTED') || msg.includes('-32521') || msg.toLowerCase().includes('execution reverted'))
    return { code: 'tx-reverted', category: 'batch', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('AA21') || msg.includes("didn't pay prefund"))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('AA13') || msg.includes('initCode failed'))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('max per user op spend limit'))
    return { code: 'policy-violation', category: 'policy', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('max monthly org spend limit'))
    return { code: 'policy-violation', category: 'policy', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('max global usd spend limit'))
    return { code: 'policy-violation', category: 'policy', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('maximum per address transaction count'))
    return { code: 'policy-violation', category: 'policy', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('maximum per address sponsorship'))
    return { code: 'policy-violation', category: 'policy', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('INVALID_FIELDS') || msg.includes('-32602') || msg.includes('INVALID_ARGUMENT'))
    return { code: 'malformed-credential', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('paymaster') && (msg.includes('signature') || msg.includes('verification')))
    return { code: 'verification-failed', category: 'signature', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('INTERNAL_ERROR') && msg.includes('paymaster'))
    return { code: 'server-error', category: 'service', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('UNAVAILABLE_ERROR') || msg.includes('-32003'))
    return { code: 'server-error', category: 'service', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('SHORT_DEADLINE') || msg.includes('-32503') || msg.includes('deadline too short'))
    return { code: 'timeout', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  // ── x402 Payment Protocol Errors ──

  if (msg.includes('insufficient') && (msg.includes('USDC') || msg.includes('token balance')) && msg.includes('402'))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('wrong network') || (msg.includes('different network') && msg.includes('payment')))
    return { code: 'token-uninitialized', category: 'network', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('scheme') && msg.includes('not') && (msg.includes('registered') || msg.includes('found')))
    return { code: 'malformed-credential', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('x402Version') || (msg.includes('payload') && msg.includes('version') && msg.includes('mismatch')))
    return { code: 'malformed-credential', category: 'service', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('x402') && msg.includes('payment'))
    return { code: 'token-uninitialized', category: 'network', severity: 'high', platform, details: msg, timestamp: Date.now() };

  if (msg.includes('RPC') && (msg.includes('rate') || msg.includes('limit') || msg.includes('unavailable')))
    return { code: 'rate-limited', category: 'auth', severity: 'medium', platform, details: msg, timestamp: Date.now() };

  return null;
}
