/**
 * Self-Refine: Iterative refinement with failure reflection.
 *
 * Paper: Self-Refine (2303.17651)
 *
 * When a repair strategy fails, instead of blind retry:
 * 1. Reflect: analyze WHY the strategy failed
 * 2. Enrich: add failure context to the next diagnosis
 * 3. Re-diagnose: with richer context, pick a different strategy
 * 4. Retry: execute the new strategy
 */

export interface RefinementContext {
  originalError: string;
  attemptHistory: AttemptRecord[];
  currentAttempt: number;
  maxAttempts: number;
}

export interface AttemptRecord {
  attempt: number;
  strategy: string;
  failed: boolean;
  failureReason?: string;
  durationMs: number;
  reflection?: string;
}

export interface Reflection {
  whyFailed: string;
  whatToAvoid: string[];
  suggestedApproach: string;
  confidence: number;
}

/**
 * Generate a reflection on why a repair strategy failed.
 */
export function reflect(
  originalError: string,
  strategy: string,
  failureReason: string,
  history: AttemptRecord[],
): Reflection {
  const triedStrategies = history.map(h => h.strategy);
  return analyzeFailurePattern(strategy, failureReason, triedStrategies);
}

function analyzeFailurePattern(
  strategy: string,
  failureReason: string,
  triedStrategies: string[],
): Reflection {
  const reason = failureReason.toLowerCase();

  // Nonce strategies failing
  if (strategy === 'refresh_nonce' && reason.includes('nonce')) {
    return {
      whyFailed: 'Nonce refresh failed — likely mempool congestion or concurrent transactions',
      whatToAvoid: ['refresh_nonce'],
      suggestedApproach: 'remove_and_resubmit',
      confidence: 0.7,
    };
  }

  if (strategy === 'remove_and_resubmit' && reason.includes('nonce')) {
    return {
      whyFailed: 'Even remove_and_resubmit failed — nonce is being contested by another tx',
      whatToAvoid: ['refresh_nonce', 'remove_and_resubmit'],
      suggestedApproach: 'backoff_retry',
      confidence: 0.6,
    };
  }

  // Gas strategies failing
  if (strategy === 'speed_up_transaction' && (reason.includes('gas') || reason.includes('underpriced'))) {
    return {
      whyFailed: 'Gas bump of 1.3x was not enough — network is highly congested',
      whatToAvoid: ['speed_up_transaction'],
      suggestedApproach: 'backoff_retry',
      confidence: 0.6,
    };
  }

  // Balance strategies failing
  if (strategy === 'reduce_request' && reason.includes('insufficient')) {
    return {
      whyFailed: 'Even reduced amount exceeds balance — account is nearly empty',
      whatToAvoid: ['reduce_request'],
      suggestedApproach: 'split_transaction',
      confidence: 0.5,
    };
  }

  if (strategy === 'split_transaction' && reason.includes('insufficient')) {
    return {
      whyFailed: 'Split transaction still failing — truly insufficient funds',
      whatToAvoid: ['reduce_request', 'split_transaction'],
      suggestedApproach: 'hold_and_notify',
      confidence: 0.8,
    };
  }

  // Rate limit strategies failing
  if (strategy === 'backoff_retry' && (reason.includes('429') || reason.includes('rate'))) {
    return {
      whyFailed: 'Backoff delay was not long enough — still rate limited',
      whatToAvoid: [],
      suggestedApproach: 'backoff_retry',
      confidence: 0.7,
    };
  }

  // Session strategies failing
  if (strategy === 'renew_session' && (reason.includes('session') || reason.includes('auth') || reason.includes('token'))) {
    return {
      whyFailed: 'Session renewal failed — token refresh endpoint may be down or credentials invalid',
      whatToAvoid: ['renew_session'],
      suggestedApproach: 'backoff_retry',
      confidence: 0.5,
    };
  }

  // Same strategy tried multiple times
  if (triedStrategies.filter(s => s === strategy).length >= 2) {
    return {
      whyFailed: `Strategy "${strategy}" has been tried ${triedStrategies.filter(s => s === strategy).length} times — it's not working for this error`,
      whatToAvoid: [strategy],
      suggestedApproach: 'hold_and_notify',
      confidence: 0.8,
    };
  }

  // Generic fallback
  return {
    whyFailed: `Strategy "${strategy}" failed: ${failureReason.substring(0, 100)}`,
    whatToAvoid: [strategy],
    suggestedApproach: triedStrategies.includes('backoff_retry') ? 'hold_and_notify' : 'backoff_retry',
    confidence: 0.4,
  };
}

/**
 * Build enriched error context from reflection.
 */
export function enrichContext(
  originalError: string,
  reflection: Reflection,
  history: AttemptRecord[],
): string {
  const parts = [originalError];

  if (history.length > 0) {
    const failed = history.map(h => `${h.strategy}(failed: ${h.failureReason?.substring(0, 50) || 'unknown'})`);
    parts.push(`[Previously tried: ${failed.join(', ')}]`);
  }

  parts.push(`[Reflection: ${reflection.whyFailed}]`);

  if (reflection.whatToAvoid.length > 0) {
    parts.push(`[Avoid: ${reflection.whatToAvoid.join(', ')}]`);
  }

  return parts.join(' ');
}

/**
 * Determine if we should continue refining or give up.
 */
export function shouldContinueRefining(ctx: RefinementContext): boolean {
  if (ctx.currentAttempt >= ctx.maxAttempts) return false;

  const lastAttempt = ctx.attemptHistory[ctx.attemptHistory.length - 1];
  if (lastAttempt?.reflection?.includes('escalate')) return false;

  const uniqueStrategies = new Set(ctx.attemptHistory.map(h => h.strategy));
  if (uniqueStrategies.size >= 3 && ctx.attemptHistory.every(h => h.failed)) return false;

  return true;
}
