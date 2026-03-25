import { describe, it, expect } from 'vitest';
import { computeRepairScore, SCORE_WEIGHTS } from '../src/engine/repair-score.js';

describe('Multi-Dimensional Scoring', () => {
  it('computes all 6 dimensions', () => {
    const score = computeRepairScore({
      perceiveSource: 'adapter', costUsd: 0, repairMs: 5,
      mode: 'observe', platformCount: 2, consecutiveSuccesses: 5,
    });
    expect(score.dimensions.accuracy).toBe(1.0);
    expect(score.dimensions.costEfficiency).toBe(1.0);
    expect(score.dimensions.safety).toBe(1.0);
    expect(score.dimensions.latency).toBeGreaterThan(0);
    expect(score.dimensions.transferability).toBeGreaterThan(0);
    expect(score.dimensions.reliability).toBe(0.5);
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(1);
  });

  it('adapter has higher accuracy than LLM', () => {
    const adapter = computeRepairScore({ perceiveSource: 'adapter' });
    const llm = computeRepairScore({ perceiveSource: 'llm' });
    expect(adapter.dimensions.accuracy).toBeGreaterThan(llm.dimensions.accuracy);
  });

  it('embedding accuracy between adapter and LLM', () => {
    const adapter = computeRepairScore({ perceiveSource: 'adapter' });
    const embedding = computeRepairScore({ perceiveSource: 'embedding' });
    const llm = computeRepairScore({ perceiveSource: 'llm' });
    expect(embedding.dimensions.accuracy).toBeLessThan(adapter.dimensions.accuracy);
    expect(embedding.dimensions.accuracy).toBeGreaterThan(llm.dimensions.accuracy);
  });

  it('fast repair has higher latency score', () => {
    const fast = computeRepairScore({ repairMs: 1 });
    const slow = computeRepairScore({ repairMs: 1000 });
    expect(fast.dimensions.latency).toBeGreaterThan(slow.dimensions.latency);
  });

  it('multi-platform gene has higher transferability', () => {
    const multi = computeRepairScore({ platformCount: 3 });
    const single = computeRepairScore({ platformCount: 1 });
    expect(multi.dimensions.transferability).toBeGreaterThan(single.dimensions.transferability);
  });

  it('zero cost has perfect cost efficiency', () => {
    const score = computeRepairScore({ costUsd: 0 });
    expect(score.dimensions.costEfficiency).toBe(1.0);
  });

  it('observe mode has perfect safety', () => {
    const obs = computeRepairScore({ mode: 'observe' });
    const full = computeRepairScore({ mode: 'full' });
    expect(obs.dimensions.safety).toBeGreaterThan(full.dimensions.safety);
  });

  it('overall equals weighted sum of dimensions', () => {
    const score = computeRepairScore({
      perceiveSource: 'adapter', costUsd: 0, repairMs: 10,
      mode: 'auto', platformCount: 2, consecutiveSuccesses: 3,
    });
    const expected = Object.entries(SCORE_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + score.dimensions[key as keyof typeof score.dimensions] * weight,
      0,
    );
    expect(score.overall).toBeCloseTo(expected, 10);
  });
});
