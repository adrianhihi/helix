import type { FailureClassification } from '../../engine/types.js';

// ONLY client-side failures that Helix can actually fix.
// Server-side Privy infra failures (TEE down, signing timeout) are NOT included.

export function privyPerceive(error: Error, _context?: Record<string, unknown>): FailureClassification | null {
  const msg = error.message;

  // Policy spending limit — Helix can split transaction
  if (msg.includes('policy') && (msg.includes('AMOUNT_EXCEEDS_LIMIT') || msg.includes('spending limit') || msg.includes('policy violation')))
    return { code: 'policy-violation', category: 'policy', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // Nonce desync — wallet internal nonce != chain nonce
  if (msg.includes('nonce') && msg.includes('mismatch') && (msg.includes('wallet') || msg.includes('internal')))
    return { code: 'verification-failed', category: 'signature', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // Gas sponsor exhausted — Privy auto-sponsor ran out
  if (msg.includes('gas sponsorship') || (msg.includes('sponsor') && msg.includes('depleted')))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // Cross-chain mismatch — wallet provisioned on wrong chain
  if (msg.includes('chain') && msg.includes('mismatch') && (msg.includes('wallet') || msg.includes('provisioned')))
    return { code: 'token-uninitialized', category: 'network', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // Embedded wallet locked
  if (msg.includes('wallet locked') || msg.includes('embedded wallet locked'))
    return { code: 'wallet-locked', category: 'auth', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // Gas limit exceeded
  if (msg.includes('gas limit exceeded') || msg.includes('gas limit'))
    return { code: 'gas-limit-exceeded', category: 'gas', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // Rate limit (Privy SDK includes status code in message: "429 Rate limit exceeded")
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit'))
    return { code: 'rate-limited', category: 'auth', severity: 'medium', platform: 'privy', details: msg, timestamp: Date.now() };

  // Privy server errors (500)
  if (msg.includes('500') || msg.toLowerCase().includes('internal server error'))
    return { code: 'server-error', category: 'service', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // Insufficient funds (broader pattern — Privy SDK format: "400 Bad request: insufficient funds...")
  if (msg.includes('insufficient funds'))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // #NEW-1: Insufficient wallet balance (not gas, actual tx value)
  if (msg.includes('insufficient funds') && msg.includes('transaction') && !msg.includes('gas'))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // #NEW-2: Transaction broadcast failure — nonce conflict
  if (msg.includes('broadcast') && (msg.includes('nonce') || msg.includes('sequencing')))
    return { code: 'verification-failed', category: 'signature', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  // #NEW-3: Transaction broadcast failure — invalid params
  if (msg.includes('broadcast') && (msg.includes('invalid') || msg.includes('malformed')))
    return { code: 'malformed-credential', category: 'service', severity: 'medium', platform: 'privy', details: msg, timestamp: Date.now() };

  // #NEW-4: Embedded wallet signing failure — key derivation or HSM error
  if (msg.includes('signing') && (msg.includes('failed') || msg.includes('error')) && (msg.includes('wallet') || msg.includes('key derivation') || msg.includes('privy')))
    return { code: 'verification-failed', category: 'signature', severity: 'high', platform: 'privy', details: msg, timestamp: Date.now() };

  return null; // not a Privy error
}
