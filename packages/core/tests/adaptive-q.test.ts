import { describe, it, expect, beforeEach } from 'vitest';
import { GeneMap, calculateAdaptiveAlpha, thompsonSample } from '../src/engine/gene-map.js';

describe('Adaptive Learning Rate + Bayesian Q-value', () => {
  let gm: GeneMap;

  beforeEach(() => {
    gm = new GeneMap(':memory:');
  });

  // ── calculateAdaptiveAlpha ──

  it('cold start: high α when few observations', () => {
    const alpha = calculateAdaptiveAlpha(0, []);
    // With 0 count and default variance 0.25: α = 0.1 * (1 + 2*0.25) / (1 + 0) = 0.15
    expect(alpha).toBeCloseTo(0.15, 2);
  });

  it('α decreases with more observations (stable)', () => {
    const alphaEarly = calculateAdaptiveAlpha(5, [1, 1, 1, 1, 1]);
    const alphaLate = calculateAdaptiveAlpha(50, [1, 1, 1, 1, 1]);
    expect(alphaEarly).toBeGreaterThan(alphaLate);
  });

  it('α increases with high variance', () => {
    const alphaStable = calculateAdaptiveAlpha(10, [1, 1, 1, 1, 1]);
    const alphaVolatile = calculateAdaptiveAlpha(10, [0, 1, 0, 1, 0]);
    expect(alphaVolatile).toBeGreaterThan(alphaStable);
  });

  it('α respects min/max bounds', () => {
    // Very high count → should hit min
    const alphaMin = calculateAdaptiveAlpha(1000, [1, 1, 1, 1, 1]);
    expect(alphaMin).toBeGreaterThanOrEqual(0.01);
    // Very high variance with low count → should hit max
    const alphaMax = calculateAdaptiveAlpha(0, [0, 1, 0, 1, 0], {
      alphaBase: 1.0, gamma: 10.0, beta: 0.05, alphaMin: 0.01, alphaMax: 0.5,
    });
    expect(alphaMax).toBeLessThanOrEqual(0.5);
  });

  // ── Thompson Sampling ──

  it('thompsonSample returns values near qValue on average', () => {
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) samples.push(thompsonSample(0.7, 0.01));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeCloseTo(0.7, 1);
  });

  it('thompsonSample spreads more with higher variance', () => {
    const lowVar: number[] = [];
    const highVar: number[] = [];
    for (let i = 0; i < 1000; i++) {
      lowVar.push(thompsonSample(0.5, 0.01));
      highVar.push(thompsonSample(0.5, 0.25));
    }
    const stdLow = Math.sqrt(lowVar.reduce((s, v) => s + (v - 0.5) ** 2, 0) / lowVar.length);
    const stdHigh = Math.sqrt(highVar.reduce((s, v) => s + (v - 0.5) ** 2, 0) / highVar.length);
    expect(stdHigh).toBeGreaterThan(stdLow);
  });

  // ── Gene Map integration ──

  it('recordSuccess uses adaptive α and updates variance/count', () => {
    // Seed genes exist — use a known one
    const gene = gm.lookup('payment-insufficient', 'balance');
    expect(gene).not.toBeNull();
    const originalQ = gene!.qValue;

    // Record multiple successes
    gm.recordSuccess('payment-insufficient', 'balance', 100);
    gm.recordSuccess('payment-insufficient', 'balance', 120);
    gm.recordSuccess('payment-insufficient', 'balance', 90);

    const updated = gm.list().find(g => g.failureCode === 'payment-insufficient' && g.category === 'balance');
    expect(updated).toBeDefined();
    expect(updated!.qCount).toBe(3);
    expect(updated!.last5Rewards).toEqual([1, 1, 1]);
    expect(updated!.qVariance).toBe(0); // all same reward → 0 variance (but NaN guard)
    expect(updated!.qValue).toBeGreaterThan(originalQ);
  });

  it('recordFailure decreases Q and tracks reward=0', () => {
    // Get baseline Q before any failures
    const before = gm.list().find(g => g.failureCode === 'payment-insufficient' && g.category === 'balance');
    const qBefore = before!.qValue;

    gm.recordFailure('payment-insufficient', 'balance');
    gm.recordFailure('payment-insufficient', 'balance');

    const gene = gm.list().find(g => g.failureCode === 'payment-insufficient' && g.category === 'balance');
    expect(gene).toBeDefined();
    expect(gene!.qCount).toBe(2);
    expect(gene!.last5Rewards).toEqual([0, 0]);
    expect(gene!.qValue).toBeLessThan(qBefore);
  });

  it('mixed success/failure creates non-zero variance', () => {
    gm.recordSuccess('payment-insufficient', 'balance', 100);
    gm.recordFailure('payment-insufficient', 'balance');
    gm.recordSuccess('payment-insufficient', 'balance', 100);
    gm.recordFailure('payment-insufficient', 'balance');

    const gene = gm.list().find(g => g.failureCode === 'payment-insufficient' && g.category === 'balance');
    expect(gene).toBeDefined();
    expect(gene!.qCount).toBe(4);
    expect(gene!.last5Rewards).toEqual([1, 0, 1, 0]);
    // Variance of [1,0,1,0] = sample variance = 1/3 ≈ 0.333
    expect(gene!.qVariance).toBeCloseTo(1 / 3, 2);
  });

  it('last5Rewards is capped at 5 entries', () => {
    for (let i = 0; i < 7; i++) {
      gm.recordSuccess('payment-insufficient', 'balance', 50);
    }
    const gene = gm.list().find(g => g.failureCode === 'payment-insufficient' && g.category === 'balance');
    expect(gene!.last5Rewards).toHaveLength(5);
    expect(gene!.qCount).toBe(7);
  });

  // ── Schema migration ──

  it('schema version is 5', () => {
    const row = (gm as any).db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number };
    expect(row.version).toBe(5);
  });

  it('new columns exist in genes table', () => {
    const info = (gm as any).db.prepare("PRAGMA table_info('genes')").all() as { name: string }[];
    const cols = info.map(c => c.name);
    expect(cols).toContain('q_variance');
    expect(cols).toContain('q_count');
    expect(cols).toContain('last_5_rewards');
  });
});
