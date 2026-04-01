import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeneRegistryClient } from '../src/engine/gene-registry.js';
import { GeneMap } from '../src/engine/gene-map.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Gene Registry Client', () => {
  let gm: GeneMap;

  beforeEach(() => { gm = new GeneMap(':memory:'); mockFetch.mockReset(); });
  afterEach(() => { gm.close(); });

  it('throws if no URL provided', () => {
    expect(() => new GeneRegistryClient({} as any)).toThrow('URL is required');
  });

  it('push sends qualified Genes', async () => {
    for (let i = 0; i < 5; i++) gm.recordSuccess('verification-failed', 'signature', 100);

    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ accepted: 1, rejected: 0 }),
    });

    const client = new GeneRegistryClient({ url: 'http://localhost:7844', agentId: 'test' });
    const result = await client.push(gm);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:7844/v1/genes/push',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.pushed).toBe(1);
  });

  it('push filters low-quality Genes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ accepted: 0, rejected: 0 }),
    });

    const client = new GeneRegistryClient({ url: 'http://localhost:7844', minQualityForPush: 0.99 });
    const result = await client.push(gm);
    expect(result.pushed).toBe(0);
  });

  it('pull adds new Genes with 20% Q discount', async () => {
    (gm as any).db.exec('DELETE FROM genes');
    (gm as any).cache.clear();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        genes: [{
          failureCode: 'new-error', failureCategory: 'unknown',
          strategy: 'backoff_retry', qValue: 0.9, successCount: 10,
          platforms: ['tempo'], createdAt: Date.now(),
        }],
      }),
    });

    const client = new GeneRegistryClient({ url: 'http://localhost:7844' });
    const result = await client.pull(gm);
    expect(result.pulled).toBe(1);

    const gene = gm.list().find(g => g.failureCode === 'new-error');
    expect(gene).toBeDefined();
    expect(gene!.qValue).toBeCloseTo(0.72, 1); // 0.9 * 0.8
  });

  it('pull skips Genes that already exist locally', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        genes: [{
          failureCode: 'verification-failed', failureCategory: 'signature',
          strategy: 'refresh_nonce', qValue: 0.99, successCount: 1000,
          platforms: ['tempo'], createdAt: Date.now(),
        }],
      }),
    });

    const client = new GeneRegistryClient({ url: 'http://localhost:7844' });
    const result = await client.pull(gm);
    expect(result.skipped).toBe(1);
    expect(result.pulled).toBe(0);
  });

  it('push handles server error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });
    const client = new GeneRegistryClient({ url: 'http://localhost:7844' });
    await expect(client.push(gm)).rejects.toThrow('Registry push failed: 500');
  });

  it('health check works', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ status: 'ok', totalGenes: 42, totalAgents: 5 }),
    });

    const client = new GeneRegistryClient({ url: 'http://localhost:7844' });
    const health = await client.health();
    expect(health.status).toBe('ok');
    expect(health.totalGenes).toBe(42);
  });

  it('auto-sync starts and stops without error', () => {
    const client = new GeneRegistryClient({ url: 'http://localhost:7844', syncIntervalMs: 60000 });
    client.startAutoSync(gm);
    client.stopAutoSync();
  });

  it('push includes auth header when apiKey provided', async () => {
    for (let i = 0; i < 5; i++) gm.recordSuccess('verification-failed', 'signature', 100);

    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ accepted: 1, rejected: 0 }),
    });

    const client = new GeneRegistryClient({ url: 'http://localhost:7844', apiKey: 'secret-key', agentId: 'auth-test' });
    await client.push(gm);

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers['Authorization']).toBe('Bearer secret-key');
    expect(callArgs.headers['X-Agent-Id']).toBe('auth-test');
  });

  it('trailing slash in URL is stripped', () => {
    const client = new GeneRegistryClient({ url: 'http://localhost:7844/' });
    // Internal url should not have trailing slash
    expect((client as any).url).toBe('http://localhost:7844');
  });
});
