import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PcecEngine } from '../src/engine/pcec.js';
import { GeneMap } from '../src/engine/gene-map.js';
import { bus } from '../src/engine/bus.js';
import { defaultAdapters } from '../src/platforms/index.js';

describe('Cross-Platform Immunity', () => {
  let engine: PcecEngine;
  let geneMap: GeneMap;

  beforeEach(() => {
    geneMap = new GeneMap(':memory:'); // seeds automatically
    engine = new PcecEngine(geneMap, 'xplat-test', { mode: 'auto' });
    for (const adapter of defaultAdapters) engine.registerAdapter(adapter);
    bus.clear();
  });
  afterEach(() => { geneMap.close(); });

  it('seed genes provide cross-platform immunity from day 1', async () => {
    // Seed gene for verification-failed/signature covers [tempo, privy, coinbase]
    // A new Privy nonce error should be IMMUNE immediately
    const privyError = new Error('Transaction nonce mismatch: wallet internal nonce=47 but chain nonce=45');
    const r = await engine.repair(privyError);
    expect(r.success).toBe(true);
    expect(r.immune).toBe(true);
  });

  it('Tempo network fix immunizes Privy cross-chain (via seed gene)', async () => {
    // Seed gene for token-uninitialized/network covers [tempo, privy, coinbase]
    const privyError = new Error('Privy wallet wlt_stu901 is provisioned on Ethereum mainnet but transaction targets Tempo chain (chainId: 42069). Cannot sign for mismatched chain');
    const r = await engine.repair(privyError);
    expect(r.success).toBe(true);
    expect(r.immune).toBe(true);
    // Gene should already have privy in platforms from seed
    expect(r.gene!.platforms).toContain('privy');
  });

  it('Coinbase AA25 uses same nonce gene as Tempo/Privy', async () => {
    const cbError = new Error('EntryPoint revert: AA25 Invalid account nonce');
    const r = await engine.repair(cbError);
    expect(r.success).toBe(true);
    expect(r.immune).toBe(true);
    expect(r.gene!.platforms).toContain('coinbase');
  });

  it('does NOT immunize truly unknown categories', async () => {
    // Use an error that maps to a category with no seed gene
    const error = new Error('Agent chain A→B→C: agent C payment failed, waterfall refund needed');
    (error as any).code = 'cascade-failure';
    const r = await engine.repair(error);
    // cascade-failure IS NOT in seed genes
    expect(r.immune).toBe(false);
  });

  it('updates gene platforms on cross-platform hit', async () => {
    // Store a gene with only platform: ['test-only']
    geneMap.store({
      failureCode: 'offramp-failed', category: 'offramp', strategy: 'switch_offramp',
      params: {}, successCount: 3, avgRepairMs: 200, platforms: ['test-only'],
      qValue: 0.7, consecutiveFailures: 0,
    });
    // Trigger with a different platform
    const err = new Error('Bank transfer to IBAN DE89... failed: provider Moonpay returned error 503');
    (err as any).code = 'offramp-failed';
    const r = await engine.repair(err);
    expect(r.immune).toBe(true);
    expect(r.gene!.platforms).toContain('test-only');
    expect(r.gene!.platforms).toContain('tempo');
  });
});
