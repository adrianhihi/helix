import { describe, it, expect } from 'vitest';
import { SCENARIOS } from '../../../scripts/benchmark/scenarios.js';

describe('Benchmark Scenarios', () => {
  it('has 50 scenarios', () => {
    expect(SCENARIOS.length).toBe(50);
  });

  it('covers all platforms', () => {
    const platforms = new Set(SCENARIOS.map(s => s.platform));
    expect(platforms.has('coinbase')).toBe(true);
    expect(platforms.has('tempo')).toBe(true);
    expect(platforms.has('privy')).toBe(true);
    expect(platforms.has('generic')).toBe(true);
  });

  it('has success cases', () => {
    expect(SCENARIOS.filter(s => !s.error).length).toBeGreaterThan(0);
  });

  it('has novel errors for learning test', () => {
    expect(SCENARIOS.filter(s => !s.expectedKnown && s.error).length).toBeGreaterThan(0);
  });

  it('has repeated errors for learning test', () => {
    const errors = SCENARIOS.filter(s => s.error).map(s => s.error);
    const duplicates = errors.filter((e, i) => errors.indexOf(e) !== i);
    expect(duplicates.length).toBeGreaterThan(0);
  });
});
