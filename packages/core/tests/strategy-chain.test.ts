import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';
import { detectStrategyChain, isChainStrategy, parseChainSteps } from '../src/engine/chain.js';
import type { RepairCandidate } from '../src/engine/types.js';

const baseCandidates: RepairCandidate[] = [
  {
    id: 'c1', strategy: 'refresh_nonce', description: 'Refresh nonce',
    estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: [],
    score: 0, successProbability: 0.8, platform: 'tempo',
  },
];

describe('detectStrategyChain', () => {
  it('detects nonce + gas compound error', () => {
    const result = detectStrategyChain(
      'nonce mismatch: expected 5, got 3; also gas estimation failed',
      baseCandidates,
    );
    expect(result.length).toBe(2); // original + chain
    const chain = result.find(c => c.strategy.includes('+'));
    expect(chain).toBeDefined();
    expect(chain!.strategy).toBe('refresh_nonce+speed_up_transaction');
    expect(chain!.steps).toEqual([
      { strategy: 'refresh_nonce', stopOnFailure: true },
      { strategy: 'speed_up_transaction', stopOnFailure: true },
    ]);
  });

  it('detects balance + gas compound', () => {
    const result = detectStrategyChain(
      'insufficient balance for gas fee',
      baseCandidates,
    );
    const chain = result.find(c => c.strategy.includes('+'));
    expect(chain).toBeDefined();
    expect(chain!.strategy).toBe('reduce_request+speed_up_transaction');
  });

  it('detects session + nonce compound', () => {
    const result = detectStrategyChain(
      'session expired; nonce is stale',
      baseCandidates,
    );
    const chain = result.find(c => c.strategy.includes('+'));
    expect(chain).toBeDefined();
    expect(chain!.strategy).toBe('renew_session+refresh_nonce');
  });

  it('does not trigger on single-issue error', () => {
    const result = detectStrategyChain(
      'nonce mismatch: expected 5, got 3',
      baseCandidates,
    );
    expect(result.length).toBe(1); // no chain added
  });

  it('chain candidate has source=adapter', () => {
    const result = detectStrategyChain(
      'nonce problem and gas too low',
      baseCandidates,
    );
    const chain = result.find(c => c.steps);
    expect(chain!.source).toBe('adapter');
  });
});

describe('isChainStrategy', () => {
  it('returns true for chain strategy', () => {
    expect(isChainStrategy('refresh_nonce+speed_up_transaction')).toBe(true);
  });

  it('returns false for single strategy', () => {
    expect(isChainStrategy('refresh_nonce')).toBe(false);
  });
});

describe('parseChainSteps', () => {
  it('parses chain into steps', () => {
    const steps = parseChainSteps('refresh_nonce+speed_up_transaction');
    expect(steps).toEqual([
      { strategy: 'refresh_nonce', stopOnFailure: true },
      { strategy: 'speed_up_transaction', stopOnFailure: true },
    ]);
  });

  it('limits to 3 steps', () => {
    const steps = parseChainSteps('a+b+c+d+e');
    expect(steps.length).toBe(3);
  });
});

describe('Gene Map chain storage', () => {
  let gm: GeneMap;
  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('stores chain strategy with + separator', () => {
    gm.store({
      failureCode: 'verification-failed', category: 'signature',
      strategy: 'refresh_nonce+speed_up_transaction',
      params: {}, successCount: 1, avgRepairMs: 200,
      platforms: ['tempo'], qValue: 0.7, consecutiveFailures: 0,
    });
    const gene = gm.list().find(g => g.strategy === 'refresh_nonce+speed_up_transaction');
    expect(gene).toBeDefined();
    expect(isChainStrategy(gene!.strategy)).toBe(true);
  });

  it('chain strategy splits back into steps on lookup', () => {
    gm.store({
      failureCode: 'unknown', category: 'unknown',
      strategy: 'backoff_retry+refresh_nonce',
      params: {}, successCount: 5, avgRepairMs: 500,
      platforms: ['tempo'], qValue: 0.8, consecutiveFailures: 0,
    });
    const gene = gm.lookup('unknown', 'unknown');
    expect(gene).not.toBeNull();
    const steps = parseChainSteps(gene!.strategy);
    expect(steps).toEqual([
      { strategy: 'backoff_retry', stopOnFailure: true },
      { strategy: 'refresh_nonce', stopOnFailure: true },
    ]);
  });
});

describe('Chain override propagation', () => {
  it('step1 overrides are visible to step2 via context', async () => {
    const { HelixProvider } = await import('../src/engine/provider.js');
    const provider = new HelixProvider(); // mock/dev mode

    // Spy on execute to capture what context each step receives
    const calls: { strategy: string; context: Record<string, unknown> | undefined }[] = [];
    const origExecute = provider.execute.bind(provider);
    provider.execute = async (strategy, failure, context) => {
      calls.push({ strategy, context: context ? { ...context } : undefined });
      // Simulate refresh_nonce returning a nonce override
      if (strategy === 'refresh_nonce') {
        return { success: true, overrides: { nonce: 42 }, description: 'nonce=42' };
      }
      return origExecute(strategy, failure, context);
    };

    // Access executeChain via PcecEngine
    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    const engine = new PcecEngine(gm, 'override-test', { mode: 'auto' } as any);

    // Replace the provider with our spy
    (engine as any).provider = provider;

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    // Store a chain gene so it takes the IMMUNE+execute path
    gm.store({
      failureCode: 'verification-failed', category: 'signature',
      strategy: 'refresh_nonce+speed_up_transaction',
      params: {}, successCount: 10, avgRepairMs: 200,
      platforms: ['tempo'], qValue: 0.9, consecutiveFailures: 0,
    });

    await engine.repair(
      new Error('nonce mismatch'),
      { to: '0x1234567890abcdef1234567890abcdef12345678', walletAddress: '0xabc' },
    );

    // step1 = refresh_nonce, step2 = speed_up_transaction
    expect(calls.length).toBe(2);
    expect(calls[0].strategy).toBe('refresh_nonce');
    expect(calls[1].strategy).toBe('speed_up_transaction');

    // The critical check: step2 sees nonce=42 from step1's overrides
    expect(calls[1].context?.nonce).toBe(42);

    gm.close();
  });

  it('step2 overrides merge with step1 overrides in final result', async () => {
    const { HelixProvider } = await import('../src/engine/provider.js');
    const provider = new HelixProvider();

    provider.execute = async (strategy) => {
      if (strategy === 'backoff_retry') {
        return { success: true, overrides: { retried: true, delay: 2000 }, description: 'waited' };
      }
      if (strategy === 'refresh_nonce') {
        return { success: true, overrides: { nonce: 7 }, description: 'nonce=7' };
      }
      return { success: true, overrides: {}, description: 'mock' };
    };

    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    const engine = new PcecEngine(gm, 'merge-test', { mode: 'auto' } as any);
    (engine as any).provider = provider;

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    // Store a chain gene
    gm.store({
      failureCode: 'timeout', category: 'service',
      strategy: 'backoff_retry+refresh_nonce',
      params: {}, successCount: 10, avgRepairMs: 300,
      platforms: ['generic'], qValue: 0.9, consecutiveFailures: 0,
    });

    const result = await engine.repair(new Error('timeout'), { walletAddress: '0xabc' });

    // Combined overrides should have both step1 and step2 values
    expect(result.commitOverrides).toBeDefined();
    expect(result.commitOverrides!.retried).toBe(true);
    expect(result.commitOverrides!.delay).toBe(2000);
    expect(result.commitOverrides!.nonce).toBe(7);

    // stepsExecuted should show both steps
    expect(result.stepsExecuted).toBeDefined();
    expect(result.stepsExecuted!.length).toBe(2);
    expect(result.stepsExecuted![0].strategy).toBe('backoff_retry');
    expect(result.stepsExecuted![0].success).toBe(true);
    expect(result.stepsExecuted![1].strategy).toBe('refresh_nonce');
    expect(result.stepsExecuted![1].success).toBe(true);

    gm.close();
  });

  it('chain stops on step failure and reports partial results', async () => {
    const { HelixProvider } = await import('../src/engine/provider.js');
    const provider = new HelixProvider();

    provider.execute = async (strategy) => {
      if (strategy === 'refresh_nonce') {
        return { success: false, overrides: {}, description: 'RPC down' };
      }
      // speed_up_transaction should never be called
      return { success: true, overrides: { gasBumped: true }, description: 'bumped' };
    };

    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    const engine = new PcecEngine(gm, 'fail-test', { mode: 'auto' } as any);
    (engine as any).provider = provider;

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    gm.store({
      failureCode: 'verification-failed', category: 'signature',
      strategy: 'refresh_nonce+speed_up_transaction',
      params: {}, successCount: 10, avgRepairMs: 200,
      platforms: ['tempo'], qValue: 0.9, consecutiveFailures: 0,
    });

    const result = await engine.repair(new Error('nonce mismatch'));

    // Chain should have stopped after step1 failure
    expect(result.stepsExecuted).toBeDefined();
    expect(result.stepsExecuted!.length).toBe(1);
    expect(result.stepsExecuted![0].strategy).toBe('refresh_nonce');
    expect(result.stepsExecuted![0].success).toBe(false);

    gm.close();
  });
});

describe('PCEC chain integration', () => {
  it('single strategy still works (backward compatible)', async () => {
    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    // Clear seed genes + cache to avoid IMMUNE path
    (gm as any).db.exec('DELETE FROM genes');
    (gm as any).cache.clear();
    (gm as any).cacheLoadedAt = 0;
    const engine = new PcecEngine(gm, 'chain-test', { mode: 'observe' } as any);

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    const result = await engine.repair(new Error('nonce mismatch'));
    expect(result.winner?.strategy).toBeDefined();
    expect(result.winner?.steps).toBeUndefined();
    expect(result.stepsExecuted).toBeUndefined();

    gm.close();
  });

  it('compound error produces chain candidate in observe mode', async () => {
    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    // Clear seed genes + cache to avoid IMMUNE path
    (gm as any).db.exec('DELETE FROM genes');
    (gm as any).cache.clear();
    (gm as any).cacheLoadedAt = 0;
    const engine = new PcecEngine(gm, 'chain-test', { mode: 'observe' } as any);

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    const result = await engine.repair(
      new Error('nonce mismatch: expected 0, got 50; also gas price too low for current block'),
    );
    // Should have chain candidate among candidates
    const chainCandidate = result.candidates.find(c => c.steps && c.steps.length > 0);
    expect(chainCandidate).toBeDefined();
    expect(chainCandidate!.strategy).toContain('+');

    gm.close();
  });

  it('auto mode executes chain steps', async () => {
    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    // Clear seed genes + cache so the compound error doesn't hit IMMUNE
    (gm as any).db.exec('DELETE FROM genes');
    (gm as any).cache.clear();
    (gm as any).cacheLoadedAt = 0;
    const engine = new PcecEngine(gm, 'chain-auto', { mode: 'auto' } as any);

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    const result = await engine.repair(
      new Error('nonce mismatch and gas estimation failed'),
    );

    // If chain wins, stepsExecuted should be populated
    if (result.winner?.steps) {
      expect(result.stepsExecuted).toBeDefined();
      expect(result.stepsExecuted!.length).toBeGreaterThan(0);
    }

    gm.close();
  });
});
