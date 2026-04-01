import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';
import { SEED_GENES } from '../src/engine/seed-genes.js';

describe('GeneMap', () => {
  let geneMap: GeneMap;

  beforeEach(() => { geneMap = new GeneMap(':memory:'); });
  afterEach(() => { geneMap.close(); });

  it('stores and retrieves a gene', () => {
    geneMap.store({ failureCode: 'test-new', category: 'test-cat', strategy: 'test-strat', params: {}, successCount: 1, avgRepairMs: 150, platforms: ['tempo'], qValue: 0.5, consecutiveFailures: 0 });
    const gene = geneMap.lookup('test-new', 'test-cat');
    expect(gene).not.toBeNull();
    expect(gene!.strategy).toBe('test-strat');
  });

  it('lookup is by (code, category) not by platform', () => {
    // Seed gene exists for verification-failed/signature
    const gene = geneMap.lookup('verification-failed', 'signature');
    expect(gene).not.toBeNull();
    expect(gene!.strategy).toBe('refresh_nonce');
  });

  it('returns null for missing genes', () => {
    expect(geneMap.lookup('nonexistent-xyz', 'unknown-abc')).toBeNull();
  });

  it('updates platforms array when new platform uses a gene', () => {
    geneMap.store({ failureCode: 'plat-test', category: 'plat-cat', strategy: 's', params: {}, successCount: 1, avgRepairMs: 200, platforms: ['tempo'], qValue: 0.5, consecutiveFailures: 0 });
    geneMap.addPlatform('plat-test', 'plat-cat', 'privy');
    const gene = geneMap.lookup('plat-test', 'plat-cat');
    expect(gene!.platforms).toContain('tempo');
    expect(gene!.platforms).toContain('privy');
  });

  it('does not duplicate platforms', () => {
    geneMap.store({ failureCode: 'dup-test', category: 'dup-cat', strategy: 's', params: {}, successCount: 1, avgRepairMs: 2000, platforms: ['generic'], qValue: 0.5, consecutiveFailures: 0 });
    geneMap.addPlatform('dup-test', 'dup-cat', 'generic');
    const gene = geneMap.lookup('dup-test', 'dup-cat');
    expect(gene!.platforms.filter(p => p === 'generic').length).toBe(1);
  });

  it('lists genes sorted by q_value', () => {
    const list = geneMap.list();
    expect(list.length).toBeGreaterThanOrEqual(SEED_GENES.length);
    // Check q_value ordering
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].qValue).toBeGreaterThanOrEqual(list[i].qValue);
    }
  });

  it('starts with seed genes', () => {
    expect(geneMap.immuneCount()).toBe(SEED_GENES.length);
  });
});

describe('Q-Value (MemRL)', () => {
  let geneMap: GeneMap;
  beforeEach(() => { geneMap = new GeneMap(':memory:'); });
  afterEach(() => { geneMap.close(); });

  it('increases q_value on success', () => {
    geneMap.store({ failureCode: 'q-test', category: 'q-cat', strategy: 's', params: {}, successCount: 1, avgRepairMs: 100, platforms: ['tempo'], qValue: 0.5, consecutiveFailures: 0 });
    geneMap.recordSuccess('q-test', 'q-cat', 100);
    const gene = geneMap.lookup('q-test', 'q-cat');
    expect(gene!.qValue).toBeGreaterThan(0.5);
  });

  it('decreases q_value on failure', () => {
    geneMap.store({ failureCode: 'q-test2', category: 'q-cat2', strategy: 's', params: {}, successCount: 1, avgRepairMs: 100, platforms: ['tempo'], qValue: 0.8, consecutiveFailures: 0 });
    geneMap.recordFailure('q-test2', 'q-cat2');
    const gene = geneMap.lookup('q-test2', 'q-cat2');
    expect(gene!.qValue).toBeLessThan(0.8);
  });

  it('q_value converges toward 1.0 with repeated success', () => {
    geneMap.store({ failureCode: 'q-test3', category: 'q-cat3', strategy: 's', params: {}, successCount: 1, avgRepairMs: 100, platforms: ['tempo'], qValue: 0.5, consecutiveFailures: 0 });
    for (let i = 0; i < 20; i++) geneMap.recordSuccess('q-test3', 'q-cat3', 100);
    const gene = geneMap.lookup('q-test3', 'q-cat3');
    expect(gene!.qValue).toBeGreaterThan(0.85);
  });

  it('resets consecutive failures on success', () => {
    geneMap.store({ failureCode: 'q-test4', category: 'q-cat4', strategy: 's', params: {}, successCount: 1, avgRepairMs: 100, platforms: ['tempo'], qValue: 0.5, consecutiveFailures: 3 });
    geneMap.recordSuccess('q-test4', 'q-cat4', 100);
    const gene = geneMap.lookup('q-test4', 'q-cat4');
    expect(gene!.consecutiveFailures).toBe(0);
  });
});
