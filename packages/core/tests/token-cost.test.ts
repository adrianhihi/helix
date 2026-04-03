import { describe, it, expect } from 'vitest';
import { calculateCost } from '../src/engine/token-cost.js';

describe('Token Cost Calculator', () => {
  it('calculates Claude Sonnet cost', () => {
    const cost = calculateCost({ inputTokens: 10000, outputTokens: 2000, model: 'claude-sonnet-4-20250514' });
    expect(cost).toBeCloseTo(0.06, 4);
  });

  it('calculates Claude Opus cost', () => {
    const cost = calculateCost({ inputTokens: 10000, outputTokens: 2000, model: 'claude-opus-4-6-20260401' });
    // 10000*15/1M + 2000*75/1M = 0.15 + 0.15 = 0.30
    expect(cost).toBeCloseTo(0.30, 4);
  });

  it('uses default for unknown models', () => {
    const cost = calculateCost({ inputTokens: 1000, outputTokens: 500, model: 'unknown-v9' });
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it('handles zero tokens', () => {
    expect(calculateCost({ inputTokens: 0, outputTokens: 0, model: 'claude-sonnet-4-20250514' })).toBe(0);
  });
});
