import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Gene Reasoning', () => {
  let gm: GeneMap;
  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('updateReasoning stores reasoning in gene', () => {
    // Seed gene exists for verification-failed/signature
    gm.updateReasoning('verification-failed', 'signature', 'Nonce errors occur when cached nonce diverges from chain state.');
    const gene = gm.lookup('verification-failed', 'signature');
    expect(gene!.reasoning).toBe('Nonce errors occur when cached nonce diverges from chain state.');
  });

  it('reasoning survives gene updates', () => {
    gm.updateReasoning('rate-limited', 'auth', 'Rate limits are transient; waiting allows quota to reset.');
    gm.recordSuccess('rate-limited', 'auth', 100);
    const gene = gm.lookup('rate-limited', 'auth');
    expect(gene!.reasoning).toBe('Rate limits are transient; waiting allows quota to reset.');
  });

  it('updateReasoning on nonexistent gene is safe', () => {
    // Should not throw
    gm.updateReasoning('nonexistent-xyz', 'fake-cat', 'some reasoning');
  });
});

describe('LLM Reasoning Generation', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns null when disabled', async () => {
    const { llmGenerateReasoning } = await import('../src/engine/llm.js');
    expect(await llmGenerateReasoning('error', 'retry', { enabled: false })).toBeNull();
  });

  it('returns null when no API key', async () => {
    const { llmGenerateReasoning } = await import('../src/engine/llm.js');
    const saved = { HELIX_LLM_API_KEY: process.env.HELIX_LLM_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
    delete process.env.HELIX_LLM_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
    expect(await llmGenerateReasoning('error', 'retry', { enabled: true })).toBeNull();
    Object.assign(process.env, saved);
  });

  it('returns cleaned string on success', async () => {
    const { llmGenerateReasoning } = await import('../src/engine/llm.js');
    const mockFetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve({ content: [{ text: 'Nonce conflicts arise when multiple agents share a wallet; refreshing from chain resolves ordering.' }] }),
    })) as any;
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const r = await llmGenerateReasoning('nonce mismatch', 'refresh_nonce', { enabled: true, provider: 'anthropic', apiKey: 'fake', timeoutMs: 5000 });
      expect(r).not.toBeNull();
      expect(r!.length).toBeGreaterThan(10);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
