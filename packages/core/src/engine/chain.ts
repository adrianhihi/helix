import type { RepairCandidate, StrategyStep } from './types.js';

const COMPOUND_PATTERNS: { patterns: string[]; chain: string[] }[] = [
  { patterns: ['nonce', 'gas'], chain: ['refresh_nonce', 'speed_up_transaction'] },
  { patterns: ['nonce', 'balance'], chain: ['refresh_nonce', 'reduce_request'] },
  { patterns: ['timeout', 'nonce'], chain: ['backoff_retry', 'refresh_nonce'] },
  { patterns: ['session', 'nonce'], chain: ['renew_session', 'refresh_nonce'] },
  { patterns: ['rate', 'timeout'], chain: ['backoff_retry', 'extend_deadline'] },
  { patterns: ['balance', 'gas'], chain: ['reduce_request', 'speed_up_transaction'] },
];

/**
 * Strategy Chain Detection
 *
 * Scans the error message for multiple failure signals.
 * If found, adds a chain candidate alongside individual candidates.
 *
 * Example:
 *   "nonce mismatch" + "gas too low" in same error
 *   → adds [refresh_nonce, speed_up_transaction] chain candidate
 */
export function detectStrategyChain(
  errorMessage: string,
  candidates: RepairCandidate[],
): RepairCandidate[] {
  const msgLower = errorMessage.toLowerCase();

  for (const compound of COMPOUND_PATTERNS) {
    if (compound.patterns.every(p => msgLower.includes(p))) {
      const chainCandidate: RepairCandidate = {
        id: `chain-${compound.chain.join('+')}`,
        strategy: compound.chain.join('+'),
        steps: compound.chain.map(s => ({ strategy: s, stopOnFailure: true })),
        description: `Chain: ${compound.chain.join(' → ')}`,
        estimatedCostUsd: 0,
        estimatedSpeedMs: compound.chain.length * 500,
        requirements: [],
        score: 0,
        successProbability: 0.65,
        platform: 'unknown',
        source: 'adapter',
        reasoning: `Compound error: ${compound.patterns.join(' + ')}`,
      };
      return [...candidates, chainCandidate];
    }
  }

  return candidates;
}

export function isChainStrategy(strategy: string): boolean {
  return strategy.includes('+');
}

export function parseChainSteps(strategy: string): StrategyStep[] {
  return strategy.split('+').map(s => ({
    strategy: s.trim(),
    stopOnFailure: true,
  })).slice(0, 3); // max 3 steps
}
