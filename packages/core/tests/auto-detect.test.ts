import { describe, it, expect } from 'vitest';
import { detectSignature, applyOverrides } from '../src/engine/auto-detect.js';

describe('Auto-Detect', () => {
  it('detects viem transaction', () => {
    expect(detectSignature([{ to: '0x123', value: 1000n }]).type).toBe('viem-tx');
  });

  it('detects viem tx with nonce', () => {
    expect(detectSignature([{ to: '0x123', value: 1000n, nonce: 5 }]).type).toBe('viem-tx');
  });

  it('detects fetch-like', () => {
    expect(detectSignature(['https://api.com/pay', { method: 'POST' }]).type).toBe('fetch');
  });

  it('detects generic payment', () => {
    expect(detectSignature([{ amount: 100, currency: 'USD' }]).type).toBe('generic-payment');
  });

  it('returns unknown for unrecognized', () => {
    expect(detectSignature([42, 'hello']).type).toBe('unknown');
  });
});

describe('Apply Overrides', () => {
  it('injects nonce into viem tx', () => {
    const sig = detectSignature([{ to: '0x123', value: 1000n, nonce: 999 }]);
    const r = applyOverrides([{ to: '0x123', value: 1000n, nonce: 999 }], { nonce: 7 }, 'refresh_nonce', sig);
    expect(r).not.toBeNull();
    expect(r![0].nonce).toBe(7);
    expect(r![0].to).toBe('0x123');
    expect(r![0].value).toBe(1000n);
  });

  it('reduces value in viem tx', () => {
    const sig = detectSignature([{ to: '0x123', value: 1000n }]);
    const r = applyOverrides([{ to: '0x123', value: 1000n }], {}, 'reduce_request', sig);
    expect(r).not.toBeNull();
    expect(r![0].value).toBe(500n);
  });

  it('bumps gas in viem tx', () => {
    const sig = detectSignature([{ to: '0x123', value: 100n, gasPrice: 1000n }]);
    const r = applyOverrides([{ to: '0x123', value: 100n, gasPrice: 1000n }], {}, 'speed_up_transaction', sig);
    expect(r).not.toBeNull();
    expect(r![0].gasPrice).toBe(1300n);
  });

  it('returns null for unknown signature', () => {
    expect(applyOverrides([42], { nonce: 5 }, 'refresh_nonce', { type: 'unknown', paramIndex: -1 })).toBeNull();
  });

  it('switches endpoint for fetch', () => {
    const sig = detectSignature(['https://old.api.com']);
    const r = applyOverrides(['https://old.api.com'], { url: 'https://new.api.com' }, 'switch_endpoint', sig);
    expect(r![0]).toBe('https://new.api.com');
  });
});
