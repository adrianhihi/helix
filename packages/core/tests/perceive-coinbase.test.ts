import { describe, it, expect } from 'vitest';
import { coinbasePerceive } from '../src/platforms/coinbase/perceive.js';

describe('Coinbase perceive', () => {
  // CDP API errors
  it('classifies rate_limit_exceeded', () => {
    const r = coinbasePerceive(new Error('CDP API: rate_limit_exceeded'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('rate-limited');
    expect(r!.platform).toBe('coinbase');
  });

  it('classifies internal_server_error', () => {
    const r = coinbasePerceive(new Error('CDP API: internal_server_error'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('server-error');
  });

  it('classifies malformed_transaction', () => {
    const r = coinbasePerceive(new Error('malformed_transaction — Malformed unsigned transaction'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('malformed-credential');
  });

  it('classifies transfer_quote_expired', () => {
    const r = coinbasePerceive(new Error('transfer_quote_expired'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('session');
  });

  it('classifies transfer_amount_out_of_bounds', () => {
    const r = coinbasePerceive(new Error('transfer_amount_out_of_bounds'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('balance');
  });

  it('classifies idempotency_error', () => {
    const r = coinbasePerceive(new Error('422 idempotency_error'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('malformed-credential');
  });

  // Paymaster / Bundler
  it('classifies GAS_ESTIMATION_ERROR', () => {
    const r = coinbasePerceive(new Error('GAS_ESTIMATION_ERROR (-32004): Gas estimation failed'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('gas');
    expect(r!.code).toBe('gas-estimation-failed');
  });

  it('classifies AA25 nonce', () => {
    const r = coinbasePerceive(new Error('AA25 Invalid account nonce'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('signature');
  });

  it('classifies EXECUTION_REVERTED', () => {
    const r = coinbasePerceive(new Error('EXECUTION_REVERTED (-32521)'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('batch');
  });

  it('classifies per user op spend limit', () => {
    const r = coinbasePerceive(new Error('rejected due to max per user op spend limit exceeded'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('policy');
  });

  it('classifies monthly org spend limit', () => {
    const r = coinbasePerceive(new Error('rejected due to max monthly org spend limit'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('policy');
  });

  it('classifies AA21 prefund', () => {
    const r = coinbasePerceive(new Error("AA21 didn't pay prefund"));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('balance');
  });

  it('classifies AA13 initCode OOG', () => {
    const r = coinbasePerceive(new Error('AA13 initCode failed or OOG'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('balance');
  });

  it('classifies SHORT_DEADLINE', () => {
    const r = coinbasePerceive(new Error('SHORT_DEADLINE (-32503)'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('timeout');
  });

  // x402
  it('classifies x402 insufficient USDC', () => {
    const r = coinbasePerceive(new Error('insufficient USDC token balance for 402 payment'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('balance');
  });

  it('classifies x402 wrong network', () => {
    const r = coinbasePerceive(new Error('wallet connected to wrong network for payment'));
    expect(r).not.toBeNull();
    expect(r!.category).toBe('network');
  });

  it('classifies x402 scheme not registered', () => {
    const r = coinbasePerceive(new Error('payment scheme not registered for this network'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('malformed-credential');
  });

  it('classifies RPC rate limit', () => {
    const r = coinbasePerceive(new Error('RPC rate limit exceeded'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('rate-limited');
  });

  // Should NOT match
  it('returns null for unrelated errors', () => {
    expect(coinbasePerceive(new Error('some unrelated application error'))).toBeNull();
  });

  it('classifies unauthorized as auth', () => {
    const r = coinbasePerceive(new Error('unauthorized'));
    expect(r).not.toBeNull();
    expect(r!.code).toBe('rate-limited');
    expect(r!.category).toBe('auth');
  });
});
