#!/usr/bin/env node
/**
 * Tempo-only demo (for hackathon).
 * Runs only scenarios 1-13 + immunity for 1-3 and 13.
 *
 * Run: npm run demo:tempo
 */
import { PcecEngine } from '../core/pcec.js';
import { GeneMap } from '../core/gene-map.js';
import { bus } from '../core/bus.js';
import { tempoAdapter, genericAdapter } from '../platforms/index.js';
import { tempoScenarios } from '../platforms/tempo/scenarios.js';
import type { SseEvent } from '../core/types.js';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', bgRed: '\x1b[41m',
};

bus.subscribe((event: SseEvent) => {
  const ts = new Date(event.timestamp).toISOString().slice(11, 23);
  const d = event.data;
  switch (event.type) {
    case 'perceive':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.red}PERCEIVE${C.reset}  ${d.code} → ${d.category} [${d.severity}]`);
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
    case 'immune':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.cyan}⚡ IMMUNE${C.reset}  ${d.strategy} (${d.successCount} fixes)`);
      break;
    case 'gene':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.magenta}GENE 📦${C.reset}   ${d.category}/${d.code}`);
      break;
  }
});

async function main() {
  console.log('');
  console.log(`${C.cyan}╔═══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}HELIX${C.reset} — Tempo / MPP Demo (13 Scenarios)                      ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚═══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');

  const geneMap = new GeneMap(':memory:');
  const engine = new PcecEngine(geneMap, 'tempo-demo');
  engine.registerAdapter(tempoAdapter);
  engine.registerAdapter(genericAdapter);

  // ── First pass: all 13 scenarios ──

  console.log(`${C.yellow}━━━ ◆ First Encounters (13 scenarios) ━━━${C.reset}\n`);

  for (const scenario of tempoScenarios) {
    const label = scenario.tag === 'real'
      ? `${C.bgRed}${C.white} REAL ${C.reset}`
      : `${C.dim}(${scenario.tag})${C.reset}`;
    console.log(`${C.bold}▸ ${scenario.id}.  ${scenario.name}${C.reset} ${label}`);
    const err = new Error(scenario.errorMessage);
    (err as unknown as Record<string, unknown>).code = scenario.errorCode;
    const result = await engine.repair(err);
    console.log(`  → ${result.success ? C.green + '✓ REPAIRED' : C.red + '✗ FAILED'}${C.reset} in ${result.totalMs}ms ($${result.revenueProtected} protected)\n`);
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Immunity round: re-run 1-3 and 13 ──

  console.log(`${C.cyan}━━━ ⚡ Immunity Test ━━━${C.reset}\n`);

  const immunityTests = [tempoScenarios[0], tempoScenarios[1], tempoScenarios[2], tempoScenarios[12]];
  for (const scenario of immunityTests) {
    const label = scenario.tag === 'real' ? `${C.bgRed}${C.white} REAL ${C.reset}` : '';
    console.log(`${C.bold}▸ ${scenario.id}.  ${scenario.name}${C.reset} ${C.cyan}[IMMUNITY]${C.reset} ${label}`);
    const err = new Error(scenario.errorMessage);
    (err as unknown as Record<string, unknown>).code = scenario.errorCode;
    const result = await engine.repair(err);
    console.log(`  → ${result.immune ? C.cyan + C.bold + 'IMMUNE ⚡' + C.reset : C.green + '✓ REPAIRED' + C.reset} in ${result.totalMs}ms\n`);
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Summary ──

  const stats = engine.getStats();
  console.log(`${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}TEMPO DEMO COMPLETE${C.reset}                                         ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╠══════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Repairs: ${C.bold}${stats.repairs}${C.reset}  |  Revenue: ${C.bold}$${stats.savedRevenue.toLocaleString()}${C.reset}  |  Immune: ${C.bold}${stats.immuneHits}${C.reset}  |  Genes: ${C.bold}${stats.geneCount}${C.reset}  ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');

  geneMap.close();
}

main().catch(console.error);
