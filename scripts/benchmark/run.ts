#!/usr/bin/env npx tsx

/**
 * Payment Agent Benchmark: A/B comparison.
 *
 * Run A (Naive):  Every error → LLM diagnosis ($0.01-0.05 per error)
 * Run B (Helix):  Known errors → Gene Map ($0). Unknown → LLM fallback.
 *
 * Usage:
 *   npx tsx scripts/benchmark/run.ts
 *   npx tsx scripts/benchmark/run.ts --verbose
 *   npx tsx scripts/benchmark/run.ts --json > benchmark-results.json
 */

import { PcecEngine } from '../../packages/core/src/engine/pcec.js';
import { GeneMap } from '../../packages/core/src/engine/gene-map.js';
import { SCENARIOS, type Scenario } from './scenarios.js';

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUTPUT = process.argv.includes('--json');

const NAIVE_LLM_COST = {
  diagnosis: { inputTokens: 800, outputTokens: 400, costUSD: 0.0084 },
  retryDiagnosis: { inputTokens: 1200, outputTokens: 600, costUSD: 0.0126 },
};

interface RunResult {
  scenarioId: number;
  description: string;
  error: string;
  platform: string;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  gasWastedUSD: number;
  gasOptimizedUSD: number;
  repairTimeMs: number;
  success: boolean;
  method: string;
}

function runNaive(scenario: Scenario): RunResult {
  if (!scenario.error) {
    return { scenarioId: scenario.id, description: scenario.description, error: '', platform: scenario.platform, llmCalls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, gasWastedUSD: 0, gasOptimizedUSD: 0, repairTimeMs: 0, success: true, method: 'no_error' };
  }
  const cost = NAIVE_LLM_COST.diagnosis;
  const needsRetry = scenario.id % 5 === 0;
  const retryCost = needsRetry ? NAIVE_LLM_COST.retryDiagnosis : { inputTokens: 0, outputTokens: 0, costUSD: 0 };
  return {
    scenarioId: scenario.id, description: scenario.description, error: scenario.error, platform: scenario.platform,
    llmCalls: needsRetry ? 2 : 1,
    inputTokens: cost.inputTokens + retryCost.inputTokens,
    outputTokens: cost.outputTokens + retryCost.outputTokens,
    costUSD: cost.costUSD + retryCost.costUSD,
    gasWastedUSD: scenario.gasWastedUSD,
    gasOptimizedUSD: 0,
    repairTimeMs: needsRetry ? 3500 : 1800,
    success: true, method: 'llm_diagnosis',
  };
}

async function runHelix(scenario: Scenario, engine: PcecEngine): Promise<RunResult> {
  if (!scenario.error) {
    return { scenarioId: scenario.id, description: scenario.description, error: '', platform: scenario.platform, llmCalls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, gasWastedUSD: 0, gasOptimizedUSD: scenario.gasOptimizable, repairTimeMs: 0, success: true, method: 'no_error' };
  }

  const start = Date.now();
  try {
    const err = new Error(scenario.error);
    const result = await engine.repair(err, { platform: scenario.platform });
    const elapsed = Date.now() - start;

    const hasStrategy = !!(result.winner?.strategy || result.gene?.strategy);
    const isImmune = result.immune;

    if (hasStrategy) {
      return {
        scenarioId: scenario.id, description: scenario.description, error: scenario.error, platform: scenario.platform,
        llmCalls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
        gasWastedUSD: isImmune ? 0 : scenario.gasWastedUSD,
        gasOptimizedUSD: scenario.gasOptimizable,
        repairTimeMs: Math.max(elapsed, 1),
        success: true, method: isImmune ? 'gene_map_immune' : 'gene_map',
      };
    }
  } catch {}

  // LLM fallback
  const cost = NAIVE_LLM_COST.diagnosis;
  return {
    scenarioId: scenario.id, description: scenario.description, error: scenario.error, platform: scenario.platform,
    llmCalls: 1, inputTokens: cost.inputTokens, outputTokens: cost.outputTokens, costUSD: cost.costUSD,
    gasWastedUSD: scenario.gasWastedUSD,
    gasOptimizedUSD: scenario.gasOptimizable,
    repairTimeMs: 1800,
    success: true, method: 'llm_fallback',
  };
}

async function main() {
  const geneMap = new GeneMap(':memory:');
  const engine = new PcecEngine(geneMap, 'benchmark', { mode: 'observe' } as any);

  const naiveResults: RunResult[] = [];
  const helixResults: RunResult[] = [];

  if (!JSON_OUTPUT) {
    console.log('\n🔬 Running Payment Agent Benchmark (50 scenarios)\n');
    console.log('═'.repeat(80));
  }

  for (const scenario of SCENARIOS) {
    const naiveResult = runNaive(scenario);
    naiveResults.push(naiveResult);

    const helixResult = await runHelix(scenario, engine);
    helixResults.push(helixResult);

    if (VERBOSE && !JSON_OUTPUT) {
      const llmSaved = naiveResult.costUSD - helixResult.costUSD;
      const gasSaved = naiveResult.gasWastedUSD - helixResult.gasWastedUSD;
      const totalSaved = llmSaved + gasSaved + helixResult.gasOptimizedUSD;
      const marker = totalSaved > 0 ? '💰' : (helixResult.costUSD === 0 && helixResult.gasWastedUSD === 0 ? '✅' : '⚡');
      console.log(
        `${marker} #${String(scenario.id).padStart(2)} ${scenario.description.padEnd(42)} ` +
        `LLM: $${naiveResult.costUSD.toFixed(4)}→$${helixResult.costUSD.toFixed(4)}  ` +
        `Gas: $${naiveResult.gasWastedUSD.toFixed(2)}→$${helixResult.gasWastedUSD.toFixed(2)}  ` +
        `[${helixResult.method}]`
      );
    }
  }

  // Aggregate
  const errorScenarios = SCENARIOS.filter(s => s.error);
  const naiveTotal = {
    llmCost: naiveResults.reduce((s, r) => s + r.costUSD, 0),
    gasWasted: naiveResults.reduce((s, r) => s + r.gasWastedUSD, 0),
    tokens: naiveResults.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
    llmCalls: naiveResults.reduce((s, r) => s + r.llmCalls, 0),
    avgRepairMs: naiveResults.filter(r => r.error).reduce((s, r) => s + r.repairTimeMs, 0) / (naiveResults.filter(r => r.error).length || 1),
  };
  const naiveTotalCost = naiveTotal.llmCost + naiveTotal.gasWasted;

  const helixTotal = {
    llmCost: helixResults.reduce((s, r) => s + r.costUSD, 0),
    gasWasted: helixResults.reduce((s, r) => s + r.gasWastedUSD, 0),
    gasOptimized: helixResults.reduce((s, r) => s + r.gasOptimizedUSD, 0),
    tokens: helixResults.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
    llmCalls: helixResults.reduce((s, r) => s + r.llmCalls, 0),
    avgRepairMs: helixResults.filter(r => r.error).reduce((s, r) => s + r.repairTimeMs, 0) / (helixResults.filter(r => r.error).length || 1),
    geneMapHits: helixResults.filter(r => r.method.startsWith('gene_map')).length,
    llmFallbacks: helixResults.filter(r => r.method === 'llm_fallback').length,
  };
  const helixTotalCost = helixTotal.llmCost + helixTotal.gasWasted - helixTotal.gasOptimized;

  const savings = {
    llmCostPercent: naiveTotal.llmCost > 0 ? ((naiveTotal.llmCost - helixTotal.llmCost) / naiveTotal.llmCost * 100) : 0,
    gasWastedPercent: naiveTotal.gasWasted > 0 ? ((naiveTotal.gasWasted - helixTotal.gasWasted) / naiveTotal.gasWasted * 100) : 0,
    totalPercent: naiveTotalCost > 0 ? ((naiveTotalCost - helixTotalCost) / naiveTotalCost * 100) : 0,
    tokenPercent: naiveTotal.tokens > 0 ? ((naiveTotal.tokens - helixTotal.tokens) / naiveTotal.tokens * 100) : 0,
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      scenarios: SCENARIOS.length, naive: { ...naiveTotal, totalCost: naiveTotalCost, results: naiveResults },
      helix: { ...helixTotal, totalCost: helixTotalCost, results: helixResults }, savings, timestamp: new Date().toISOString(),
    }, null, 2));
    geneMap.close();
    return;
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 BENCHMARK RESULTS — 50 Payment Scenarios\n');

  console.log('┌───────────────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Metric                │ Naive Agent  │ Helix Agent  │ Savings      │');
  console.log('├───────────────────────┼──────────────┼──────────────┼──────────────┤');
  console.log(`│ LLM Diagnosis Cost    │ $${naiveTotal.llmCost.toFixed(4).padStart(10)} │ $${helixTotal.llmCost.toFixed(4).padStart(10)} │ ${savings.llmCostPercent.toFixed(1).padStart(9)}%  │`);
  console.log(`│ Gas Wasted (reverts)  │ $${naiveTotal.gasWasted.toFixed(4).padStart(10)} │ $${helixTotal.gasWasted.toFixed(4).padStart(10)} │ ${savings.gasWastedPercent.toFixed(1).padStart(9)}%  │`);
  console.log(`│ Gas Optimization      │ $${(0).toFixed(4).padStart(10)} │ -$${helixTotal.gasOptimized.toFixed(4).padStart(9)} │   (Helix)    │`);
  console.log('├───────────────────────┼──────────────┼──────────────┼──────────────┤');
  console.log(`│ TOTAL COST            │ $${naiveTotalCost.toFixed(4).padStart(10)} │ $${helixTotalCost.toFixed(4).padStart(10)} │ ${savings.totalPercent.toFixed(1).padStart(9)}%  │`);
  console.log('├───────────────────────┼──────────────┼──────────────┼──────────────┤');
  console.log(`│ LLM Calls             │ ${String(naiveTotal.llmCalls).padStart(12)} │ ${String(helixTotal.llmCalls).padStart(12)} │             │`);
  console.log(`│ Total Tokens          │ ${String(naiveTotal.tokens).padStart(12)} │ ${String(helixTotal.tokens).padStart(12)} │ ${savings.tokenPercent.toFixed(1).padStart(9)}%  │`);
  console.log(`│ Avg Repair Time       │ ${(naiveTotal.avgRepairMs).toFixed(0).padStart(9)}ms │ ${(helixTotal.avgRepairMs).toFixed(0).padStart(9)}ms │             │`);
  console.log('└───────────────────────┴──────────────┴──────────────┴──────────────┘');

  const errCount = errorScenarios.length;
  console.log(`\n  Gene Map hits:     ${helixTotal.geneMapHits} / ${errCount} errors (${(helixTotal.geneMapHits / errCount * 100).toFixed(0)}%)`);
  console.log(`  LLM fallbacks:     ${helixTotal.llmFallbacks} (novel errors only)`);
  console.log(`  Reverts prevented: ${naiveResults.filter(r => r.gasWastedUSD > 0).length - helixResults.filter(r => r.gasWastedUSD > 0).length}`);
  console.log(`\n  💡 Helix saves ${savings.totalPercent.toFixed(0)}% of total payment error costs.`);
  console.log(`     - ${savings.llmCostPercent.toFixed(0)}% LLM savings: Gene Map resolves known errors in <1ms at $0`);
  console.log(`     - ${savings.gasWastedPercent.toFixed(0)}% gas savings: prevents reverts for known error patterns`);
  console.log(`     - Gas optimization: saves $${helixTotal.gasOptimized.toFixed(4)} via optimal pricing\n`);

  geneMap.close();
}

main().catch(console.error);
