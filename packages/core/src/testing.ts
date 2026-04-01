import { createEngine } from './engine/wrap.js';
import type { RepairResult, FailureClassification } from './engine/types.js';

export interface SimulateOptions {
  error: string | Error;
  platform?: string;
  context?: Record<string, unknown>;
  geneMapPath?: string;
}

export interface SimulateResult {
  failure: FailureClassification;
  recommended: { strategy: string; description: string; confidence: number; estimatedCostUsd: number; estimatedSpeedMs: number } | null;
  immune: boolean;
  explanation: string;
  candidateCount: number;
  rootCauseHint?: string;
}

export async function simulateAsync(options: SimulateOptions): Promise<RepairResult> {
  const engine = createEngine({ mode: 'observe', agentId: 'simulate', geneMapPath: options.geneMapPath ?? ':memory:' });
  const error = typeof options.error === 'string' ? new Error(options.error) : options.error;
  return engine.repair(error, options.context);
}

export function simulate(options: SimulateOptions): SimulateResult {
  const engine = createEngine({ mode: 'observe', agentId: 'simulate', geneMapPath: options.geneMapPath ?? ':memory:' });
  const error = typeof options.error === 'string' ? new Error(options.error) : options.error;

  // Access perceive directly (it's private, so we use the gene map for immune check)
  const gm = engine.getGeneMap();

  // Try to classify via a quick repair call — but we need sync.
  // Use the gene map directly for sync simulate.
  // We'll check all error patterns manually via a simple approach:
  // Just run the async version and handle it. For truly sync, use gene map only.

  // For sync: check gene map for known failures
  // We need to find the failure code from the error message.
  // Since we can't call perceive synchronously, we do a best-effort gene check.
  const msg = error.message.toLowerCase();
  const patterns: [string, string, string][] = [
    ['nonce', 'verification-failed', 'signature'],
    ['insufficient', 'payment-insufficient', 'balance'],
    ['rate', 'rate-limited', 'auth'],
    ['429', 'rate-limited', 'auth'],
    ['timeout', 'timeout', 'service'],
    ['500', 'server-error', 'service'],
    ['network', 'token-uninitialized', 'network'],
    ['policy', 'policy-violation', 'policy'],
    ['expired', 'invalid-challenge', 'session'],
    ['malformed', 'malformed-credential', 'service'],
    ['slippage', 'swap-reverted', 'dex'],
    ['reverted', 'tx-reverted', 'batch'],
    ['AA25', 'verification-failed', 'signature'],
  ];

  for (const [pattern, code, category] of patterns) {
    if (msg.includes(pattern.toLowerCase())) {
      const gene = gm.lookup(code as any, category as any);
      if (gene && gene.qValue > 0.4) {
        return {
          failure: { code: code as any, category: category as any, severity: 'high', platform: 'unknown', details: error.message, timestamp: Date.now() },
          recommended: { strategy: gene.strategy, description: `Gene: ${gene.strategy}`, confidence: gene.qValue, estimatedCostUsd: 0, estimatedSpeedMs: gene.avgRepairMs },
          immune: true,
          explanation: `IMMUNE: Gene '${gene.strategy}' (q=${gene.qValue.toFixed(2)}, ${gene.successCount} fixes)`,
          candidateCount: 0,
          rootCauseHint: undefined,
        };
      }
      return {
        failure: { code: code as any, category: category as any, severity: 'high', platform: 'unknown', details: error.message, timestamp: Date.now() },
        recommended: null,
        immune: false,
        explanation: `Perceived: ${code}/${category}. No Gene found.`,
        candidateCount: 0,
        rootCauseHint: undefined,
      };
    }
  }

  return {
    failure: { code: 'unknown', category: 'unknown', severity: 'medium', platform: 'unknown', details: error.message, timestamp: Date.now() },
    recommended: null,
    immune: false,
    explanation: 'Could not classify error.',
    candidateCount: 0,
  };
}
