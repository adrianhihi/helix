import type { FailureClassification, GeneCapsule, RepairCandidate, Severity } from './types.js';
import { thompsonSample } from './gene-map.js';

export interface EvaluateOptions {
  /** Gene Map genes for Thompson Sampling boost. Keyed by strategy name. */
  genesByStrategy?: Map<string, GeneCapsule>;
  /** Use Thompson Sampling for exploration vs exploitation. Default: true. */
  thompsonSampling?: boolean;
}

export function evaluate(
  candidates: RepairCandidate[],
  failure: FailureClassification,
  options?: EvaluateOptions,
): RepairCandidate[] {
  const maxSpeed = Math.max(...candidates.map((c) => c.estimatedSpeedMs), 1);
  const maxCost = Math.max(...candidates.map((c) => c.estimatedCostUsd), 0.01);
  const useThompson = options?.thompsonSampling !== false;
  const genesByStrategy = options?.genesByStrategy;

  const severityBonus: Record<Severity, number> = {
    low: 0,
    medium: 5,
    high: 10,
    critical: 20,
  };

  return candidates
    .map((c) => {
      const speedScore = 25 * (1 - c.estimatedSpeedMs / maxSpeed);
      const costScore = 25 * (1 - c.estimatedCostUsd / maxCost);
      const reqScore = 15 * (1 - c.requirements.length / 3);
      const probScore = 25 * (c.successProbability ?? 0.5);
      const sevBonus = severityBonus[failure.severity];
      let score = Math.min(100, Math.round(speedScore + costScore + reqScore + probScore + sevBonus));

      // Thompson Sampling: add exploration bonus from Gene Map variance
      if (useThompson && genesByStrategy) {
        const gene = genesByStrategy.get(c.strategy);
        if (gene) {
          const sample = thompsonSample(gene.qValue, gene.qVariance ?? 0.25);
          // Scale Thompson sample (0-1 range) to a ±10 point bonus
          const bonus = Math.round((sample - gene.qValue) * 20);
          score = Math.max(0, Math.min(100, score + bonus));
        }
      }

      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}
