import { describe, test, expect } from 'vitest';
import { refine, filterCandidates, createRefinementContext, recordAttempt } from '../src/engine/self-refine.js';

describe('Self-Refine (Generic)', () => {

  // refine()
  test('first attempt — shouldContinue true, no exclusions', () => {
    const ctx = createRefinementContext('some error', 3);
    const result = refine(ctx);
    expect(result.shouldContinue).toBe(true);
    expect(result.excludeStrategies).toEqual([]);
    expect(result.reason).toBe('First attempt');
  });

  test('after 1 failure — excludes failed strategy', () => {
    const ctx = createRefinementContext('some error', 3);
    recordAttempt(ctx, 'strategyA', true, 'it broke');
    const result = refine(ctx);
    expect(result.shouldContinue).toBe(true);
    expect(result.excludeStrategies).toContain('strategyA');
  });

  test('after 2 different failures — still continues', () => {
    const ctx = createRefinementContext('some error', 5);
    recordAttempt(ctx, 'strategyA', true, 'failed');
    recordAttempt(ctx, 'strategyB', true, 'also failed');
    const result = refine(ctx);
    expect(result.shouldContinue).toBe(true);
    expect(result.excludeStrategies).toContain('strategyA');
    expect(result.excludeStrategies).toContain('strategyB');
  });

  test('after 3 different failures — stops (escalate)', () => {
    const ctx = createRefinementContext('some error', 5);
    recordAttempt(ctx, 'strategyA', true, 'failed');
    recordAttempt(ctx, 'strategyB', true, 'failed');
    recordAttempt(ctx, 'strategyC', true, 'failed');
    const result = refine(ctx);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain('3');
    expect(result.reason).toContain('escalating');
  });

  test('same strategy fails 2x — stops (stuck)', () => {
    const ctx = createRefinementContext('some error', 5);
    recordAttempt(ctx, 'strategyA', true, 'failed');
    recordAttempt(ctx, 'strategyA', true, 'failed again');
    const result = refine(ctx);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain('strategyA');
  });

  test('max attempts reached — stops', () => {
    const ctx = createRefinementContext('some error', 2);
    recordAttempt(ctx, 'strategyA', true, 'failed');
    recordAttempt(ctx, 'strategyB', true, 'failed');
    const result = refine(ctx);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain('Max attempts');
  });

  test('enriched error contains failure history', () => {
    const ctx = createRefinementContext('original error', 5);
    recordAttempt(ctx, 'strategyA', true, 'reason1');
    const result = refine(ctx);
    expect(result.enrichedError).toContain('original error');
    expect(result.enrichedError).toContain('strategyA');
    expect(result.enrichedError).toContain('failed');
  });

  test('successful attempt does not exclude strategy', () => {
    const ctx = createRefinementContext('some error', 5);
    recordAttempt(ctx, 'strategyA', false);
    const result = refine(ctx);
    expect(result.shouldContinue).toBe(true);
    expect(result.excludeStrategies).not.toContain('strategyA');
  });

  // filterCandidates()
  test('filters out excluded strategies', () => {
    const candidates = [
      { strategy: 'A', score: 0.9 },
      { strategy: 'B', score: 0.7 },
      { strategy: 'C', score: 0.5 },
    ];
    const filtered = filterCandidates(candidates, ['A']);
    expect(filtered.length).toBe(2);
    expect(filtered.map(c => c.strategy)).toEqual(['B', 'C']);
  });

  test('returns original list if all would be filtered', () => {
    const candidates = [
      { strategy: 'A', score: 0.9 },
    ];
    const filtered = filterCandidates(candidates, ['A']);
    expect(filtered.length).toBe(1);
    expect(filtered[0].strategy).toBe('A');
  });

  test('returns original list with no exclusions', () => {
    const candidates = [
      { strategy: 'A', score: 0.9 },
      { strategy: 'B', score: 0.7 },
    ];
    const filtered = filterCandidates(candidates, []);
    expect(filtered.length).toBe(2);
  });

  test('filters multiple excluded strategies', () => {
    const candidates = [
      { strategy: 'A', score: 0.9 },
      { strategy: 'B', score: 0.7 },
      { strategy: 'C', score: 0.5 },
      { strategy: 'D', score: 0.3 },
    ];
    const filtered = filterCandidates(candidates, ['A', 'C']);
    expect(filtered.length).toBe(2);
    expect(filtered.map(c => c.strategy)).toEqual(['B', 'D']);
  });

  // createRefinementContext + recordAttempt
  test('context tracks attempts correctly', () => {
    const ctx = createRefinementContext('test error', 3);
    expect(ctx.currentAttempt).toBe(0);
    expect(ctx.attemptHistory.length).toBe(0);

    recordAttempt(ctx, 'strategyA', true, 'failed', 100);
    expect(ctx.currentAttempt).toBe(1);
    expect(ctx.attemptHistory.length).toBe(1);
    expect(ctx.attemptHistory[0].strategy).toBe('strategyA');
    expect(ctx.attemptHistory[0].failed).toBe(true);
    expect(ctx.attemptHistory[0].durationMs).toBe(100);

    recordAttempt(ctx, 'strategyB', false, undefined, 50);
    expect(ctx.currentAttempt).toBe(2);
    expect(ctx.attemptHistory.length).toBe(2);
    expect(ctx.attemptHistory[1].failed).toBe(false);
  });

  // Full scenario: generic (no domain knowledge)
  test('full refinement scenario — domain agnostic', () => {
    const ctx = createRefinementContext('ERROR_CODE_42: something went wrong', 4);

    // Attempt 1
    let result = refine(ctx);
    expect(result.shouldContinue).toBe(true);
    recordAttempt(ctx, 'fix_alpha', true, 'still broken');

    // Attempt 2 — fix_alpha excluded
    result = refine(ctx);
    expect(result.shouldContinue).toBe(true);
    expect(result.excludeStrategies).toContain('fix_alpha');
    recordAttempt(ctx, 'fix_beta', true, 'nope');

    // Attempt 3 — fix_alpha + fix_beta excluded
    result = refine(ctx);
    expect(result.shouldContinue).toBe(true);
    expect(result.excludeStrategies).toContain('fix_alpha');
    expect(result.excludeStrategies).toContain('fix_beta');
    recordAttempt(ctx, 'fix_gamma', false); // success!

    // After success, context has full history
    expect(ctx.attemptHistory.length).toBe(3);
    expect(ctx.attemptHistory[2].failed).toBe(false);
  });
});
