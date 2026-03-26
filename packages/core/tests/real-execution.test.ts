import { describe, it, expect, vi, afterEach } from 'vitest';
import { wrap, shutdown } from '../src/engine/wrap.js';

afterEach(() => { shutdown(); });

describe('Real Execution — renew_session', () => {
  it('calls sessionRefresher on session expired error', async () => {
    let callCount = 0;
    const refresher = vi.fn().mockResolvedValue({ authorization: 'Bearer new-token' });

    const fn = async (req: { url: string; headers?: Record<string, string> }) => {
      callCount++;
      if (callCount === 1) throw new Error('session expired, please re-authenticate');
      return { status: 200 };
    };

    const safe = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      sessionRefresher: refresher,
    });

    await safe({ url: 'https://api.privy.io/transfer' });
    expect(refresher).toHaveBeenCalled();
    expect(callCount).toBe(2);
  });

  it('retries without refresher if not provided', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('session expired, please re-authenticate');
      return 'ok';
    };

    const safe = wrap(fn, { mode: 'auto', geneMapPath: ':memory:', logLevel: 'silent' });
    const result = await safe();
    expect(String(result)).toBe('ok');
    expect(callCount).toBe(2);
  });
});

describe('Real Execution — split_transaction', () => {
  it('splits generic payment amount into 2 parts', async () => {
    const calls: number[] = [];
    const fn = async (payment: { amount: number; to: string }) => {
      calls.push(payment.amount);
      if (payment.amount > 50) throw new Error('max per user op spend limit exceeded');
      return { status: 'sent' };
    };

    const safe = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      splitConfig: { parts: 2, delayMs: 10 },
    });

    const result = await safe({ amount: 100, to: '0x456' });
    expect(calls).toContain(50);
  });
});

describe('Real Execution — remove_and_resubmit', () => {
  it('removes nonce and bumps gas on resubmit', async () => {
    let callCount = 0;
    let lastTx: any = null;

    const fn = async (tx: { to: string; value: bigint; nonce?: number; gasPrice?: bigint }) => {
      callCount++;
      lastTx = { ...tx };
      if (callCount === 1) throw new Error('EXECUTION_REVERTED (-32521): UserOperation execution reverted');
      return { hash: '0xabc' };
    };

    const safe = wrap(fn, { mode: 'auto', geneMapPath: ':memory:', logLevel: 'silent' });
    await safe({ to: '0x123', value: 100n, nonce: 5, gasPrice: 1000n });

    expect(callCount).toBe(2);
    // nonce should be removed (undefined) for auto-assign
    expect(lastTx.nonce).toBeUndefined();
    // gasPrice should be bumped by 30%
    expect(lastTx.gasPrice).toBe(1300n);
  });
});

describe('Real Execution — backoff_retry', () => {
  it('has exponential delay', { timeout: 15000 }, async () => {
    const callTimes: number[] = [];
    let callCount = 0;
    const fn = async () => {
      callTimes.push(Date.now());
      callCount++;
      if (callCount <= 2) throw new Error('HTTP 429: Too Many Requests');
      return 'ok';
    };
    const safe = wrap(fn, { mode: 'auto', geneMapPath: ':memory:', logLevel: 'silent' });
    await safe();
    expect(callCount).toBe(3);
    if (callTimes.length >= 3) {
      const gap = callTimes[1] - callTimes[0];
      expect(gap).toBeGreaterThan(800); // ~1s with tolerance
    }
  });
});
