import type { FailureClassification } from '../../core/types.js';

// PLACEHOLDER — Stripe payment failure patterns
// Will be implemented in a future PR

export function stripePerceive(error: Error, _context?: Record<string, unknown>): FailureClassification | null {
  const msg = error.message;

  // Stripe-specific error patterns (placeholder)
  if (msg.includes('card_declined'))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform: 'stripe', details: msg, timestamp: Date.now() };

  if (msg.includes('expired_card'))
    return { code: 'payment-expired', category: 'session', severity: 'high', platform: 'stripe', details: msg, timestamp: Date.now() };

  if (msg.includes('rate_limit'))
    return { code: 'rate-limited', category: 'auth', severity: 'medium', platform: 'stripe', details: msg, timestamp: Date.now() };

  return null;
}
