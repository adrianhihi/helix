/**
 * Self-Refine: Iterative refinement with failure feedback.
 *
 * Paper: Self-Refine (2303.17651)
 *
 * 100% generic — no domain-specific logic.
 * Works by feeding failure information back into existing scoring systems
 * (NegativeKnowledge, AdaptiveWeights, Q-values).
 *
 * The framework doesn't know what "nonce" or "gas" is.
 * It only knows: "strategy X was tried and failed with reason Y."
 */

export interface AttemptRecord {
  attempt: number;
  strategy: string;
  failed: boolean;
  failureReason?: string;
  durationMs: number;
}

export interface RefinementContext {
  originalError: string;
  attemptHistory: AttemptRecord[];
  currentAttempt: number;
  maxAttempts: number;
}

export interface RefinementResult {
  shouldContinue: boolean;
  excludeStrategies: string[];
  enrichedError: string;
  reason: string;
}

/**
 * Analyze the current state of refinement and decide what to do next.
 */
export function refine(ctx: RefinementContext): RefinementResult {
  const { attemptHistory, currentAttempt, maxAttempts, originalError } = ctx;

  // Rule 1: Hard limit on attempts
  if (currentAttempt >= maxAttempts) {
    return {
      shouldContinue: false,
      excludeStrategies: [],
      enrichedError: originalError,
      reason: `Max attempts reached (${maxAttempts})`,
    };
  }

  // Rule 2: No history yet — first attempt, just proceed
  if (attemptHistory.length === 0) {
    return {
      shouldContinue: true,
      excludeStrategies: [],
      enrichedError: originalError,
      reason: 'First attempt',
    };
  }

  // Collect all failed strategies
  const failedStrategies = attemptHistory
    .filter(a => a.failed)
    .map(a => a.strategy);

  const excludeStrategies = [...new Set(failedStrategies)];

  // Rule 3: 3+ unique strategies all failed — give up
  const uniqueFailed = new Set(failedStrategies);
  if (uniqueFailed.size >= 3) {
    return {
      shouldContinue: false,
      excludeStrategies,
      enrichedError: originalError,
      reason: `${uniqueFailed.size} different strategies all failed — escalating`,
    };
  }

  // Rule 4: Same strategy failed 2+ times (stuck in a loop) — give up
  if (failedStrategies.length >= 2 && uniqueFailed.size === 1) {
    return {
      shouldContinue: false,
      excludeStrategies,
      enrichedError: originalError,
      reason: `Strategy "${failedStrategies[0]}" failed ${failedStrategies.length} times — no alternative found`,
    };
  }

  // Build enriched error with failure context
  const failureSummary = attemptHistory
    .filter(a => a.failed)
    .map(a => `${a.strategy}:failed`)
    .join(', ');

  const enrichedError = `${originalError} [tried: ${failureSummary}]`;

  return {
    shouldContinue: true,
    excludeStrategies,
    enrichedError,
    reason: `Attempt ${currentAttempt + 1}: excluding [${excludeStrategies.join(', ')}]`,
  };
}

/**
 * Filter candidates by removing strategies that already failed.
 * If ALL candidates would be filtered, return the original list
 * (better to retry a failed strategy than have no options).
 */
export function filterCandidates<T extends { strategy: string }>(
  candidates: T[],
  excludeStrategies: string[],
): T[] {
  if (excludeStrategies.length === 0) return candidates;

  const filtered = candidates.filter(c => !excludeStrategies.includes(c.strategy));

  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Create a new RefinementContext for tracking attempts.
 */
export function createRefinementContext(
  errorMessage: string,
  maxAttempts = 3,
): RefinementContext {
  return {
    originalError: errorMessage,
    attemptHistory: [],
    currentAttempt: 0,
    maxAttempts,
  };
}

/**
 * Record an attempt in the refinement context.
 */
export function recordAttempt(
  ctx: RefinementContext,
  strategy: string,
  failed: boolean,
  failureReason?: string,
  durationMs = 0,
): void {
  ctx.attemptHistory.push({
    attempt: ctx.currentAttempt,
    strategy,
    failed,
    failureReason,
    durationMs,
  });
  ctx.currentAttempt++;
}
