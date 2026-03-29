import { describe, test, expect } from 'vitest';
import { reflect, enrichContext, shouldContinueRefining, type AttemptRecord, type RefinementContext } from '../src/engine/self-refine.js';

describe('Self-Refine', () => {

  // reflect()
  test('reflects on nonce failure → suggests remove_and_resubmit', () => {
    const r = reflect('nonce too low', 'refresh_nonce', 'nonce still too low', []);
    expect(r.whyFailed.toLowerCase()).toContain('nonce');
    expect(r.suggestedApproach).toBe('remove_and_resubmit');
    expect(r.whatToAvoid).toContain('refresh_nonce');
  });

  test('reflects on gas failure → suggests backoff', () => {
    const r = reflect('gas too low', 'speed_up_transaction', 'still underpriced gas', []);
    expect(r.whyFailed.toLowerCase()).toContain('gas');
    expect(r.suggestedApproach).toBe('backoff_retry');
  });

  test('reflects on balance failure after reduce → suggests split', () => {
    const r = reflect('insufficient balance', 'reduce_request', 'still insufficient funds', []);
    expect(r.suggestedApproach).toBe('split_transaction');
  });

  test('reflects on split failure → suggests escalate', () => {
    const r = reflect('insufficient balance', 'split_transaction', 'still insufficient funds', []);
    expect(r.suggestedApproach).toBe('hold_and_notify');
  });

  test('reflects on session failure → suggests backoff', () => {
    const r = reflect('session expired', 'renew_session', 'token refresh failed session', []);
    expect(r.suggestedApproach).toBe('backoff_retry');
  });

  test('detects same strategy tried 2+ times', () => {
    const history: AttemptRecord[] = [
      { attempt: 0, strategy: 'retry', failed: true, failureReason: 'still failing', durationMs: 100 },
      { attempt: 1, strategy: 'retry', failed: true, failureReason: 'still failing', durationMs: 100 },
    ];
    const r = reflect('some error', 'retry', 'still failing', history);
    expect(r.whatToAvoid).toContain('retry');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('generic fallback for unknown pattern', () => {
    const r = reflect('weird error xyz', 'some_strategy', 'unknown failure', []);
    expect(r.whyFailed).toContain('some_strategy');
    expect(r.confidence).toBeLessThan(0.6);
  });

  // enrichContext()
  test('enriches error with failure history', () => {
    const history: AttemptRecord[] = [
      { attempt: 0, strategy: 'retry', failed: true, failureReason: 'timeout', durationMs: 100 },
    ];
    const reflection = { whyFailed: 'timeout', whatToAvoid: ['retry'], suggestedApproach: 'backoff_retry', confidence: 0.5 };
    const enriched = enrichContext('original error', reflection, history);

    expect(enriched).toContain('original error');
    expect(enriched).toContain('Previously tried');
    expect(enriched).toContain('retry');
    expect(enriched).toContain('Reflection');
    expect(enriched).toContain('Avoid');
  });

  test('enriches with empty history', () => {
    const reflection = { whyFailed: 'unknown', whatToAvoid: [], suggestedApproach: 'retry', confidence: 0.5 };
    const enriched = enrichContext('error msg', reflection, []);
    expect(enriched).toContain('error msg');
    expect(enriched).toContain('Reflection');
    expect(enriched).not.toContain('Avoid:');
  });

  // shouldContinueRefining()
  test('stops at max attempts', () => {
    const ctx: RefinementContext = {
      originalError: 'test',
      attemptHistory: [{ attempt: 0, strategy: 'retry', failed: true, durationMs: 100 }],
      currentAttempt: 3,
      maxAttempts: 3,
    };
    expect(shouldContinueRefining(ctx)).toBe(false);
  });

  test('continues when attempts remain', () => {
    const ctx: RefinementContext = {
      originalError: 'test',
      attemptHistory: [{ attempt: 0, strategy: 'retry', failed: true, durationMs: 100 }],
      currentAttempt: 1,
      maxAttempts: 3,
    };
    expect(shouldContinueRefining(ctx)).toBe(true);
  });

  test('stops when 3+ unique strategies all failed', () => {
    const ctx: RefinementContext = {
      originalError: 'test',
      attemptHistory: [
        { attempt: 0, strategy: 'retry', failed: true, durationMs: 100 },
        { attempt: 1, strategy: 'backoff_retry', failed: true, durationMs: 100 },
        { attempt: 2, strategy: 'refresh_nonce', failed: true, durationMs: 100 },
      ],
      currentAttempt: 3,
      maxAttempts: 5,
    };
    expect(shouldContinueRefining(ctx)).toBe(false);
  });

  test('continues when not all strategies failed', () => {
    const ctx: RefinementContext = {
      originalError: 'test',
      attemptHistory: [
        { attempt: 0, strategy: 'retry', failed: true, durationMs: 100 },
        { attempt: 1, strategy: 'backoff_retry', failed: false, durationMs: 100 },
      ],
      currentAttempt: 2,
      maxAttempts: 5,
    };
    expect(shouldContinueRefining(ctx)).toBe(true);
  });
});
