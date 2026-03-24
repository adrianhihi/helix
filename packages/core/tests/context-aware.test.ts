import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Context-Aware Gene Map', () => {
  let gm: GeneMap;

  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('lookup without context returns gene as-is (backward compatible)', () => {
    const gene = gm.lookup('payment-insufficient', 'balance');
    expect(gene).not.toBeNull();
    expect(gene!._contextSimilarity).toBeUndefined();
    expect(gene!._originalQValue).toBeUndefined();
  });

  it('lookup with context but no stored contexts returns similarity 1.0', () => {
    const gene = gm.lookup('payment-insufficient', 'balance', { gasPriceGwei: 100 });
    expect(gene).not.toBeNull();
    // Seed genes have old-format context ({}), treated as no data → similarity 1.0
    expect(gene!._contextSimilarity).toBe(1.0);
  });

  it('recordSuccess stores context snapshot as array', () => {
    gm.recordSuccess('payment-insufficient', 'balance', 100, {
      gasPriceGwei: 25, chainId: 84532,
    });
    // Read raw from DB
    const row = (gm as any).db.prepare(
      "SELECT success_context FROM genes WHERE failure_code = 'payment-insufficient' AND category = 'balance'"
    ).get() as { success_context: string };
    const parsed = JSON.parse(row.success_context);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].gasPriceGwei).toBe(25);
    expect(parsed[0].chainId).toBe(84532);
    expect(parsed[0].hourOfDay).toBeDefined();
  });

  it('recordFailure stores context snapshot', () => {
    gm.recordFailure('payment-insufficient', 'balance', {
      gasPriceGwei: 500, hourOfDay: 2,
    });
    const row = (gm as any).db.prepare(
      "SELECT failure_context FROM genes WHERE failure_code = 'payment-insufficient' AND category = 'balance'"
    ).get() as { failure_context: string };
    const parsed = JSON.parse(row.failure_context);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].gasPriceGwei).toBe(500);
  });

  it('similar context → high similarity → Q barely reduced', () => {
    // Record several successes with low gas
    for (let i = 0; i < 3; i++) {
      gm.recordSuccess('payment-insufficient', 'balance', 100, {
        gasPriceGwei: 10 + i, hourOfDay: 14,
      });
    }

    const similar = gm.lookup('payment-insufficient', 'balance', {
      gasPriceGwei: 11, hourOfDay: 14,
    });
    expect(similar).not.toBeNull();
    expect(similar!._contextSimilarity!).toBeGreaterThan(0.9);
  });

  it('different context → lower similarity → Q reduced more', () => {
    for (let i = 0; i < 3; i++) {
      gm.recordSuccess('payment-insufficient', 'balance', 100, {
        gasPriceGwei: 10 + i, hourOfDay: 14,
      });
    }

    const similar = gm.lookup('payment-insufficient', 'balance', {
      gasPriceGwei: 11, hourOfDay: 14,
    });
    const different = gm.lookup('payment-insufficient', 'balance', {
      gasPriceGwei: 500, hourOfDay: 3,
    });

    expect(different!._contextSimilarity!).toBeLessThan(similar!._contextSimilarity!);
    expect(different!.qValue).toBeLessThan(similar!.qValue);
  });

  it('keeps only last 10 context snapshots', () => {
    for (let i = 0; i < 15; i++) {
      gm.recordSuccess('payment-insufficient', 'balance', 100, {
        gasPriceGwei: i * 10,
      });
    }
    const row = (gm as any).db.prepare(
      "SELECT success_context FROM genes WHERE failure_code = 'payment-insufficient' AND category = 'balance'"
    ).get() as { success_context: string };
    const parsed = JSON.parse(row.success_context);
    expect(parsed.length).toBe(10);
    // Should have the latest 10 (50–140), not the first (0–40)
    expect(parsed[0].gasPriceGwei).toBe(50);
  });

  it('hourOfDay auto-captured if not provided', () => {
    gm.recordSuccess('payment-insufficient', 'balance', 100, {
      gasPriceGwei: 10,
    });
    const row = (gm as any).db.prepare(
      "SELECT success_context FROM genes WHERE failure_code = 'payment-insufficient' AND category = 'balance'"
    ).get() as { success_context: string };
    const parsed = JSON.parse(row.success_context);
    expect(parsed[0].hourOfDay).toBeGreaterThanOrEqual(0);
    expect(parsed[0].hourOfDay).toBeLessThanOrEqual(23);
  });

  it('chainId exact match affects similarity', () => {
    gm.recordSuccess('payment-insufficient', 'balance', 100, { chainId: 1 });
    gm.recordSuccess('payment-insufficient', 'balance', 100, { chainId: 1 });

    const sameChain = gm.lookup('payment-insufficient', 'balance', { chainId: 1 });
    const diffChain = gm.lookup('payment-insufficient', 'balance', { chainId: 84532 });

    expect(sameChain!._contextSimilarity!).toBeGreaterThan(diffChain!._contextSimilarity!);
  });

  it('recordSuccess/recordFailure without context still works', () => {
    // This is the backward-compat path used by existing callers
    gm.recordSuccess('payment-insufficient', 'balance', 100);
    gm.recordFailure('payment-insufficient', 'balance');
    // Should not crash or corrupt data
    const gene = gm.lookup('payment-insufficient', 'balance');
    expect(gene).not.toBeNull();
  });

  it('similarity range is always 0.5–1.0', () => {
    // Record a very specific context
    gm.recordSuccess('payment-insufficient', 'balance', 100, {
      gasPriceGwei: 1, hourOfDay: 0, chainId: 1,
    });

    // Look up with maximally different context
    const gene = gm.lookup('payment-insufficient', 'balance', {
      gasPriceGwei: 99999, hourOfDay: 12, chainId: 99999,
    });
    expect(gene!._contextSimilarity!).toBeGreaterThanOrEqual(0.5);
    expect(gene!._contextSimilarity!).toBeLessThanOrEqual(1.0);
  });
});
