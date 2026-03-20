import { bus } from './bus.js';
import { GeneMap } from './gene-map.js';
import type {
  FailureClassification,
  GeneCapsule,
  PlatformAdapter,
  RepairCandidate,
  RepairResult,
  Severity,
  REVENUE_AT_RISK as RevenueMap,
} from './types.js';
import { REVENUE_AT_RISK } from './types.js';

// ── Evaluate ────────────────────────────────────────────────────────

export function evaluate(candidates: RepairCandidate[], failure: FailureClassification): RepairCandidate[] {
  const maxSpeed = Math.max(...candidates.map((c) => c.estimatedSpeedMs), 1);
  const maxCost = Math.max(...candidates.map((c) => c.estimatedCostUsd), 0.01);

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
      const score = Math.min(100, Math.round(speedScore + costScore + reqScore + probScore + sevBonus));
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

// ── Commit (simulated) ─────────────────────────────────────────────

export async function commit(
  winner: RepairCandidate,
  _failure: FailureClassification,
): Promise<{ success: boolean; result: string }> {
  // Simulate execution with realistic delay
  const jitter = Math.random() * 200;
  await new Promise((r) => setTimeout(r, Math.min(winner.estimatedSpeedMs * 0.3 + jitter, 800)));

  // In production: call platform SDK, execute DEX swap, renew session, etc.
  return {
    success: true,
    result: `Executed ${winner.strategy}: ${winner.description}`,
  };
}

// ── PCEC Engine ─────────────────────────────────────────────────────

export class PcecEngine {
  private adapters: PlatformAdapter[] = [];
  private geneMap: GeneMap;
  private agentId: string;
  public stats = { repairs: 0, savedRevenue: 0, immuneHits: 0 };
  private readonly MAX_CYCLES = 50;
  private cycleCount = 0;

  constructor(geneMap: GeneMap, agentId: string = 'default') {
    this.geneMap = geneMap;
    this.agentId = agentId;
  }

  /** Register platform adapters (order matters — first match wins for perceive) */
  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.push(adapter);
  }

  /** Perceive chains through adapters until one matches */
  private perceive(error: Error, context?: Record<string, unknown>): FailureClassification {
    for (const adapter of this.adapters) {
      const result = adapter.perceive(error, context);
      if (result) return result;
    }
    // Fallback: unknown
    return {
      code: 'unknown',
      category: 'unknown',
      severity: 'medium',
      platform: 'unknown',
      details: error.message,
      timestamp: Date.now(),
    };
  }

  /** Construct collects candidates from ALL adapters */
  private construct(failure: FailureClassification): RepairCandidate[] {
    const candidates: RepairCandidate[] = [];
    for (const adapter of this.adapters) {
      candidates.push(...adapter.construct(failure));
    }
    // Enrich with Gene Map success rates
    return candidates.map((c) => ({
      ...c,
      successProbability: this.geneMap.getSuccessRate(failure.code, c.strategy),
    }));
  }

  /** Full P→C→E→K repair flow */
  async repair(error: Error, context?: Record<string, unknown>): Promise<RepairResult> {
    const start = Date.now();

    // Safety check: prevent infinite repair cycles
    this.cycleCount++;
    if (this.cycleCount > this.MAX_CYCLES) {
      this.cycleCount = 0;
      bus.emit('error', this.agentId, {
        reason: 'MAX_CYCLES_EXCEEDED',
        cycles: this.MAX_CYCLES,
        message: `PCEC halted after ${this.MAX_CYCLES} cycles to prevent runaway repair`,
      });
      return {
        success: false,
        failure: this.perceive(error, context),
        candidates: [],
        winner: null,
        gene: null,
        immune: false,
        totalMs: 0,
        revenueProtected: 0,
      };
    }

    // ── PERCEIVE ──
    const failure = this.perceive(error, context);
    bus.emit('perceive', this.agentId, {
      code: failure.code,
      category: failure.category,
      severity: failure.severity,
      platform: failure.platform,
      details: failure.details,
      actualBalance: failure.actualBalance,
      requiredAmount: failure.requiredAmount,
    });

    // ── Check Gene Map for immunity (by code+category, NOT platform) ──
    const existingGene = this.geneMap.lookup(failure.code, failure.category);
    if (existingGene) {
      this.stats.immuneHits++;
      this.stats.repairs++;
      const revenue = REVENUE_AT_RISK[failure.category] ?? 50;
      this.stats.savedRevenue += revenue;

      // Add this platform to the gene if it's a new one
      if (!existingGene.platforms.includes(failure.platform)) {
        existingGene.platforms.push(failure.platform);
        this.geneMap.addPlatform(failure.code, failure.category, failure.platform);
      }

      bus.emit('immune', this.agentId, {
        code: failure.code,
        category: failure.category,
        strategy: existingGene.strategy,
        successCount: existingGene.successCount,
        avgRepairMs: existingGene.avgRepairMs,
        platforms: existingGene.platforms,
        crossPlatform: existingGene.platforms.length > 1,
      });

      // Execute known fix instantly
      const immuneStart = Date.now();
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 50)); // near-instant
      const immuneMs = Date.now() - immuneStart;

      // Update gene with new timing
      this.geneMap.store({
        ...existingGene,
        avgRepairMs: immuneMs,
      });

      return {
        success: true,
        failure,
        candidates: [],
        winner: {
          id: existingGene.strategy,
          strategy: existingGene.strategy,
          description: `Immune: ${existingGene.strategy} (${existingGene.successCount} prior fixes, platforms: ${existingGene.platforms.join(', ')})`,
          estimatedCostUsd: 0,
          estimatedSpeedMs: immuneMs,
          requirements: [],
          score: 100,
          successProbability: 0.99,
          platform: failure.platform,
        },
        gene: existingGene,
        immune: true,
        totalMs: Date.now() - start,
        revenueProtected: revenue,
      };
    }

    // ── CONSTRUCT (collects from ALL adapters) ──
    const candidates = this.construct(failure);
    if (candidates.length === 0) {
      bus.emit('error', this.agentId, {
        reason: 'NO_CANDIDATES',
        code: failure.code,
        category: failure.category,
      });
      return {
        success: false,
        failure,
        candidates: [],
        winner: null,
        gene: null,
        immune: false,
        totalMs: Date.now() - start,
        revenueProtected: 0,
      };
    }

    bus.emit('construct', this.agentId, {
      category: failure.category,
      candidateCount: candidates.length,
      candidates: candidates.map((c) => ({ id: c.id, strategy: c.strategy, description: c.description, platform: c.platform })),
    });

    // ── EVALUATE ──
    const scored = evaluate(candidates, failure);
    const winner = scored[0];
    bus.emit('evaluate', this.agentId, {
      winner: winner.strategy,
      score: winner.score,
      platform: winner.platform,
      allScores: scored.map((c) => ({ strategy: c.strategy, score: c.score, platform: c.platform })),
    });

    // ── COMMIT ──
    const result = await commit(winner, failure);
    const totalMs = Date.now() - start;
    const revenue = REVENUE_AT_RISK[failure.category] ?? 50;

    if (result.success) {
      this.stats.repairs++;
      this.stats.savedRevenue += revenue;

      // Store Gene Capsule (keyed by code+category, platform-agnostic)
      const gene: GeneCapsule = {
        failureCode: failure.code,
        category: failure.category,
        strategy: winner.strategy,
        params: { description: winner.description },
        successCount: 1,
        avgRepairMs: totalMs,
        platforms: [failure.platform],
      };
      this.geneMap.store(gene);
      this.cycleCount = 0;

      bus.emit('commit', this.agentId, {
        success: true,
        strategy: winner.strategy,
        platform: winner.platform,
        result: result.result,
        totalMs,
      });

      bus.emit('gene', this.agentId, {
        code: failure.code,
        category: failure.category,
        strategy: winner.strategy,
        platform: failure.platform,
        totalMs,
      });

      bus.emit('stats', this.agentId, {
        totalRepairs: this.stats.repairs,
        savedRevenue: this.stats.savedRevenue,
        immuneHits: this.stats.immuneHits,
        geneCount: this.geneMap.immuneCount(),
      });

      return {
        success: true,
        failure,
        candidates: scored,
        winner,
        gene,
        immune: false,
        totalMs,
        revenueProtected: revenue,
      };
    }

    bus.emit('commit', this.agentId, {
      success: false,
      strategy: winner.strategy,
      error: result.result,
      totalMs,
    });

    return {
      success: false,
      failure,
      candidates: scored,
      winner,
      gene: null,
      immune: false,
      totalMs,
      revenueProtected: 0,
    };
  }

  getStats() {
    return {
      ...this.stats,
      geneCount: this.geneMap.immuneCount(),
      genes: this.geneMap.list(),
    };
  }
}
