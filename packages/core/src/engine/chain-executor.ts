import type { FailureClassification, StrategyStep } from './types.js';
import type { CommitResult, HelixProvider } from './provider.js';

export interface ChainResult {
  commitResult: CommitResult;
  stepsExecuted: { strategy: string; success: boolean; ms: number }[];
}

/**
 * Execute a multi-step strategy chain, merging overrides between steps.
 *
 * Each step's overrides are spread directly into the context for the next step,
 * so strategies that read context.nonce, context.to, etc. see values from prior steps.
 */
export async function executeChain(
  provider: HelixProvider,
  steps: StrategyStep[],
  failure: FailureClassification,
  context?: Record<string, unknown>,
): Promise<ChainResult> {
  let combinedOverrides: Record<string, unknown> = {};
  const stepsExecuted: { strategy: string; success: boolean; ms: number }[] = [];
  let chainSuccess = true;

  const bounded = steps.slice(0, 3);

  for (const step of bounded) {
    const stepStart = Date.now();
    try {
      const stepContext = { ...context, ...combinedOverrides };
      const stepResult = await provider.execute(step.strategy, failure, stepContext);
      const stepMs = Date.now() - stepStart;
      stepsExecuted.push({ strategy: step.strategy, success: stepResult.success, ms: stepMs });

      if (stepResult.success) {
        combinedOverrides = { ...combinedOverrides, ...stepResult.overrides };
      } else {
        chainSuccess = false;
        if (step.stopOnFailure !== false) break;
      }
    } catch {
      const stepMs = Date.now() - stepStart;
      stepsExecuted.push({ strategy: step.strategy, success: false, ms: stepMs });
      chainSuccess = false;
      if (step.stopOnFailure !== false) break;
    }
  }

  return {
    commitResult: {
      success: chainSuccess,
      overrides: combinedOverrides,
      description: chainSuccess
        ? `Chain [${bounded.map(s => s.strategy).join(' → ')}] completed`
        : `Chain failed at step: ${stepsExecuted[stepsExecuted.length - 1]?.strategy}`,
    },
    stepsExecuted,
  };
}
