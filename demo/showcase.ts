#!/usr/bin/env node
/**
 * Helix Showcase Demo
 *
 * A live terminal walkthrough of the Helix experiments.
 * Designed for in-person demos, conference talks, and pitch meetings.
 *
 * Usage:
 *   npx tsx demo/showcase.ts          (interactive — press ENTER to advance)
 *   npx tsx demo/showcase.ts --auto   (auto-advance every 3s)
 *   npx tsx demo/showcase.ts --fast   (no delays, for testing)
 */

import * as readline from 'readline';

// ── ANSI ────────────────────────────────────────────────────────────────
const ESC = '\x1b[';
const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  inverse: `${ESC}7m`,
  // 256-color
  fg: (n: number) => `${ESC}38;5;${n}m`,
  bg: (n: number) => `${ESC}48;5;${n}m`,
  // True color
  rgb: (r: number, g: number, b: number) => `${ESC}38;2;${r};${g};${b}m`,
  // Common
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,
  brightRed: `${ESC}91m`,
  brightGreen: `${ESC}92m`,
  brightYellow: `${ESC}93m`,
  brightBlue: `${ESC}94m`,
  brightMagenta: `${ESC}95m`,
  brightCyan: `${ESC}96m`,
};

// Helix brand colors
const HELIX = c.rgb(0, 217, 165);   // teal/mint
const HELIX_DIM = c.rgb(0, 140, 110);
const ACCENT = c.rgb(255, 184, 0);  // amber
const DANGER = c.rgb(255, 80, 80);
const SUCCESS = c.rgb(80, 220, 120);
const MUTED = c.rgb(140, 140, 150);

const CLEAR = '\x1b[2J\x1b[H';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

// ── Mode flags ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const AUTO = args.includes('--auto');
const INTERACTIVE = !FAST && !AUTO;

// ── Helpers ─────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));

async function typeWrite(text: string, speed = 18) {
  if (FAST) {
    process.stdout.write(text);
    return;
  }
  for (const char of text) {
    process.stdout.write(char);
    await sleep(speed);
  }
}

let rl: readline.Interface | null = null;
function getReadline(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

async function pause(prompt = '  press ENTER to continue ') {
  if (FAST) return;
  if (AUTO) {
    await sleep(3000);
    return;
  }
  return new Promise<void>((resolve) => {
    process.stdout.write(`\n${MUTED}${c.italic}${prompt}${c.reset}`);
    getReadline().question('', () => {
      process.stdout.write('\x1b[1A\x1b[2K'); // erase prompt line
      resolve();
    });
  });
}

function repeat(s: string, n: number): string {
  return new Array(Math.max(0, n) + 1).join(s);
}

function box(lines: string[], color = HELIX, padding = 2): string {
  // Strip ANSI for length calculation
  const visibleLength = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
  const maxLen = Math.max(...lines.map(visibleLength));
  const innerWidth = maxLen + padding * 2;
  const top = `${color}╭${repeat('─', innerWidth)}╮${c.reset}`;
  const bot = `${color}╰${repeat('─', innerWidth)}╯${c.reset}`;
  const middle = lines.map((line) => {
    const pad = ' '.repeat(maxLen - visibleLength(line));
    return `${color}│${c.reset}${' '.repeat(padding)}${line}${pad}${' '.repeat(padding)}${color}│${c.reset}`;
  });
  return [top, ...middle, bot].join('\n');
}

async function progressBar(label: string, width = 30, durationMs = 800, color = HELIX) {
  if (FAST) {
    process.stdout.write(`  ${label} ${color}${repeat('█', width)}${c.reset} 100%\n`);
    return;
  }
  const steps = width;
  const stepMs = durationMs / steps;
  for (let i = 0; i <= steps; i++) {
    const filled = repeat('█', i);
    const empty = repeat('░', width - i);
    const pct = Math.round((i / steps) * 100);
    process.stdout.write(`\r  ${label} ${color}${filled}${MUTED}${empty}${c.reset} ${pct}%`);
    await sleep(stepMs);
  }
  process.stdout.write('\n');
}

// ── Title screen ────────────────────────────────────────────────────────
const HELIX_LOGO = `
${HELIX}██╗  ██╗███████╗██╗     ██╗██╗  ██╗${c.reset}
${HELIX}██║  ██║██╔════╝██║     ██║╚██╗██╔╝${c.reset}
${HELIX}███████║█████╗  ██║     ██║ ╚███╔╝ ${c.reset}
${HELIX}██╔══██║██╔══╝  ██║     ██║ ██╔██╗ ${c.reset}
${HELIX}██║  ██║███████╗███████╗██║██╔╝ ██╗${c.reset}
${HELIX}╚═╝  ╚═╝╚══════╝╚══════╝╚═╝╚═╝  ╚═╝${c.reset}
`;

async function titleScreen() {
  process.stdout.write(CLEAR + HIDE_CURSOR);
  await sleep(200);
  process.stdout.write(HELIX_LOGO);
  await sleep(400);
  console.log(`        ${MUTED}Self-healing intelligence for AI agent payments${c.reset}`);
  await sleep(200);
  console.log(`            ${HELIX_DIM}v2.7.0 · github.com/adrianhihi/helix${c.reset}\n`);
  await sleep(500);
  console.log(box([
    `${c.bold}Live demo:${c.reset} ${ACCENT}LLM Classification vs PCEC${c.reset}`,
    `${MUTED}5 experiments · 100+ on-chain transactions${c.reset}`,
    `${MUTED}Base mainnet · verifiable on BaseScan${c.reset}`,
  ], HELIX, 4));
  await pause();
}

// ── Section 1: The problem ──────────────────────────────────────────────
async function section1Problem() {
  process.stdout.write(CLEAR);
  console.log(`\n${HELIX}${c.bold}  ▸ THE PROBLEM${c.reset}\n`);
  await sleep(300);

  await typeWrite(`  AI agents are starting to make payments.\n`, 22);
  await sleep(200);
  await typeWrite(`  ${MUTED}Coinbase x402, CDP, Privy, Tempo — all shipping in 2026.${c.reset}\n\n`, 14);
  await sleep(300);

  await typeWrite(`  ${ACCENT}But every payment is a transaction that can fail.${c.reset}\n\n`, 22);
  await sleep(400);

  console.log(`  ${c.bold}When an LLM agent sees a failed transaction, what does it do?${c.reset}\n`);
  await sleep(300);

  const errors = [
    { msg: '"execution reverted"', truth: 'slippage_too_tight' },
    { msg: '"execution reverted: STF"', truth: 'missing_allowance' },
    { msg: '"replacement transaction underpriced"', truth: 'nonce_conflict' },
    { msg: '"UniswapV3: LOK"', truth: 'reentrancy_lock' },
  ];

  for (const e of errors) {
    process.stdout.write(`  ${DANGER}✗${c.reset}  ${MUTED}${e.msg.padEnd(46)}${c.reset}  ${c.dim}→${c.reset}  ${HELIX}${e.truth}${c.reset}\n`);
    await sleep(180);
  }

  console.log(`\n  ${c.italic}${MUTED}Most LLMs cannot map these messages to the correct fix.${c.reset}`);
  await pause();
}

// ── Section 2: Experiment 7 ─────────────────────────────────────────────
async function section2Benchmark() {
  process.stdout.write(CLEAR);
  console.log(`\n${HELIX}${c.bold}  ▸ EXPERIMENT 7${c.reset}  ${MUTED}— Frontier LLM Classification Benchmark${c.reset}\n`);
  await sleep(300);

  await typeWrite(`  We tested 5 frontier LLMs on 10 real EVM revert messages.\n`, 18);
  await typeWrite(`  ${MUTED}All errors collected from real Base mainnet failures.${c.reset}\n\n`, 14);
  await sleep(400);

  const models = [
    { name: 'GPT-4o-mini',     score: 5,  acc: 50,  bar: HELIX },
    { name: 'GPT-4o',          score: 8,  acc: 80,  bar: HELIX },
    { name: 'Claude Opus 4.6', score: 9,  acc: 90,  bar: HELIX },
    { name: 'GPT-5.4',         score: 9,  acc: 90,  bar: HELIX },
    { name: 'PCEC (Helix)',    score: 10, acc: 100, bar: SUCCESS },
  ];

  const maxName = Math.max(...models.map((m) => m.name.length));
  for (const m of models) {
    const barWidth = Math.round((m.acc / 100) * 30);
    const empty = 30 - barWidth;
    const isHelix = m.name.includes('Helix');
    const nameColor = isHelix ? `${HELIX}${c.bold}` : c.white;
    process.stdout.write(`  ${nameColor}${m.name.padEnd(maxName)}${c.reset}  `);
    process.stdout.write(`${m.bar}`);
    for (let i = 0; i < barWidth; i++) {
      process.stdout.write('█');
      await sleep(FAST ? 0 : 12);
    }
    process.stdout.write(`${MUTED}${repeat('░', empty)}${c.reset}`);
    process.stdout.write(`  ${nameColor}${m.acc}%${c.reset}  ${MUTED}(${m.score}/10)${c.reset}\n`);
    await sleep(80);
  }

  await sleep(300);
  console.log();
  console.log(box([
    `${c.bold}The accuracy gap is 10–50 percentage points.${c.reset}`,
    `${MUTED}Even GPT-5.4 (OpenAI's flagship) misses bare "execution reverted".${c.reset}`,
  ], ACCENT, 3));
  await pause();
}

// ── Section 3: Experiment B (CoT) ───────────────────────────────────────
async function section3CoT() {
  process.stdout.write(CLEAR);
  console.log(`\n${HELIX}${c.bold}  ▸ EXPERIMENT B${c.reset}  ${MUTED}— "But Chain-of-Thought fixes it!"${c.reset}\n`);
  await sleep(300);

  await typeWrite(`  ${MUTED}A common objection: "Just give the LLM more context."${c.reset}\n\n`, 16);
  await sleep(300);

  console.log(`  ${c.bold}We tested it.${c.reset} Two prompts on Claude Opus 4.6:\n`);
  await sleep(200);

  console.log(`  ${MUTED}┌─ Bare Prompt ─────────────────────────┐${c.reset}`);
  console.log(`  ${MUTED}│ "Classify this error: {msg}"          │${c.reset}`);
  console.log(`  ${MUTED}└───────────────────────────────────────┘${c.reset}`);
  await sleep(300);

  console.log(`  ${MUTED}┌─ CoT Prompt (hand-crafted) ───────────┐${c.reset}`);
  console.log(`  ${MUTED}│ "Common DeFi errors:                  │${c.reset}`);
  console.log(`  ${MUTED}│   - 'Transaction too old' → deadline   │${c.reset}`);
  console.log(`  ${MUTED}│   - 'STF' → SafeTransferFrom failed    │${c.reset}`);
  console.log(`  ${MUTED}│   - 'LOK' → reentrancy lock            │${c.reset}`);
  console.log(`  ${MUTED}│   ... (50 lines of expert knowledge)  │${c.reset}`);
  console.log(`  ${MUTED}│  Think step by step. Classify: {msg}" │${c.reset}`);
  console.log(`  ${MUTED}└───────────────────────────────────────┘${c.reset}\n`);
  await sleep(400);

  await progressBar(`Bare:  `, 30, 600, HELIX);
  console.log(`         ${HELIX}9/10 correct  →  90%${c.reset}\n`);
  await sleep(200);

  await progressBar(`CoT:   `, 30, 700, SUCCESS);
  console.log(`         ${SUCCESS}10/10 correct →  100%${c.reset}\n`);
  await sleep(400);

  console.log(`  ${ACCENT}${c.bold}So CoT works! Why do we need PCEC?${c.reset}\n`);
  await sleep(500);

  console.log(`  ${MUTED}Because CoT requires:${c.reset}`);
  await sleep(200);
  console.log(`    ${DANGER}•${c.reset} Hand-curated DeFi expertise in every prompt`);
  await sleep(150);
  console.log(`    ${DANGER}•${c.reset} A 500+ token system prompt on every request`);
  await sleep(150);
  console.log(`    ${DANGER}•${c.reset} Knowing the answer ${c.italic}before${c.reset} you ask the question`);
  await sleep(150);
  console.log(`    ${DANGER}•${c.reset} Updates every time a new error pattern emerges\n`);
  await sleep(300);

  console.log(`  ${HELIX}${c.bold}PCEC has this knowledge built into the engine.${c.reset}`);
  console.log(`  ${MUTED}No prompt engineering. No expert tax. 61 patterns. 5 platforms.${c.reset}`);
  await pause();
}

// ── Section 4: Experiment C (compounding) ───────────────────────────────
async function section4Compounding() {
  process.stdout.write(CLEAR);
  console.log(`\n${HELIX}${c.bold}  ▸ EXPERIMENT C${c.reset}  ${MUTED}— The Compounding Failure Problem${c.reset}\n`);
  await sleep(300);

  await typeWrite(`  Real agent pipelines have multiple steps:\n`, 18);
  await sleep(200);
  console.log(`    ${MUTED}swap → bridge → stake → claim → ...${c.reset}\n`);
  await sleep(300);

  await typeWrite(`  ${ACCENT}Each step compounds the failure rate.${c.reset}\n\n`, 20);
  await sleep(400);

  const rows = [
    { model: 'GPT-4o-mini',     single: 0.50, color: DANGER },
    { model: 'GPT-4o',          single: 0.80, color: ACCENT },
    { model: 'Claude Opus 4.6', single: 0.90, color: HELIX },
    { model: 'PCEC (Helix)',    single: 1.00, color: SUCCESS },
  ];

  console.log(`  ${c.bold}Pipeline success rate by step count:${c.reset}\n`);
  console.log(`  ${MUTED}${'Model'.padEnd(18)}  1 step    3 steps   5 steps   10 steps${c.reset}`);
  console.log(`  ${MUTED}${repeat('─', 60)}${c.reset}`);

  for (const r of rows) {
    const p1 = (r.single * 100).toFixed(0).padStart(4) + '%';
    const p3 = ((r.single ** 3) * 100).toFixed(1).padStart(5) + '%';
    const p5 = ((r.single ** 5) * 100).toFixed(1).padStart(5) + '%';
    const p10 = ((r.single ** 10) * 100).toFixed(1).padStart(5) + '%';
    const isHelix = r.model.includes('Helix');
    const nameColor = isHelix ? `${HELIX}${c.bold}` : c.white;
    console.log(`  ${nameColor}${r.model.padEnd(18)}${c.reset}  ${r.color}${p1}${c.reset}    ${r.color}${p3}${c.reset}    ${r.color}${p5}${c.reset}    ${r.color}${p10}${c.reset}`);
    await sleep(200);
  }

  await sleep(400);
  console.log();
  console.log(box([
    `${c.bold}Even Claude Opus 4.6 at 90% drops to 35% over 10 steps.${c.reset}`,
    `${MUTED}GPT-4o-mini at 50% becomes unusable: 0.1% over 10 steps.${c.reset}`,
    `${SUCCESS}${c.bold}PCEC stays at 100% — deterministic pattern matching.${c.reset}`,
  ], ACCENT, 3));
  await pause();
}

// ── Section 5: Experiment 8 — On-chain ──────────────────────────────────
async function section5OnChain() {
  process.stdout.write(CLEAR);
  console.log(`\n${HELIX}${c.bold}  ▸ EXPERIMENT 8${c.reset}  ${MUTED}— On-Chain Proof on Base Mainnet${c.reset}\n`);
  await sleep(300);

  await typeWrite(`  All previous experiments were ${c.italic}lab benchmarks${c.reset}.\n`, 18);
  await typeWrite(`  ${ACCENT}Experiment 8 puts real money on-chain.${c.reset}\n\n`, 20);
  await sleep(400);

  console.log(`  ${c.bold}Scenario:${c.reset} Uniswap V3 swap on Base, slippage too tight\n`);
  console.log(`  ${MUTED}Error returned by EVM: ${c.reset}${ACCENT}"execution reverted"${c.reset}  ${MUTED}(no detail)${c.reset}\n`);
  await sleep(400);

  console.log(`  ${c.bold}Step 1:${c.reset} Ask GPT-5.4 to classify and fix.\n`);
  await sleep(300);

  const gptResponse = `{
    "classification": "other",
    "confidence": 0.18,
    "fix": "Inspect transaction receipt or simulate
            the call to get the actual revert reason..."
  }`;

  for (const line of gptResponse.split('\n')) {
    console.log(`  ${MUTED}${line}${c.reset}`);
    await sleep(120);
  }
  console.log();
  await sleep(300);

  console.log(`  ${DANGER}${c.bold}GPT-5.4 gives up.${c.reset} ${MUTED}Confidence 0.18. No actionable fix.${c.reset}\n`);
  await sleep(400);

  console.log(`  ${c.bold}Step 2:${c.reset} Apply each fix on Base mainnet, 3 rounds each.\n`);
  await sleep(300);

  // Animated tx submissions
  const rounds = [
    {
      gpt: { tx: '0xe5d40c2532b6eb275b758f685581ef3b210189ee', status: 'REVERTED', color: DANGER },
      pcec: { tx: '0xddc1a700ffc21ae0892291305f4668a9fbc5810e', status: 'SUCCESS', color: SUCCESS },
    },
    {
      gpt: { tx: '0x486fbc04b066dc4f4f03bbdece728437262aa9b9', status: 'REVERTED', color: DANGER },
      pcec: { tx: '0xa9a54b34f356357b8d2fd2baa8168b5b683f6efb', status: 'SUCCESS', color: SUCCESS },
    },
    {
      gpt: { tx: '0x74ad1b2eca95c375630b0c09189dcba41cb748f3', status: 'REVERTED', color: DANGER },
      pcec: { tx: '0x9d6470dc487bef09d17fbe58d6803e571ef0f81a', status: 'SUCCESS', color: SUCCESS },
    },
  ];

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    console.log(`  ${MUTED}─── Round ${i + 1}/3 ──────────────────────────────────────${c.reset}`);
    process.stdout.write(`    ${MUTED}GPT-5.4  ${c.reset}`);
    await sleep(300);
    process.stdout.write(`${MUTED}${r.gpt.tx}${c.reset}  `);
    await sleep(500);
    process.stdout.write(`${r.gpt.color}✗ ${r.gpt.status}${c.reset}\n`);
    await sleep(200);
    process.stdout.write(`    ${HELIX}PCEC     ${c.reset}`);
    await sleep(300);
    process.stdout.write(`${MUTED}${r.pcec.tx}${c.reset}  `);
    await sleep(500);
    process.stdout.write(`${r.pcec.color}✓ ${r.pcec.status}${c.reset}\n`);
    await sleep(200);
  }

  console.log();
  await sleep(300);

  console.log(box([
    `${c.bold}Final score:${c.reset}`,
    `  ${DANGER}GPT-5.4 (OpenAI flagship): 0/3 ✗${c.reset}`,
    `  ${SUCCESS}PCEC (Helix engine):       3/3 ✓${c.reset}`,
    ``,
    `${MUTED}All 6 transactions verifiable on BaseScan.${c.reset}`,
  ], HELIX, 3));
  await pause();
}

// ── Section 6: How PCEC works ───────────────────────────────────────────
async function section6HowItWorks() {
  process.stdout.write(CLEAR);
  console.log(`\n${HELIX}${c.bold}  ▸ HOW PCEC WORKS${c.reset}  ${MUTED}— Self-Healing in 6 Stages${c.reset}\n`);
  await sleep(300);

  await typeWrite(`  ${MUTED}PCEC = Perceive · Construct · Evaluate · Commit · Verify · Gene${c.reset}\n\n`, 12);
  await sleep(300);

  const stages = [
    { num: 1, name: 'PERCEIVE',   desc: 'Match error signature against 61 known patterns', icon: '👁' },
    { num: 2, name: 'CONSTRUCT',  desc: 'Build candidate fix from gene map (Q-values)',    icon: '🔨' },
    { num: 3, name: 'EVALUATE',   desc: 'Score by historical success × confidence',         icon: '⚖' },
    { num: 4, name: 'COMMIT',     desc: 'Apply the best fix to the failed transaction',    icon: '✦' },
    { num: 5, name: 'VERIFY',     desc: 'Re-run, confirm on-chain success',                 icon: '✓' },
    { num: 6, name: 'GENE',       desc: 'Update Q-value, learn for next time',              icon: '🧬' },
  ];

  for (const s of stages) {
    process.stdout.write(`  ${HELIX}${c.bold}${s.num}${c.reset}  `);
    process.stdout.write(`${HELIX}${c.bold}${s.name.padEnd(11)}${c.reset}`);
    await sleep(150);
    await typeWrite(`${MUTED}${s.desc}${c.reset}\n`, 8);
    await sleep(100);
  }

  console.log();
  await sleep(300);
  console.log(`  ${c.bold}The Gene Map is your agent's immune system.${c.reset}`);
  console.log(`  ${MUTED}Every repair makes the next one smarter.${c.reset}`);
  await pause();
}

// ── Section 7: Closing ──────────────────────────────────────────────────
async function section7Close() {
  process.stdout.write(CLEAR);
  await sleep(200);
  process.stdout.write(HELIX_LOGO);
  await sleep(300);

  console.log(`        ${c.bold}${HELIX}The receipts:${c.reset}\n`);
  await sleep(200);

  const stats = [
    { label: 'Frontier LLM accuracy gap',     value: '10–50 pts',     color: ACCENT },
    { label: 'PCEC accuracy on test set',     value: '100%',          color: SUCCESS },
    { label: 'On-chain transactions verified', value: '100+',          color: HELIX },
    { label: 'Error patterns supported',       value: '61',            color: HELIX },
    { label: 'Platforms covered',              value: '5',             color: HELIX },
    { label: 'Networks tested',                value: 'Base, Monad',   color: HELIX },
    { label: 'Tests passing',                  value: '553',           color: HELIX },
  ];

  const maxLabel = Math.max(...stats.map((s) => s.label.length));
  for (const s of stats) {
    process.stdout.write(`  ${MUTED}${s.label.padEnd(maxLabel)}${c.reset}   ${s.color}${c.bold}${s.value}${c.reset}\n`);
    await sleep(120);
  }

  console.log();
  await sleep(300);
  console.log(box([
    `${c.bold}npm install ${HELIX}@helix-agent/core${c.reset}`,
    ``,
    `${MUTED}github.com/adrianhihi/helix${c.reset}`,
    `${MUTED}helix.ai · vial.ai${c.reset}`,
  ], HELIX, 4));
  console.log();
  await sleep(500);

  if (INTERACTIVE) {
    process.stdout.write(`  ${MUTED}${c.italic}press ENTER to exit${c.reset}`);
    await new Promise<void>((resolve) => getReadline().question('', () => resolve()));
  }

  process.stdout.write(SHOW_CURSOR + '\n');
  if (rl) rl.close();
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    process.stdout.write(SHOW_CURSOR + '\n');
    process.exit(0);
  });

  try {
    await titleScreen();
    await section1Problem();
    await section2Benchmark();
    await section3CoT();
    await section4Compounding();
    await section5OnChain();
    await section6HowItWorks();
    await section7Close();
  } finally {
    process.stdout.write(SHOW_CURSOR);
    if (rl) rl.close();
  }
}

main().catch((err) => {
  process.stdout.write(SHOW_CURSOR);
  console.error(err);
  process.exit(1);
});
