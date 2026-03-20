import type { FailureClassification } from '../../core/types.js';

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

  return null; // not a Privy error
}
