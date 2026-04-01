import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Gene Reasoning (OPT-4)', () => {
  let gm: GeneMap;
  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('records failure analysis', () => {
    gm.recordFailureAnalysis('verification-failed', 'signature', 'RPC timeout during nonce refresh');
    const gene = gm.lookup('verification-failed', 'signature');
    expect(gene!.failureAnalysis!.length).toBeGreaterThan(0);
    expect(gene!.failureAnalysis!.some(a => a.includes('RPC timeout'))).toBe(true);
  });

  it('keeps max 5 failure analysis entries', () => {
    for (let i = 0; i < 7; i++) gm.recordFailureAnalysis('verification-failed', 'signature', `fail-${i}`);
    const gene = gm.lookup('verification-failed', 'signature');
    expect(gene!.failureAnalysis!.length).toBeLessThanOrEqual(5);
    expect(gene!.failureAnalysis![gene!.failureAnalysis!.length - 1]).toContain('fail-6');
  });

  it('updates success context', () => {
    gm.updateContext('verification-failed', 'signature', true, { chain: '8453', platform: 'coinbase' });
    const gene = gm.lookup('verification-failed', 'signature');
    expect(gene!.successContext!.chains).toContain('8453');
    expect(gene!.successContext!.platforms).toContain('coinbase');
  });

  it('updates failure context', () => {
    gm.updateContext('verification-failed', 'signature', false, { chain: '1' });
    const gene = gm.lookup('verification-failed', 'signature');
    expect(gene!.failureContext!.chains).toContain('1');
  });
});
