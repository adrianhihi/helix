/**
 * Multi-Dimensional Repair Scoring
 *
 * Expands single Q-value into 6 dimensions for richer evaluation.
 */

export interface RepairScore {
  overall: number;
  dimensions: {
    accuracy: number;
    costEfficiency: number;
    latency: number;
    safety: number;
    transferability: number;
    reliability: number;
  };
}

export const SCORE_WEIGHTS = {
  accuracy: 0.25,
  costEfficiency: 0.15,
  latency: 0.15,
  safety: 0.20,
  transferability: 0.10,
  reliability: 0.15,
};

export function computeRepairScore(params: {
  perceiveSource?: 'adapter' | 'embedding' | 'llm' | 'unknown';
  costUsd?: number;
  repairMs?: number;
  mode?: string;
  withinBudget?: boolean;
  platformCount?: number;
  consecutiveSuccesses?: number;
}): RepairScore {
  const dims = {
    accuracy:
      params.perceiveSource === 'adapter' ? 1.0 :
      params.perceiveSource === 'embedding' ? 0.85 :
      params.perceiveSource === 'llm' ? 0.7 : 0.3,

    costEfficiency:
      (params.costUsd ?? 0) === 0 ? 1.0 :
      (params.costUsd ?? 0) < 0.001 ? 0.8 :
      (params.costUsd ?? 0) < 0.01 ? 0.5 : 0.2,

    latency: Math.max(0, 1.0 - Math.log10(Math.max(1, params.repairMs ?? 1)) / 4),

    safety:
      params.mode === 'observe' ? 1.0 :
      params.mode === 'auto' ? 0.9 :
      (params.withinBudget !== false) ? 0.7 : 0.3,

    transferability: Math.min(1.0, (params.platformCount ?? 1) / 3),

    reliability: Math.min(1.0, (params.consecutiveSuccesses ?? 0) / 10),
  };

  const overall = Object.entries(SCORE_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + dims[key as keyof typeof dims] * weight,
    0,
  );

  return { overall, dimensions: dims };
}
