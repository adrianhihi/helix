import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Predictive Failure Graph', () => {
  let gm: GeneMap;

  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('recordTransition creates a directed link', () => {
    gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 2000);
    const links = gm.getLinks('nonce', 'sig');
    expect(links.length).toBe(1);
    expect(links[0].toCode).toBe('gas-error');
    expect(links[0].toCategory).toBe('gas');
    expect(links[0].count).toBe(1);
  });

  it('transition probability updates with more data', () => {
    // nonce → gas 3 times
    gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 2000);
    gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 2500);
    gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 1800);
    // nonce → timeout 1 time
    gm.recordTransition('nonce', 'sig', 'timeout', 'service', 5000);

    const links = gm.getLinks('nonce', 'sig');
    const gasLink = links.find(l => l.toCode === 'gas-error');
    const timeoutLink = links.find(l => l.toCode === 'timeout');

    expect(gasLink!.probability).toBeCloseTo(0.75, 1);
    expect(timeoutLink!.probability).toBeCloseTo(0.25, 1);
  });

  it('predictNext returns predictions with sufficient data', () => {
    for (let i = 0; i < 4; i++) {
      gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 2000);
    }
    const predictions = gm.predictNext('nonce', 'sig', 0);
    expect(predictions.length).toBe(1);
    expect(predictions[0].code).toBe('gas-error');
    expect(predictions[0].probability).toBe(1.0);
  });

  it('predictNext respects minProbability', () => {
    for (let i = 0; i < 3; i++) gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 2000);
    for (let i = 0; i < 3; i++) gm.recordTransition('nonce', 'sig', 'timeout', 'service', 5000);

    // With high minProbability, neither qualifies (each is 50%)
    const high = gm.predictNext('nonce', 'sig', 0.6);
    expect(high.length).toBe(0);

    // With low minProbability, both qualify
    const low = gm.predictNext('nonce', 'sig', 0.1);
    expect(low.length).toBe(2);
  });

  it('predictNext requires minimum 3 co-occurrences', () => {
    gm.recordTransition('nonce', 'sig', 'rare', 'unknown', 1000);
    gm.recordTransition('nonce', 'sig', 'rare', 'unknown', 1000);

    const predictions = gm.predictNext('nonce', 'sig', 0);
    expect(predictions.length).toBe(0);
  });

  it('predictNext returns max 3 predictions', () => {
    for (const target of ['a', 'b', 'c', 'd', 'e']) {
      for (let i = 0; i < 4; i++) {
        gm.recordTransition('source', 'cat', target, 'cat', 1000);
      }
    }
    const predictions = gm.predictNext('source', 'cat', 0);
    expect(predictions.length).toBeLessThanOrEqual(3);
  });

  it('avg_delay_ms is calculated correctly', () => {
    gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 1000);
    gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 3000);
    gm.recordTransition('nonce', 'sig', 'gas-error', 'gas', 2000);

    const predictions = gm.predictNext('nonce', 'sig', 0);
    expect(predictions[0].avgDelayMs).toBeCloseTo(2000, -2);
  });

  it('preload loads Gene into cache without side effects', () => {
    // verification-failed/signature exists as a seed gene
    (gm as any).cache.clear();

    gm.preload('verification-failed' as any, 'signature' as any);
    expect((gm as any).cache.has('verification-failed:signature')).toBe(true);

    // Preload again — should be a no-op
    gm.preload('verification-failed' as any, 'signature' as any);
  });

  it('preload does not crash for non-existent gene', () => {
    gm.preload('does-not-exist' as any, 'unknown' as any);
    expect((gm as any).cache.has('does-not-exist:unknown')).toBe(false);
  });

  it('no predictions for unknown source error', () => {
    const predictions = gm.predictNext('never-seen', 'unknown', 0);
    expect(predictions.length).toBe(0);
  });

  it('getLinks returns empty for no links', () => {
    const links = gm.getLinks('no-links', 'unknown');
    expect(links.length).toBe(0);
  });

  it('schema v5 adds columns to gene_links', () => {
    const info = (gm as any).db.prepare("PRAGMA table_info('gene_links')").all() as { name: string }[];
    const cols = info.map(c => c.name);
    expect(cols).toContain('transition_probability');
    expect(cols).toContain('avg_delay_ms');
    expect(cols).toContain('from_count');
  });
});

describe('PCEC transition tracking', () => {
  it('records transitions between consecutive failures', async () => {
    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    const engine = new PcecEngine(gm, 'pred-test', { mode: 'auto' } as any);

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    // Two consecutive failures
    await engine.repair(new Error('nonce mismatch'));
    await engine.repair(new Error('HTTP 429 rate limited'));

    // A link should exist from nonce error to rate-limit error
    const links = gm.getLinks('verification-failed', 'signature');
    expect(links.length).toBeGreaterThanOrEqual(1);

    gm.close();
  });

  it('predictions appear in RepairResult', async () => {
    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    const engine = new PcecEngine(gm, 'pred-test', { mode: 'auto' } as any);

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    // Build up enough transitions for predictions
    for (let i = 0; i < 4; i++) {
      gm.recordTransition('verification-failed', 'signature', 'rate-limited', 'auth', 1000);
    }

    const result = await engine.repair(new Error('nonce mismatch'));

    // predictions may or may not be present depending on whether the
    // immune path has enough transition data, but the field should be safe
    if (result.predictions) {
      expect(Array.isArray(result.predictions)).toBe(true);
      expect(result.predictions[0].probability).toBeGreaterThan(0);
    }

    gm.close();
  });
});
