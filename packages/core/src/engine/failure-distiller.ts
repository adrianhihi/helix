/**
 * Failure Distiller — learns from failed repairs.
 *
 * When the same (failureCode, strategy) combination fails N times,
 * auto-generates a defensive Gene that blocks the failing strategy
 * in that condition and suggests an alternative.
 */

import type { GeneMap } from './gene-map.js';

export interface FailedRepairRecord {
  failureCode: string;
  category: string;
  strategy: string;
  error: string;
  repairError: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

const DISTILL_THRESHOLD = 5;

export function analyzeFailurePattern(failures: FailedRepairRecord[]): {
  category: string;
  condition: string;
  reason: string;
  platforms: string[];
} {
  const contexts = failures.map(f => f.context ?? {});
  const reasons = failures.map(f => f.repairError);

  const commonConditions: string[] = [];

  const gasPrices = contexts.map(c => c.gasPriceGwei as number).filter(Boolean);
  if (gasPrices.length > 0) {
    const avg = gasPrices.reduce((a, b) => a + b, 0) / gasPrices.length;
    if (avg > 100) commonConditions.push(`high_gas(avg=${Math.round(avg)})`);
  }

  const hours = failures.map(f => new Date(f.timestamp).getHours());
  if (hours.length >= 3 && hours.every(h => Math.abs(h - hours[0]) < 3)) {
    commonConditions.push(`time_window(${hours[0]}-${hours[0] + 3}h)`);
  }

  const platforms = [...new Set(contexts.map(c => c.platform as string).filter(Boolean))];

  const reasonCounts: Record<string, number> = {};
  reasons.forEach(r => { reasonCounts[r] = (reasonCounts[r] || 0) + 1; });
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

  return {
    category: failures[0].category,
    condition: commonConditions.join(' + ') || 'repeated_failure',
    reason: topReason,
    platforms: platforms.length > 0 ? platforms : ['generic'],
  };
}

export function maybeDistillFromFailures(
  geneMap: GeneMap,
  failureCode: string,
  strategy: string,
): boolean {
  const count = geneMap.getFailedRepairCount(failureCode, strategy);
  if (count < DISTILL_THRESHOLD) return false;

  const failures = geneMap.getFailedRepairs(failureCode, strategy);
  const pattern = analyzeFailurePattern(failures);

  geneMap.store({
    failureCode: failureCode as any,
    category: pattern.category as any,
    strategy: 'escalate',
    params: {
      _defensive: true,
      _blockedStrategy: strategy,
      _condition: pattern.condition,
      _reason: pattern.reason,
    },
    successCount: 0,
    avgRepairMs: 0,
    platforms: pattern.platforms as any[],
    qValue: 0.4,
    consecutiveFailures: 0,
  });

  return true;
}
