import type { FailureClassification } from '../../core/types.js';

export function tempoPerceive(error: Error, _context?: Record<string, unknown>): FailureClassification | null {
  const msg = error.message;

  // MPP protocol errors — check structured code first
  const errAny = error as unknown as Record<string, unknown>;
  const errorCode = (errAny.code ?? errAny.errorCode ?? '') as string;

  if (errorCode === 'payment-insufficient' || msg.includes('insufficient balance') || msg.includes('payment-insufficient'))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (errorCode === 'invalid-challenge' || (msg.includes('session') && (msg.includes('expired') || msg.includes('invalid-challenge'))))
    return { code: 'invalid-challenge', category: 'session', severity: 'medium', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (errorCode === 'method-unsupported' || msg.includes('method-unsupported') || (msg.includes('requires') && msg.includes('payment')))
    return { code: 'method-unsupported', category: 'currency', severity: 'medium', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (errorCode === 'verification-failed' || msg.includes('nonce mismatch') || msg.includes('verification-failed'))
    return { code: 'verification-failed', category: 'signature', severity: 'high', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (errorCode === 'tx-reverted' || (msg.includes('batch') && msg.includes('reverted')))
    return { code: 'tx-reverted', category: 'batch', severity: 'high', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (msg.includes('HTTP 500') && msg.includes('receipt'))
    return { code: 'payment-required', category: 'service', severity: 'critical', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (errorCode === 'swap-reverted' || msg.includes('slippage'))
    return { code: 'swap-reverted', category: 'dex', severity: 'medium', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (msg.includes('TIP-403') || msg.includes('compliance'))
    return { code: 'tip-403', category: 'compliance', severity: 'critical', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (msg.includes('paused'))
    return { code: 'tip-403', category: 'compliance', severity: 'critical', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (errorCode === 'cascade-failure' || msg.includes('cascade') || msg.includes('waterfall'))
    return { code: 'cascade-failure', category: 'cascade', severity: 'critical', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (errorCode === 'offramp-failed' || msg.includes('offramp') || msg.includes('bank transfer'))
    return { code: 'offramp-failed', category: 'offramp', severity: 'high', platform: 'tempo', details: msg, timestamp: Date.now() };

  if (msg.includes('sponsor') && msg.includes('exhausted'))
    return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform: 'tempo', details: msg, timestamp: Date.now() };

  // TIP20 Uninitialized
  if (msg.includes('Uninitialized') || msg.includes('token error'))
    return { code: 'token-uninitialized', category: 'network', severity: 'high', platform: 'tempo', details: msg, timestamp: Date.now() };

  return null; // not a Tempo error, try next adapter
}
