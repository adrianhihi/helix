import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../gene-map.js';

describe('GeneMap', () => {
  let gm: GeneMap;

  beforeEach(() => {
    gm = new GeneMap(':memory:');
  });

  afterEach(() => {
    gm.close();
  });

  it('upserts and retrieves a capsule', () => {
    gm.upsertGene({
      failureCode: 'nonce-mismatch',
      category: 'nonce',
      strategy: 'refresh_nonce',
      params: {},
      successCount: 1,
      avgRepairMs: 200,
      platforms: ['coinbase'],
      qValue: 0.85,
      consecutiveFailures: 0,
    });

    const found = gm.findBest('nonce-mismatch', 'nonce');
    expect(found).not.toBeNull();
    expect(found!.failureCode).toBe('nonce-mismatch');
    expect(found!.strategy).toBe('refresh_nonce');
    expect(found!.qValue).toBe(0.85);
  });

  it('updateQValue increases qValue on success', () => {
    gm.upsertGene({
      failureCode: 'timeout',
      category: 'service',
      strategy: 'backoff_retry',
      params: {},
      successCount: 1,
      avgRepairMs: 100,
      platforms: ['generic'],
      qValue: 0.5,
      consecutiveFailures: 0,
    });

    gm.updateQValue('timeout', 'service', true, 150);

    const gene = gm.findBest('timeout', 'service');
    expect(gene).not.toBeNull();
    expect(gene!.qValue).toBeGreaterThan(0.5);
  });

  it('updateQValue decreases qValue on failure', () => {
    gm.upsertGene({
      failureCode: 'rate-limited',
      category: 'auth',
      strategy: 'backoff_retry',
      params: {},
      successCount: 5,
      avgRepairMs: 2000,
      platforms: ['generic'],
      qValue: 0.8,
      consecutiveFailures: 0,
    });

    gm.updateQValue('rate-limited', 'auth', false);

    const gene = gm.findBest('rate-limited', 'auth');
    expect(gene).not.toBeNull();
    expect(gene!.qValue).toBeLessThan(0.8);
  });

  it('findBest returns highest qValue capsule', () => {
    // Insert first gene with low Q
    gm.upsertGene({
      failureCode: 'test-error',
      category: 'test-cat',
      strategy: 'low_q_strategy',
      params: {},
      successCount: 1,
      avgRepairMs: 100,
      platforms: [],
      qValue: 0.3,
      consecutiveFailures: 0,
    });

    // Overwrite with higher Q (same failure_code + category = UNIQUE)
    gm.upsertGene({
      failureCode: 'test-error',
      category: 'test-cat',
      strategy: 'high_q_strategy',
      params: {},
      successCount: 5,
      avgRepairMs: 50,
      platforms: [],
      qValue: 0.95,
      consecutiveFailures: 0,
    });

    const best = gm.findBest('test-error', 'test-cat');
    expect(best).not.toBeNull();
    expect(best!.strategy).toBe('high_q_strategy');
    expect(best!.qValue).toBe(0.95);
  });

  it('getAll returns all capsules', () => {
    gm.upsertGene({ failureCode: 'err-a', category: 'cat-a', strategy: 's1', params: {}, successCount: 1, avgRepairMs: 0, platforms: [], qValue: 0.5, consecutiveFailures: 0 });
    gm.upsertGene({ failureCode: 'err-b', category: 'cat-b', strategy: 's2', params: {}, successCount: 1, avgRepairMs: 0, platforms: [], qValue: 0.7, consecutiveFailures: 0 });

    const all = gm.getAll();
    expect(all.length).toBe(2);
  });

  it('seed() populates an empty database', () => {
    const result = gm.seed([
      { failureCode: 'seed-1', category: 'cat', strategy: 'retry', params: {}, successCount: 1, avgRepairMs: 100, platforms: ['test'], qValue: 0.8, consecutiveFailures: 0 },
      { failureCode: 'seed-2', category: 'cat2', strategy: 'retry', params: {}, successCount: 1, avgRepairMs: 100, platforms: ['test'], qValue: 0.7, consecutiveFailures: 0 },
    ]);
    expect(result.seeded).toBe(2);
    expect(gm.getAll().length).toBe(2);

    // Second seed is a no-op
    const result2 = gm.seed([
      { failureCode: 'seed-3', category: 'cat3', strategy: 'retry', params: {}, successCount: 1, avgRepairMs: 100, platforms: [], qValue: 0.5, consecutiveFailures: 0 },
    ]);
    expect(result2.seeded).toBe(0);
    expect(gm.getAll().length).toBe(2);
  });

  it('close() does not throw', () => {
    expect(() => gm.close()).not.toThrow();
  });
});
