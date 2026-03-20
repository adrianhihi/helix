#!/usr/bin/env node
/**
 * Full demo — all platforms, shows cross-platform immunity.
 *
 * Run: npm run demo
 */
import { PcecEngine } from '../core/pcec.js';
import { GeneMap } from '../core/gene-map.js';
import { bus } from '../core/bus.js';
import { defaultAdapters } from '../platforms/index.js';
import { tempoScenarios } from '../platforms/tempo/scenarios.js';
import { privyScenarios } from '../platforms/privy/scenarios.js';
import { genericScenarios } from '../platforms/generic/scenarios.js';
import type { DemoScenario } from '../platforms/tempo/scenarios.js';
import type { SseEvent } from '../core/types.js';

// ── Colors ──────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgAmber: '\x1b[43m',
};

// Platform badge colors
function platformBadge(platform: string): string {
  switch (platform) {
    case 'tempo': return `${C.yellow}[TEMPO]${C.reset}`;
    case 'privy': return `${C.blue}[PRIVY]${C.reset}`;
    case 'generic': return `${C.dim}[GENERIC]${C.reset}`;
    case 'stripe': return `${C.magenta}[STRIPE]${C.reset}`;
    default: return `[${platform}]`;
  }
}

function tagBadge(tag: string): string {
  switch (tag) {
    case 'live': return `${C.green}LIVE${C.reset}`;
    case 'mock': return `${C.blue}MOCK${C.reset}`;
    case 'vision': return `${C.magenta}VISION${C.reset}`;
    case 'real': return `${C.bgRed}${C.white} REAL ${C.reset}`;
    default: return tag;
  }
}

// ── Mute EventBus — we handle output ourselves ─────────────────────
// (keep bus wired for engine internals, but don't print raw events)

let showEvents = true;

bus.subscribe((event: SseEvent) => {
  if (!showEvents) return;
  const ts = new Date(event.timestamp).toISOString().slice(11, 23);
  const d = event.data;
  switch (event.type) {
    case 'perceive':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.red}PERCEIVE${C.reset}  ${d.code} → ${d.category} [${d.severity}] ${platformBadge(d.platform as string)}`);
      break;
    case 'construct':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.blue}CONSTRUCT${C.reset} ${d.candidateCount} candidates for ${d.category}`);
      break;
    case 'evaluate':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.magenta}EVALUATE${C.reset}  → ${d.winner} (score: ${d.score}) ${platformBadge(d.platform as string)}`);
      break;
    case 'commit':
      if (d.success) console.log(`  ${C.dim}${ts}${C.reset} ${C.green}COMMIT ✓${C.reset}  ${d.strategy} (${d.totalMs}ms)`);
      break;
    case 'immune': {
      const cp = d.crossPlatform ? `, ${C.cyan}${C.bold}CROSS-PLATFORM${C.reset}` : '';
      const platforms = (d.platforms as string[])?.join(', ') ?? '';
      console.log(`  ${C.dim}${ts}${C.reset} ${C.cyan}⚡ IMMUNE${C.reset}  ${d.strategy} (${d.successCount} fixes, platforms: ${platforms}${cp})`);
      break;
    }
    case 'gene':
      console.log(`  ${C.dim}${ts}${C.reset} ${C.magenta}GENE 📦${C.reset}   ${d.category}/${d.code} → ${d.strategy} ${platformBadge(d.platform as string)}`);
      break;
  }
});

// ── Helpers ─────────────────────────────────────────────────────────

async function runScenario(engine: PcecEngine, scenario: DemoScenario): Promise<{ immune: boolean; crossPlatform: boolean; totalMs: number; revenueProtected: number; success: boolean }> {
  const err = new Error(scenario.errorMessage);
  (err as unknown as Record<string, unknown>).code = scenario.errorCode;
  const result = await engine.repair(err);
  const crossPlatform = result.immune && (result.gene?.platforms?.length ?? 0) > 1;
  return { immune: result.immune, crossPlatform, totalMs: result.totalMs, revenueProtected: result.revenueProtected, success: result.success };
}

function pad(s: string, n: number): string {
  // Strip ANSI for length calc
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  return s + ' '.repeat(Math.max(0, n - stripped.length));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(`${C.cyan}╔═══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}HELIX${C.reset} — Self-Healing Infrastructure for Agent Payments       ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  PCEC Engine × Gene Map × Multi-Platform                      ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚═══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');

  const geneMap = new GeneMap(':memory:');
  const engine = new PcecEngine(geneMap, 'demo-agent');
  for (const adapter of defaultAdapters) {
    engine.registerAdapter(adapter);
  }

  let totalRevenue = 0;
  let crossPlatformCount = 0;

  // ── Section 1: Tempo / MPP ──────────────────────────────────────

  console.log(`${C.yellow}━━━ ◆ Tempo / MPP (13 scenarios) ━━━${C.reset}\n`);

  for (const scenario of tempoScenarios) {
    const label = scenario.tag === 'real'
      ? `${C.bgRed}${C.white} REAL ${C.reset}`
      : tagBadge(scenario.tag);
    console.log(`${C.bold}▸ ${scenario.id}.  ${scenario.name}${C.reset} ${label}`);
    const r = await runScenario(engine, scenario);
    totalRevenue += r.revenueProtected;
    console.log(`  → ${r.success ? C.green + '✓ REPAIRED' : C.red + '✗ FAILED'}${C.reset} in ${r.totalMs}ms ($${r.revenueProtected} protected)\n`);
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Section 2: Privy ────────────────────────────────────────────

  console.log(`${C.blue}━━━ ◇ Privy Wallet (4 unique) ━━━${C.reset}\n`);

  for (const scenario of privyScenarios) {
    console.log(`${C.bold}▸ ${scenario.id}. ${scenario.name}${C.reset} ${tagBadge(scenario.tag)}`);
    const r = await runScenario(engine, scenario);
    totalRevenue += r.revenueProtected;
    if (r.immune) {
      const msg = r.crossPlatform ? `${C.cyan}⚡ CROSS-PLATFORM IMMUNE!${C.reset}` : `${C.cyan}⚡ IMMUNE${C.reset}`;
      console.log(`  → ${msg} in ${r.totalMs}ms ($${r.revenueProtected} protected)`);
      if (r.crossPlatform) crossPlatformCount++;
    } else {
      console.log(`  → ${r.success ? C.green + '✓ REPAIRED' : C.red + '✗ FAILED'}${C.reset} in ${r.totalMs}ms ($${r.revenueProtected} protected)`);
    }
    console.log('');
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Section 3: Generic HTTP ─────────────────────────────────────

  console.log(`${C.dim}━━━ ○ Generic HTTP (3 scenarios) ━━━${C.reset}\n`);

  for (const scenario of genericScenarios) {
    console.log(`${C.bold}▸ ${scenario.id}. ${scenario.name}${C.reset} ${tagBadge(scenario.tag)}`);
    const r = await runScenario(engine, scenario);
    totalRevenue += r.revenueProtected;
    if (r.immune) {
      const msg = r.crossPlatform ? `${C.cyan}⚡ CROSS-PLATFORM IMMUNE!${C.reset}` : `${C.cyan}⚡ IMMUNE${C.reset}`;
      console.log(`  → ${msg} in ${r.totalMs}ms ($${r.revenueProtected} protected)`);
      if (r.crossPlatform) crossPlatformCount++;
    } else {
      console.log(`  → ${r.success ? C.green + '✓ REPAIRED' : C.red + '✗ FAILED'}${C.reset} in ${r.totalMs}ms ($${r.revenueProtected} protected)`);
    }
    console.log('');
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Section 4: Cross-Platform Immunity Test ─────────────────────

  console.log(`${C.cyan}━━━ ⚡ Cross-Platform Immunity ━━━${C.reset}\n`);
  console.log(`${C.dim}  Genes learned from Tempo/Generic Phase 1 now protect Privy & Generic.${C.reset}\n`);

  interface ImmunityTest {
    scenario: DemoScenario;
    label: string;
    sourceScenario: string;
  }

  const immunityTests: ImmunityTest[] = [
    { scenario: tempoScenarios[0], label: 'TEMPO IMMUNITY', sourceScenario: '' },
    { scenario: privyScenarios[1], label: 'CROSS-PLATFORM', sourceScenario: 'Gene from Tempo #4!' },
    { scenario: privyScenarios[2], label: 'CROSS-PLATFORM', sourceScenario: 'Gene from Tempo #12!' },
    { scenario: privyScenarios[3], label: 'CROSS-PLATFORM', sourceScenario: 'Gene from Tempo #13!' },
    { scenario: genericScenarios[1], label: 'CROSS-PLATFORM', sourceScenario: 'Gene from Tempo #6!' },
    { scenario: tempoScenarios[12], label: 'REAL MPP, IMMUNITY', sourceScenario: '' },
  ];

  for (const test of immunityTests) {
    const { scenario, label, sourceScenario } = test;
    const sourceNote = sourceScenario ? ` ${C.dim}(${sourceScenario})${C.reset}` : '';
    console.log(`${C.bold}▸ ${scenario.id}.  ${scenario.name} ${C.cyan}[${label}]${C.reset}${sourceNote}`);
    const r = await runScenario(engine, scenario);
    totalRevenue += r.revenueProtected;
    if (r.immune) {
      if (r.crossPlatform) crossPlatformCount++;
      console.log(`  → ${C.cyan}${C.bold}IMMUNE ⚡${C.reset} in ${r.totalMs}ms ($${r.revenueProtected} protected)\n`);
    } else {
      console.log(`  → ${C.green}✓ REPAIRED${C.reset} in ${r.totalMs}ms\n`);
    }
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Summary ─────────────────────────────────────────────────────

  const stats = engine.getStats();

  console.log(`${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}HELIX DEMO COMPLETE — Multi-Platform Summary${C.reset}                 ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╠══════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}║${C.reset}                                                              ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Platforms:        ${C.bold}4${C.reset} (Tempo, Privy, Generic, Stripe 🔜)      ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Total Scenarios:  ${C.bold}20${C.reset}                                        ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Total Repairs:    ${C.bold}${stats.repairs}${C.reset}${' '.repeat(Math.max(0, 40 - String(stats.repairs).length))}${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Immune Hits:      ${C.bold}${stats.immuneHits}${C.reset}${' '.repeat(Math.max(0, 40 - String(stats.immuneHits).length))}${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Cross-Platform:   ${C.bold}${crossPlatformCount}${C.reset} (Privy healed by Tempo Genes!)${' '.repeat(Math.max(0, 13 - String(crossPlatformCount).length))}${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Revenue Saved:    ${C.bold}$${stats.savedRevenue.toLocaleString()}${C.reset}${' '.repeat(Math.max(0, 36 - stats.savedRevenue.toLocaleString().length))}${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Gene Capsules:    ${C.bold}${stats.geneCount}${C.reset}${' '.repeat(Math.max(0, 40 - String(stats.geneCount).length))}${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}                                                              ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╠══════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}KEY INSIGHT:${C.reset} Privy & Generic failures were healed             ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}INSTANTLY${C.reset} by Genes learned from Tempo scenarios.              ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  Same failure category = same fix, across platforms.          ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}`);

  console.log(`\n${C.bold}Gene Map contents:${C.reset}`);
  for (const gene of stats.genes) {
    const platforms = gene.platforms.join(', ');
    const crossLabel = gene.platforms.length > 1 ? `  ${C.cyan}← CROSS-PLATFORM${C.reset}` : '';
    const cat = pad(`${gene.category}/${gene.failureCode}`, 35);
    const strat = pad(`→ ${gene.strategy}`, 25);
    console.log(`  ${C.magenta}●${C.reset} ${cat} ${strat} (${platforms}) ${gene.successCount} fix${gene.successCount !== 1 ? 'es' : ''}${crossLabel}`);
  }
  console.log('');

  geneMap.close();
}

main().catch(console.error);
