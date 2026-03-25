import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';
import { maybeDistillFromFailures, analyzeFailurePattern } from '../src/engine/failure-distiller.js';

describe('Failure Learning', () => {
  let gm: GeneMap;

  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('records failed repair', () => {
    gm.recordFailedRepair({
      failureCode: 'nonce', category: 'sig', strategy: 'refresh_nonce',
      error: 'nonce mismatch', repairError: 'RPC down',
    });
    expect(gm.getFailedRepairCount('nonce', 'refresh_nonce')).toBe(1);
  });

  it('getFailedRepairs returns records', () => {
    gm.recordFailedRepair({
      failureCode: 'nonce', category: 'sig', strategy: 'refresh_nonce',
      error: 'nonce mismatch', repairError: 'RPC down',
      context: { gasPriceGwei: 200 },
    });
    const records = gm.getFailedRepairs('nonce', 'refresh_nonce');
    expect(records.length).toBe(1);
    expect(records[0].repairError).toBe('RPC down');
    expect(records[0].context.gasPriceGwei).toBe(200);
  });

  it('does not distill below threshold (< 5)', () => {
    for (let i = 0; i < 4; i++) {
      gm.recordFailedRepair({
        failureCode: 'nonce', category: 'sig', strategy: 'refresh_nonce',
        error: 'nonce mismatch', repairError: 'RPC down',
      });
    }
    const distilled = maybeDistillFromFailures(gm, 'nonce', 'refresh_nonce');
    expect(distilled).toBe(false);
  });

  it('distills defensive gene at threshold (= 5)', () => {
    for (let i = 0; i < 5; i++) {
      gm.recordFailedRepair({
        failureCode: 'test-distill', category: 'sig', strategy: 'refresh_nonce',
        error: 'nonce mismatch', repairError: 'RPC down',
      });
    }
    const distilled = maybeDistillFromFailures(gm, 'test-distill', 'refresh_nonce');
    expect(distilled).toBe(true);

    // Check defensive gene exists
    const genes = gm.list();
    const defensive = genes.find(g => g.failureCode === 'test-distill' && g.params._defensive);
    expect(defensive).toBeDefined();
    expect(defensive!.params._blockedStrategy).toBe('refresh_nonce');
    expect(defensive!.strategy).toBe('escalate');
  });

  it('analyzeFailurePattern detects high gas condition', () => {
    const failures = Array.from({ length: 5 }, (_, i) => ({
      failureCode: 'gas', category: 'gas', strategy: 'speed_up',
      error: 'gas too low', repairError: 'still too low',
      context: { gasPriceGwei: 200 + i * 10 },
      timestamp: Date.now(),
    }));
    const pattern = analyzeFailurePattern(failures);
    expect(pattern.condition).toContain('high_gas');
  });
});

describe('Schema v6', () => {
  it('failed_repairs table exists', () => {
    const gm = new GeneMap(':memory:');
    const tables = (gm as any).db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('failed_repairs');
    gm.close();
  });

  it('genes table has scores column', () => {
    const gm = new GeneMap(':memory:');
    const cols = (gm as any).db.prepare("PRAGMA table_info('genes')").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('scores');
    gm.close();
  });
});
