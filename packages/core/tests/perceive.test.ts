import { describe, it, expect } from 'vitest';
import { tempoPerceive } from '../src/platforms/tempo/perceive.js';
import { privyPerceive } from '../src/platforms/privy/perceive.js';
import { genericPerceive } from '../src/platforms/generic/perceive.js';

describe('Tempo perceive', () => {
  it('classifies insufficient balance', () => {
    const error = new Error('Payment of 500 USDC failed: insufficient balance (have 12.50 USDC)');
    (error as any).code = 'payment-insufficient';
    const r = tempoPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('payment-insufficient');
    expect(r!.category).toBe('balance');
    expect(r!.platform).toBe('tempo');
  });

  it('classifies session expired', () => {
    const error = new Error('MPP session sess_7x2k expired at 2026-03-18T10:00:00Z');
    (error as any).code = 'invalid-challenge';
    const r = tempoPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.category).toBe('session');
  });

  it('classifies nonce mismatch', () => {
    const error = new Error('Transaction signature invalid: nonce mismatch (expected 42, got 41)');
    const r = tempoPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('verification-failed');
    expect(r!.category).toBe('signature');
  });

  it('classifies TIP20 Uninitialized (real mppx error)', () => {
    const error = new Error('TIP20 token error: Uninitialized');
    const r = tempoPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('token-uninitialized');
    expect(r!.category).toBe('network');
  });

  it('classifies batch revert', () => {
    const error = new Error('Batch tx reverted: item 3/5 failed (recipient 0xdead not found)');
    (error as any).code = 'tx-reverted';
    const r = tempoPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('tx-reverted');
    expect(r!.category).toBe('batch');
  });

  it('classifies DEX slippage', () => {
    const error = new Error('Swap reverted: slippage exceeded 1%');
    const r = tempoPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('swap-reverted');
    expect(r!.category).toBe('dex');
  });

  it('classifies TIP-403 compliance', () => {
    const error = new Error('TIP-403: USDT transfer blocked by compliance policy');
    const r = tempoPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('tip-403');
    expect(r!.category).toBe('compliance');
  });

  it('returns null for unknown errors', () => {
    const error = new Error('Some random application error');
    const r = tempoPerceive(error);
    expect(r).toBeNull();
  });
});

describe('Privy perceive', () => {
  it('classifies policy violation', () => {
    const error = new Error('Privy policy engine rejected transaction: AMOUNT_EXCEEDS_LIMIT');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('policy-violation');
    expect(r!.category).toBe('policy');
    expect(r!.platform).toBe('privy');
  });

  it('classifies nonce desync', () => {
    const error = new Error('Transaction nonce mismatch: wallet internal nonce=47 but chain nonce=45');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('verification-failed');
    expect(r!.category).toBe('signature');
  });

  it('classifies gas sponsor depleted', () => {
    const error = new Error('Privy automated gas sponsorship balance depleted');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('payment-insufficient');
    expect(r!.category).toBe('balance');
  });

  it('classifies cross-chain mismatch', () => {
    const error = new Error('Privy wallet wlt_stu901 is provisioned on Ethereum mainnet — chain mismatch');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('token-uninitialized');
    expect(r!.category).toBe('network');
  });

  it('classifies insufficient funds (new scenario)', () => {
    const error = new Error('Privy wallet wlt_abc123: insufficient funds for this transaction. Balance: 12.50 USDC');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('payment-insufficient');
    expect(r!.category).toBe('balance');
  });

  it('classifies broadcast nonce conflict (new scenario)', () => {
    const error = new Error('transaction_broadcast_failure: Nonce conflicts or sequencing errors');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('verification-failed');
    expect(r!.category).toBe('signature');
  });

  it('classifies broadcast invalid params (new scenario)', () => {
    const error = new Error('transaction_broadcast_failure: Invalid transaction parameters — malformed data');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('malformed-credential');
    expect(r!.category).toBe('service');
  });

  it('returns null for auth errors (not our job)', () => {
    const error = new Error('missing_or_empty_authorization_header');
    const r = privyPerceive(error);
    expect(r).toBeNull();
  });

  it('returns null for session key errors (not our job)', () => {
    const error = new Error('user_session_keys_expired');
    const r = privyPerceive(error);
    expect(r).toBeNull();
  });

  it('perceives privy signing failure', () => {
    const error = new Error('privy embedded wallet signing failed: key derivation error');
    const r = privyPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('verification-failed');
    expect(r!.category).toBe('signature');
    expect(r!.platform).toBe('privy');
  });
});

describe('Generic perceive', () => {
  it('classifies 429', () => {
    const error = new Error('429 Too Many Requests');
    const r = genericPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('rate-limited');
    expect(r!.category).toBe('auth');
    expect(r!.platform).toBe('generic');
  });

  it('classifies 500', () => {
    const error = new Error('HTTP 500 Internal Server Error');
    const r = genericPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('server-error');
    expect(r!.category).toBe('service');
  });

  it('classifies timeout', () => {
    const error = new Error('ETIMEDOUT: Request exceeded 10000ms timeout');
    const r = genericPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('timeout');
    expect(r!.category).toBe('service');
  });

  it('classifies connection refused', () => {
    const error = new Error('ECONNREFUSED');
    const r = genericPerceive(error);
    expect(r).not.toBeNull();
    expect(r!.code).toBe('server-error');
  });
});
