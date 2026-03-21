import { describe, it, expect } from 'vitest';
import { HelixProvider } from '../src/engine/provider.js';
import type { FailureClassification } from '../src/engine/types.js';

function f(overrides: Partial<FailureClassification> = {}): FailureClassification {
  return { code: 'payment-insufficient', category: 'balance', severity: 'high', platform: 'tempo', details: 'test', timestamp: Date.now(), ...overrides };
}

describe('HelixProvider — Category A (no provider)', () => {
  const p = new HelixProvider({});

  it('backoff_retry waits and succeeds', async () => {
    const r = await p.execute('backoff_retry', f({ code: 'rate-limited', category: 'auth' }), { retryAfter: 0.1 });
    expect(r.success).toBe(true);
    expect(r.description).toContain('Waited');
  });

  it('reduce_request returns available balance', async () => {
    const r = await p.execute('reduce_request', f(), { availableBalance: 42.5 });
    expect(r.success).toBe(true);
    expect(r.overrides.amount).toBe(42.5);
  });

  it('fix_params populates missing tx fields', async () => {
    const r = await p.execute('fix_params', f({ code: 'malformed-credential', category: 'service' }), {});
    expect(r.success).toBe(true);
    expect(r.overrides.gasLimit).toBeDefined();
    expect(r.overrides.type).toBe('eip1559');
    expect(r.overrides.maxFeePerGas).toBeDefined();
  });

  it('switch_endpoint uses alt URL', async () => {
    const r = await p.execute('switch_endpoint', f(), { altEndpoint: 'https://backup.api.com' });
    expect(r.success).toBe(true);
    expect(r.overrides.endpoint).toBe('https://backup.api.com');
  });

  it('switch_endpoint fails without alt', async () => {
    const r = await p.execute('switch_endpoint', f(), {});
    expect(r.success).toBe(false);
  });

  it('hold_and_notify pauses agent', async () => {
    const r = await p.execute('hold_and_notify', f({ code: 'server-error', category: 'service' }), {});
    expect(r.success).toBe(true);
    expect(r.overrides.paused).toBe(true);
  });

  it('extend_deadline adds 300s', async () => {
    const r = await p.execute('extend_deadline', f({ code: 'timeout', category: 'service' }), { deadline: 1000 });
    expect(r.success).toBe(true);
    expect(r.overrides.deadline).toBe(1300);
  });

  it('remove_and_resubmit excludes failed item', async () => {
    const r = await p.execute('remove_and_resubmit', f({ code: 'tx-reverted', category: 'batch' }), { failedIndex: 2, batchSize: 5 });
    expect(r.success).toBe(true);
    expect(r.overrides.excludeIndex).toBe(2);
    expect(r.overrides.newBatchSize).toBe(4);
  });

  it('refund_waterfall flags for review', async () => {
    const r = await p.execute('refund_waterfall', f({ code: 'cascade-failure', category: 'cascade' }), { failedStep: 'step-3', completedSteps: ['s1', 's2'] });
    expect(r.success).toBe(true);
    expect(r.overrides.refundRequired).toBe(true);
    expect(r.overrides.failedStep).toBe('step-3');
  });

  it('retry_with_receipt does simple retry without RPC', async () => {
    const r = await p.execute('retry_with_receipt', f({ code: 'server-error', category: 'service' }), {});
    expect(r.success).toBe(true);
    expect(r.description).toContain('Retry');
  });
});

describe('HelixProvider — Category B (rpcUrl needed)', () => {
  it('refresh_nonce mock-executes in dev mode', async () => {
    const p = new HelixProvider({});
    const r = await p.execute('refresh_nonce', f({ code: 'verification-failed', category: 'signature' }), {});
    expect(r.success).toBe(true);
    expect(r.description).toContain('MOCK');
  });

  it('refresh_nonce fails with explicit config but no rpcUrl', async () => {
    const p = new HelixProvider({ privy: { appId: 'x', appSecret: 'y' } });
    const r = await p.execute('refresh_nonce', f({ code: 'verification-failed', category: 'signature' }), {});
    expect(r.success).toBe(false);
    expect(r.description).toContain('No RPC URL');
  });

  it('switch_network fails with explicit config but no rpcUrl', async () => {
    const p = new HelixProvider({ privy: { appId: 'x', appSecret: 'y' } });
    const r = await p.execute('switch_network', f({ code: 'token-uninitialized', category: 'network' }), {});
    expect(r.success).toBe(false);
  });

  // Real RPC tests are in examples/real-chain/ — require live endpoint
});

describe('HelixProvider — Category C (privateKey needed)', () => {
  it('self_pay_gas fails with rpcUrl only', async () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com' });
    const r = await p.execute('self_pay_gas', f(), { to: '0x1234567890abcdef1234567890abcdef12345678' });
    expect(r.success).toBe(false);
    expect(r.description).toContain('No private key');
  });

  it('cancel_pending_txs fails without wallet', async () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com' });
    const r = await p.execute('cancel_pending_txs', f({ code: 'verification-failed', category: 'signature' }), {});
    expect(r.success).toBe(false);
  });

  it('speed_up_transaction fails without wallet', async () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com' });
    const r = await p.execute('speed_up_transaction', f({ code: 'timeout' }), { to: '0x1234', nonce: 5 });
    expect(r.success).toBe(false);
  });

  it('split_transaction fails without wallet', async () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com' });
    const r = await p.execute('split_transaction', f({ code: 'policy-violation', category: 'policy' }), {});
    expect(r.success).toBe(false);
  });

  it('topup_from_reserve fails without wallet', async () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com' });
    const r = await p.execute('topup_from_reserve', f(), {});
    expect(r.success).toBe(false);
  });

  it('swap_currency fails without wallet (explicit config)', async () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com' });
    const r = await p.execute('swap_currency', f(), {});
    expect(r.success).toBe(false);
  });
});

describe('HelixProvider — canExecute', () => {
  it('mock/dev mode allows everything', () => {
    const p = new HelixProvider({});
    expect(p.canExecute('backoff_retry')).toBe(true);
    expect(p.canExecute('refresh_nonce')).toBe(true);
    expect(p.canExecute('self_pay_gas')).toBe(true);
  });

  it('rpcUrl only: Cat A + B, not C', () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com' });
    expect(p.canExecute('backoff_retry')).toBe(true);
    expect(p.canExecute('refresh_nonce')).toBe(true);
    expect(p.canExecute('switch_network')).toBe(true);
    expect(p.canExecute('self_pay_gas')).toBe(false);
    expect(p.canExecute('swap_currency')).toBe(false);
  });

  it('rpcUrl + privateKey: all strategies', () => {
    const p = new HelixProvider({ rpcUrl: 'https://rpc.test.com', privateKey: '0x' + 'ab'.repeat(32) });
    expect(p.canExecute('refresh_nonce')).toBe(true);
    expect(p.canExecute('self_pay_gas')).toBe(true);
    expect(p.canExecute('cancel_pending_txs')).toBe(true);
    expect(p.canExecute('split_transaction')).toBe(true);
    expect(p.canExecute('swap_currency')).toBe(true);
  });

  it('privy config (no rpcUrl): only Cat A', () => {
    const p = new HelixProvider({ privy: { appId: 'x', appSecret: 'y' } });
    expect(p.canExecute('backoff_retry')).toBe(true);
    expect(p.canExecute('refresh_nonce')).toBe(false);
    expect(p.canExecute('self_pay_gas')).toBe(false);
  });
});
