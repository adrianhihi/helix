import { bus } from './bus.js';
import { GeneMap } from './gene-map.js';
import { evaluate } from './evaluate.js';
import { HelixProvider } from './provider.js';
import type { CommitResult } from './provider.js';
import type {
  FailureClassification,
  GeneCapsule,
  HelixMode,
  PlatformAdapter,
  RepairCandidate,
  RepairResult,
  WrapOptions,
} from './types.js';
import { REVENUE_AT_RISK } from './types.js';
import { getRootCause } from './root-causes.js';

// Category C strategies that move funds — require 'full' mode
const FUND_MOVEMENT_STRATEGIES = [
  'swap_currency', 'split_transaction', 'topup_from_reserve',
  'cancel_pending_txs', 'switch_stablecoin', 'split_swap',
  'swap_direct', 'swap_multihop', 'bridge_tokens', 'top_up_sponsor',
  'self_pay_gas', 'create_target_wallet', 'reroute_via_alt',
  'refund_waterfall', 'switch_offramp',
];

function makeResult(partial: Partial<RepairResult> & { failure: FailureClassification }): RepairResult {
  return {
    success: false,
    candidates: [],
    winner: null,
    gene: null,
    immune: false,
    totalMs: 0,
    revenueProtected: 0,
    mode: 'observe',
    explanation: '',
    verified: false,
    costEstimate: 0,
    ...partial,
  };
}

export class PcecEngine {
  private adapters: PlatformAdapter[] = [];
  private geneMap: GeneMap;
  private agentId: string;
  private provider: HelixProvider;
  private options: WrapOptions;
  public stats = { repairs: 0, savedRevenue: 0, immuneHits: 0 };
  private readonly MAX_CYCLES = 50;
  private cycleCount = 0;
  /** D6: Systematic failure tracker */
  private failureTracker: Map<string, { count: number; firstSeen: number; lastSeen: number }> = new Map();
  /** OPT-5: Recent failures for co-occurrence detection */
  private recentFailures: { code: string; category: string; timestamp: number }[] = [];

  constructor(geneMap: GeneMap, agentId: string = 'default', options?: WrapOptions) {
    this.geneMap = geneMap;
    this.agentId = agentId;
    this.options = options ?? {};
    this.provider = new HelixProvider(options?.provider);
  }

  private checkSystematic(failure: FailureClassification): string | null {
    const key = `${this.agentId}:${failure.code}:${failure.category}`;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const tracker = this.failureTracker.get(key);
    if (!tracker || now - tracker.lastSeen > oneHour) {
      this.failureTracker.set(key, { count: 1, firstSeen: now, lastSeen: now });
      return null;
    }
    tracker.count++;
    tracker.lastSeen = now;
    if (tracker.count >= 5) {
      return `SYSTEMATIC: ${failure.code}/${failure.category} triggered ${tracker.count}x in ${Math.round((now - tracker.firstSeen) / 60000)}min for agent '${this.agentId}'. Likely a code bug, not transient.`;
    }
    return null;
  }

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.push(adapter);
  }

  /** D16: Negative pattern guard — prevent false positives from success messages */
  private shouldSkipPerceive(error: Error): boolean {
    const msg = error.message.toLowerCase();
    const successIndicators = ['success', 'completed', 'confirmed', 'approved', 'settled', 'transferred successfully'];
    const errorIndicators = ['error', 'failed', 'rejected', 'reverted', 'denied', 'insufficient', 'expired', 'timeout', 'mismatch', 'limit', 'invalid'];
    const hasSuccess = successIndicators.some(s => msg.includes(s));
    const hasError = errorIndicators.some(e => msg.includes(e));
    return hasSuccess && !hasError;
  }

  private perceive(error: Error, context?: Record<string, unknown>): FailureClassification {
    if (this.shouldSkipPerceive(error)) {
      return {
        code: 'unknown', category: 'unknown', severity: 'low',
        platform: 'unknown', details: `Skipped: message appears to indicate success: ${error.message}`,
        timestamp: Date.now(),
      };
    }
    for (const adapter of this.adapters) {
      const result = adapter.perceive(error, context);
      if (result) {
        const rc = getRootCause(result.code, result.category);
        if (rc) result.rootCauseHint = rc.hint;
        return result;
      }
    }
    return {
      code: 'unknown', category: 'unknown', severity: 'medium',
      platform: 'unknown', details: error.message, timestamp: Date.now(),
    };
  }

  private constructCandidates(failure: FailureClassification): RepairCandidate[] {
    const candidates: RepairCandidate[] = [];
    for (const adapter of this.adapters) {
      candidates.push(...adapter.construct(failure));
    }
    return candidates.map((c) => ({
      ...c,
      successProbability: this.geneMap.getSuccessRate(failure.code, c.strategy),
    }));
  }

  private async verify(
    failure: FailureClassification,
    candidate: RepairCandidate,
    commitResult: CommitResult,
  ): Promise<boolean> {
    if (!commitResult.success) return false;

    // Mutative strategies should produce overrides
    const mutative = ['refresh_nonce', 'switch_network', 'reduce_request',
      'fix_params', 'switch_endpoint', 'extend_deadline'];
    if (mutative.includes(candidate.strategy)) {
      if (Object.keys(commitResult.overrides).length === 0 &&
          !commitResult.description.includes('MOCK')) {
        return false;
      }
    }

    // Cost ceiling check
    if (candidate.estimatedCostUsd > (this.options.maxRepairCostUsd ?? Infinity)) {
      return false;
    }

    return true;
  }

  async repair(error: Error, context?: Record<string, unknown>): Promise<RepairResult> {
    const start = Date.now();
    const mode: HelixMode = this.options.mode ?? 'auto';

    // Safety: prevent infinite cycles
    this.cycleCount++;
    if (this.cycleCount > this.MAX_CYCLES) {
      this.cycleCount = 0;
      const failure = this.perceive(error, context);
      bus.emit('error', this.agentId, { reason: 'MAX_CYCLES_EXCEEDED', cycles: this.MAX_CYCLES });
      return makeResult({ failure, explanation: `PCEC halted after ${this.MAX_CYCLES} cycles`, mode });
    }

    // ── PERCEIVE ──
    const failure = this.perceive(error, context);
    bus.emit('perceive', this.agentId, {
      code: failure.code, category: failure.category,
      severity: failure.severity, platform: failure.platform,
      details: failure.details,
    });

    // ── D6: Systematic failure detection ──
    const systematicWarning = this.checkSystematic(failure);
    if (systematicWarning) {
      bus.emit('error', this.agentId, { reason: 'SYSTEMATIC', message: systematicWarning });
      this.options.onSystematic?.(systematicWarning, failure);
    }

    // ── OPT-5: Co-occurrence tracking for Gene Links ──
    const now = Date.now();
    this.recentFailures = this.recentFailures.filter(f => now - f.timestamp < 60_000);
    for (const recent of this.recentFailures) {
      if (recent.code !== failure.code || recent.category !== failure.category) {
        this.geneMap.recordCoOccurrence(recent.code, recent.category, failure.code, failure.category);
      }
    }
    this.recentFailures.push({ code: failure.code, category: failure.category, timestamp: now });

    // ── GENE MAP LOOKUP (with Q-value ranking) ──
    const existingGene = this.geneMap.lookup(failure.code, failure.category);
    if (existingGene && existingGene.qValue > 0.3) {
      this.stats.immuneHits++;
      this.stats.repairs++;
      const revenue = REVENUE_AT_RISK[failure.category] ?? 50;
      this.stats.savedRevenue += revenue;

      if (!existingGene.platforms.includes(failure.platform)) {
        existingGene.platforms.push(failure.platform);
        this.geneMap.addPlatform(failure.code, failure.category, failure.platform);
      }

      const explanation = `IMMUNE: Gene '${existingGene.strategy}' found ` +
        `(q=${existingGene.qValue.toFixed(2)}, ${existingGene.successCount} fixes). ` +
        `Platforms: ${existingGene.platforms.join(', ')}`;

      bus.emit('immune', this.agentId, {
        code: failure.code, category: failure.category,
        strategy: existingGene.strategy, successCount: existingGene.successCount,
        platforms: existingGene.platforms, crossPlatform: existingGene.platforms.length > 1,
      });

      if (mode === 'observe') {
        return makeResult({
          success: true, immune: true, mode, explanation, failure,
          gene: existingGene, totalMs: Date.now() - start,
          revenueProtected: revenue,
        });
      }

      // Auto/Full mode: execute the immune strategy
      const commitResult = await this.provider.execute(existingGene.strategy, failure, context);
      const verified = await this.verify(
        failure,
        { strategy: existingGene.strategy, estimatedCostUsd: 0 } as RepairCandidate,
        commitResult,
      );

      if (verified) {
        this.geneMap.recordSuccess(failure.code, failure.category, Date.now() - start);
      } else {
        this.geneMap.recordFailure(failure.code, failure.category);
      }

      this.cycleCount = 0;
      return makeResult({
        success: verified, immune: true, mode, verified,
        explanation: explanation + (verified ? '\n✓ Verified' : '\n✗ Verification failed'),
        failure, gene: existingGene,
        winner: {
          id: existingGene.strategy, strategy: existingGene.strategy,
          description: `Immune: ${existingGene.strategy}`,
          estimatedCostUsd: 0, estimatedSpeedMs: Date.now() - start,
          requirements: [], score: 100, successProbability: 0.99,
          platform: failure.platform,
        },
        totalMs: Date.now() - start, revenueProtected: revenue,
        commitOverrides: commitResult.overrides,
      });
    }

    // ── CONSTRUCT ──
    let candidates = this.constructCandidates(failure);

    // ── FILTER: blocklist/allowlist ──
    const skippedStrategies: string[] = [];
    if (this.options.blockStrategies?.length) {
      candidates = candidates.filter(c => {
        if (this.options.blockStrategies!.includes(c.strategy)) {
          skippedStrategies.push(c.strategy);
          return false;
        }
        return true;
      });
    }

    // ── FILTER: provider capability ──
    candidates = candidates.filter(c => {
      if (!this.provider.canExecute(c.strategy)) {
        skippedStrategies.push(`${c.strategy} (no provider)`);
        return false;
      }
      return true;
    });

    // ── FILTER: cost ceiling ──
    const maxCost = this.options.maxRepairCostUsd ?? Infinity;
    candidates = candidates.filter(c => {
      if (c.estimatedCostUsd > maxCost) {
        skippedStrategies.push(`${c.strategy} (cost $${c.estimatedCostUsd} > ceiling $${maxCost})`);
        return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      bus.emit('error', this.agentId, { reason: 'NO_CANDIDATES', code: failure.code });
      return makeResult({
        failure, mode,
        explanation: `No viable candidates. Skipped: ${skippedStrategies.join(', ') || 'none'}`,
        skippedStrategies,
      });
    }

    bus.emit('construct', this.agentId, {
      category: failure.category, candidateCount: candidates.length,
      candidates: candidates.map(c => ({ id: c.id, strategy: c.strategy, platform: c.platform })),
    });

    // ── EVALUATE ──
    const scored = evaluate(candidates, failure);
    const winner = scored[0];
    bus.emit('evaluate', this.agentId, {
      winner: winner.strategy, score: winner.score, platform: winner.platform,
      allScores: scored.map(c => ({ strategy: c.strategy, score: c.score })),
    });

    // ── BUILD EXPLANATION (with root cause hints OPT-7) ──
    const rootCause = getRootCause(failure.code, failure.category);
    const explanation = [
      `Perceived: ${failure.code} → ${failure.category} [${failure.severity}] (${failure.platform})`,
      rootCause ? `Root cause: ${rootCause.likelyCause}` : '',
      rootCause ? `Suggested: ${rootCause.suggestedAction}` : '',
      rootCause?.isLikelySystematic ? '⚠️ Likely systematic — check configuration.' : '',
      `Candidates: ${scored.map(c => `${c.strategy}(${c.score})`).join(', ')}`,
      `Selected: ${winner.strategy} (score: ${winner.score})`,
      skippedStrategies.length > 0 ? `Skipped: ${skippedStrategies.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // ── OBSERVE MODE: return recommendation ──
    if (mode === 'observe') {
      return makeResult({
        success: true, mode, explanation, failure,
        candidates: scored, winner, costEstimate: winner.estimatedCostUsd,
        skippedStrategies,
      });
    }

    // ── AUTO MODE: block fund movement strategies ──
    if (mode === 'auto' && FUND_MOVEMENT_STRATEGIES.includes(winner.strategy)) {
      return makeResult({
        failure, mode, candidates: scored, winner,
        explanation: explanation + `\n⚠️ Strategy '${winner.strategy}' requires 'full' mode for fund movement.`,
        costEstimate: winner.estimatedCostUsd, skippedStrategies,
      });
    }

    // ── IDEMPOTENCY CHECK (D5) ──
    const inProgress = this.geneMap.checkRepairInProgress(failure.code, failure.category);
    if (inProgress.inProgress) {
      return makeResult({
        success: !!inProgress.txHash, mode, failure, candidates: scored, winner,
        explanation: explanation + `\nIdempotency: repair already ${inProgress.txHash ? 'completed' : 'in progress'} (${inProgress.repairId})`,
        verified: !!inProgress.txHash,
        costEstimate: winner.estimatedCostUsd, skippedStrategies,
      });
    }

    // ── COMMIT ──
    const repairId = this.geneMap.generateRepairId();
    this.geneMap.logRepairStart(repairId, failure.code, failure.category, winner.strategy);
    const commitResult = await this.provider.execute(winner.strategy, failure, context);
    const totalMs = Date.now() - start;
    const revenue = REVENUE_AT_RISK[failure.category] ?? 50;

    bus.emit('commit', this.agentId, {
      success: commitResult.success, strategy: winner.strategy,
      description: commitResult.description, totalMs,
    });

    // ── VERIFY (OPT-2: SAGE paper) ──
    const verified = await this.verify(failure, winner, commitResult);
    bus.emit('verify', this.agentId, { verified, strategy: winner.strategy });

    if (verified) {
      this.stats.repairs++;
      this.stats.savedRevenue += revenue;
      this.cycleCount = 0;

      const txHash = commitResult.overrides.txHash as string | undefined;
      this.geneMap.logRepairComplete(repairId, txHash);

      const gene: GeneCapsule = {
        failureCode: failure.code, category: failure.category,
        strategy: winner.strategy, params: commitResult.overrides,
        successCount: 1, avgRepairMs: totalMs,
        platforms: [failure.platform],
        qValue: 0.6, consecutiveFailures: 0,
      };
      this.geneMap.store(gene);
      this.geneMap.recordSuccess(failure.code, failure.category, totalMs);

      bus.emit('gene', this.agentId, {
        code: failure.code, category: failure.category,
        strategy: winner.strategy, platform: failure.platform,
      });
      bus.emit('stats', this.agentId, {
        totalRepairs: this.stats.repairs, savedRevenue: this.stats.savedRevenue,
        immuneHits: this.stats.immuneHits, geneCount: this.geneMap.immuneCount(),
      });

      // OPT-4: Update context + OPT-10: Attribution
      this.geneMap.updateContext(failure.code, failure.category, true, { chain: (context?.chainId as number)?.toString(), platform: failure.platform });
      this.geneMap.recordAttribution({ repairId, agentId: this.agentId, stepId: context?.stepId as string, workflow: context?.workflow as string, failureCode: failure.code, category: failure.category, strategy: winner.strategy, success: true });

      const attribution = { agentId: this.agentId, stepId: context?.stepId as string, workflow: context?.workflow as string, timestamp: Date.now() };

      return makeResult({
        success: true, mode, verified: true,
        explanation: explanation + '\n✓ Verified',
        failure, candidates: scored, winner,
        gene: this.geneMap.lookup(failure.code, failure.category) ?? gene,
        totalMs, revenueProtected: revenue,
        costEstimate: winner.estimatedCostUsd, skippedStrategies,
        attribution,
        commitOverrides: commitResult.overrides,
      });
    }

    // Verify failed
    this.geneMap.logRepairFailed(repairId);
    this.geneMap.updateContext(failure.code, failure.category, false, { chain: (context?.chainId as number)?.toString(), platform: failure.platform });
    this.geneMap.recordFailureAnalysis(failure.code, failure.category, `Strategy '${winner.strategy}' failed: ${commitResult.description}`);
    this.geneMap.recordAttribution({ repairId, agentId: this.agentId, stepId: context?.stepId as string, workflow: context?.workflow as string, failureCode: failure.code, category: failure.category, strategy: winner.strategy, success: false });
    if (existingGene) {
      this.geneMap.recordFailure(failure.code, failure.category);
    }

    return makeResult({
      failure, mode, candidates: scored, winner, totalMs,
      explanation: explanation + '\n✗ Verification failed',
      costEstimate: winner.estimatedCostUsd, skippedStrategies,
      attribution: { agentId: this.agentId, stepId: context?.stepId as string, workflow: context?.workflow as string, timestamp: Date.now() },
    });
  }

  getStats() {
    return {
      ...this.stats,
      geneCount: this.geneMap.immuneCount(),
      genes: this.geneMap.list(),
    };
  }

  getGeneMap(): GeneMap {
    return this.geneMap;
  }
}
