import { describe, it, expect, afterEach } from 'vitest';
import { wrap, shutdown } from '../src/engine/wrap.js';

afterEach(() => { shutdown(); });

describe('Business-Level Verify', () => {

  it('verify pass — result returned normally', async () => {
    let callCount = 0;
    const fn = async (params: { amount: number }) => {
      callCount++;
      if (callCount === 1) throw new Error('nonce mismatch');
      return { amount: params.amount, status: 'success' };
    };

    const safeFn = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      verify: (result: any, args: any[]) => {
        return result.amount === args[0].amount;
      },
    });

    const result = await safeFn({ amount: 100 });
    expect(result.amount).toBe(100);
    expect(result.status).toBe('success');
  });

  it('verify fail — throws with verifyFailed flag', async () => {
    let callCount = 0;
    const fn = async (params: { amount: number }) => {
      callCount++;
      if (callCount === 1) throw new Error('nonce mismatch');
      return { amount: 50, status: 'success' }; // wrong amount
    };

    const safeFn = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      verify: (result: any, args: any[]) => {
        return result.amount === args[0].amount; // 50 !== 100
      },
    });

    try {
      await safeFn({ amount: 100 });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err._helix).toBeDefined();
      expect(err._helix.verifyFailed).toBe(true);
      expect(err.message).toContain('business verification failed');
    }
  });

  it('verify not provided — no effect', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('nonce mismatch');
      return { ok: true };
    };

    const safeFn = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
    });

    const result = await safeFn();
    expect(result.ok).toBe(true);
  });

  it('verify can be async', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('server error');
      return { txHash: '0xabc' };
    };

    const safeFn = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      verify: async (result: any) => {
        await new Promise(r => setTimeout(r, 10));
        return result.txHash.startsWith('0x');
      },
    });

    const result = await safeFn();
    expect(result.txHash).toBe('0xabc');
  });

  it('verify callback error — treated as failure', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('nonce mismatch');
      return { data: 'ok' };
    };

    const safeFn = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      verify: () => {
        throw new Error('verify crashed');
      },
    });

    try {
      await safeFn();
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.message).toBe('verify crashed');
    }
  });

  it('first call success (no repair) — verify not called', async () => {
    let verifyCalled = false;
    const fn = async () => ({ ok: true });

    const safeFn = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      verify: () => {
        verifyCalled = true;
        return true;
      },
    });

    const result = await safeFn();
    expect(result.ok).toBe(true);
    expect(verifyCalled).toBe(false);
  });

  it('verify receives original args, not modified args', async () => {
    let callCount = 0;
    let capturedArgs: unknown[] | null = null;

    const fn = async (params: { to: string; amount: number }) => {
      callCount++;
      if (callCount === 1) throw new Error('nonce mismatch');
      return { to: params.to, amount: params.amount };
    };

    const safeFn = wrap(fn, {
      mode: 'auto',
      geneMapPath: ':memory:',
      logLevel: 'silent',
      verify: (result: any, originalArgs: any[]) => {
        capturedArgs = originalArgs;
        return true;
      },
    });

    await safeFn({ to: '0xRecipient', amount: 100 });
    expect(capturedArgs).not.toBeNull();
    expect((capturedArgs![0] as any).to).toBe('0xRecipient');
    expect((capturedArgs![0] as any).amount).toBe(100);
  });
});
