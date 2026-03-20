#!/usr/bin/env node
/**
 * Privy-only demo.
 * Runs Privy scenarios 14-17, plus the overlapping Tempo+Generic scenarios
 * that share categories (balance, nonce, service, compliance, network, dex).
 * Shows Privy BD that Helix covers their entire downstream failure space.
 *
 * Run: npm run demo:privy
 */
import { PcecEngine } from '../core/pcec.js';
import { GeneMap } from '../core/gene-map.js';
import { bus } from '../core/bus.js';
import { defaultAdapters } from '../platforms/index.js';
import { tempoScenarios } from '../platforms/tempo/scenarios.js';
import { privyScenarios } from '../platforms/privy/scenarios.js';
import { genericScenarios } from '../platforms/generic/scenarios.js';
import type { SseEvent } from '../core/types.js';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m',
};

bus.subscribe((event: SseEvent) => {
  const ts = new Date(event.timestamp).toISOString().slice(11, 23);
  const d = event.data;
  switch (event.type) {
    case 'perceive':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.red}PERCEIVE${C.reset}  ${d.code} → ${d.category} [${d.platform}]`);
      break;
    case 'construct':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.blue}CONSTRUCT${C.reset} ${d.candidateCount} candidates`);
      break;
    case 'evaluate':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.magenta}EVALUATE${C.reset}  → ${d.winner} (score: ${d.score})`);
      break;
    case 'commit':
      if (d.success) console.log(`  ${C.dim}${ts}${C.reset} ${C.green}COMMIT ✓${C.reset}  ${d.strategy} (${d.totalMs}ms)`);
      break;
    case 'immune': {
      const cp = d.crossPlatform ? ` ${C.cyan}CROSS-PLATFORM${C.reset}` : '';
      console.log(`  ${C.dim}${ts}${C.reset} ${C.cyan}⚡ IMMUNE${C.reset}  ${d.strategy} (${d.successCount} fixes${cp})`);
      break;
    }
    case 'gene':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.magenta}GENE 📦${C.reset}   ${d.category}/${d.code}`);
      break;
  }
});

async function main() {
  console.log('');
  console.log(`${C.cyan}╔═══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}HELIX${C.reset} — Privy Wallet Demo                                     ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  4 unique Privy scenarios + cross-platform immunity            ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚═══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');

  const geneMap = new GeneMap(':memory:');
  const engine = new PcecEngine(geneMap, 'privy-demo');
  for (const adapter of defaultAdapters) {
    engine.registerAdapter(adapter);
  }

  // ── Phase 1: Run overlapping Tempo scenarios that share categories with Privy ──
  // This teaches the Gene Map so Privy benefits from cross-platform immunity.

  const overlappingTempo = [
    tempoScenarios[0],   // #1  balance     → Privy #16 will be immune
    tempoScenarios[3],   // #4  signature   → Privy #15 will be immune
    tempoScenarios[5],   // #6  service     → Generic #19 will be immune
    tempoScenarios[7],   // #8  compliance
    tempoScenarios[12],  // #13 network     → Privy #17 will be immune
    tempoScenarios[6],   // #7  dex
  ];

  console.log(`${C.yellow}━━━ ◆ Teaching Phase: Tempo Scenarios (shared categories) ━━━${C.reset}\n`);
  console.log(`${C.dim}  Running Tempo scenarios first so their Genes can protect Privy.${C.reset}\n`);

  for (const scenario of overlappingTempo) {
    console.log(`${C.bold}▸ ${scenario.id}.  ${scenario.name}${C.reset} ${C.yellow}[TEMPO]${C.reset} ${C.dim}(${scenario.tag})${C.reset}`);
    const err = new Error(scenario.errorMessage);
    (err as unknown as Record<string, unknown>).code = scenario.errorCode;
    const result = await engine.repair(err);
    console.log(`  → ${C.green}✓ REPAIRED${C.reset} in ${result.totalMs}ms — Gene stored\n`);
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Phase 2: Privy-unique scenarios ──

  console.log(`${C.blue}━━━ ◇ Privy Scenarios (4 unique) ━━━${C.reset}\n`);
  console.log(`${C.dim}  Scenarios 15-17 share categories with Tempo — should trigger IMMUNE.${C.reset}\n`);

  for (const scenario of privyScenarios) {
    console.log(`${C.bold}▸ ${scenario.id}. ${scenario.name}${C.reset} ${C.blue}[PRIVY]${C.reset} ${C.dim}(${scenario.tag})${C.reset}`);
    const err = new Error(scenario.errorMessage);
    (err as unknown as Record<string, unknown>).code = scenario.errorCode;
    const result = await engine.repair(err);
    if (result.immune) {
      const cp = (result.gene?.platforms?.length ?? 0) > 1 ? ` ${C.cyan}${C.bold}CROSS-PLATFORM!${C.reset}` : '';
      console.log(`  → ${C.cyan}⚡ IMMUNE${C.reset} in ${result.totalMs}ms ($${result.revenueProtected} protected)${cp}`);
      if (result.gene) {
        console.log(`  → Gene platforms: ${result.gene.platforms.join(', ')}`);
      }
    } else {
      console.log(`  → ${C.green}✓ REPAIRED${C.reset} in ${result.totalMs}ms ($${result.revenueProtected} protected)`);
    }
    console.log('');
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Summary ──

  const stats = engine.getStats();
  console.log(`${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}PRIVY DEMO COMPLETE${C.reset}                                         ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╠══════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Repairs: ${C.bold}${stats.repairs}${C.reset}  |  Revenue: ${C.bold}$${stats.savedRevenue.toLocaleString()}${C.reset}  |  Immune: ${C.bold}${stats.immuneHits}${C.reset}  |  Genes: ${C.bold}${stats.geneCount}${C.reset}  ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');

  console.log(`${C.bold}Gene Map (cross-platform entries):${C.reset}`);
  for (const gene of stats.genes) {
    const crossLabel = gene.platforms.length > 1 ? `  ${C.cyan}← CROSS-PLATFORM${C.reset}` : '';
    console.log(`  ${C.magenta}●${C.reset} ${gene.category}/${gene.failureCode} → ${gene.strategy} (${gene.platforms.join(', ')}) ${gene.successCount} fix${gene.successCount !== 1 ? 'es' : ''}${crossLabel}`);
  }
  console.log('');

  geneMap.close();
}

main().catch(console.error);
