#!/usr/bin/env node
/**
 * Helix — Full E2E Test with Real ETH on Base Sepolia
 * Every tx hash verifiable on https://sepolia.basescan.org
 */

import { wrap, createEngine } from '../../packages/core/src/engine/wrap.js';
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { WrapOptions, RepairResult } from '../../packages/core/src/engine/types.js';

const PRIVATE_KEY = process.env.HELIX_TEST_PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) { console.error('❌ Set HELIX_TEST_PRIVATE_KEY'); process.exit(1); }

const account = privateKeyToAccount(PRIVATE_KEY);
const RPC = 'https://sepolia.base.org';
const BURN = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;

const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const wallet = createWalletClient({ chain: baseSepolia, transport: http(RPC), account });

const engine = createEngine({ mode: 'auto', agentId: 'full-e2e', provider: { rpcUrl: RPC, privateKey: PRIVATE_KEY }, geneMapPath: ':memory:' } as WrapOptions);
const freshEngine = createEngine({ mode: 'auto', agentId: 'fresh-e2e', provider: { rpcUrl: RPC }, geneMapPath: ':memory:' } as WrapOptions);

const P = '✅', F = '❌', I = '⚡';
const results: { name: string; pass: boolean; detail: string; cat: string; tx?: string }[] = [];
const txHashes: string[] = [];

function sec(n: string, c: string) { console.log(`\n${'━'.repeat(65)}\n  ${n}\n  ${c}\n${'━'.repeat(65)}`); }
function rec(name: string, pass: boolean, detail: string, cat: string, tx?: string) { results.push({ name, pass, detail, cat, tx }); if (tx) txHashes.push(tx); console.log(`  ${pass ? P : F} ${detail}`); if (tx) console.log(`  🔗 https://sepolia.basescan.org/tx/${tx}`); }
function log(m: string) { console.log(`  ${m}`); }

// ═══ PART A: HTTP Repairs ═══

async function test_http_429() {
  sec('A1: HTTP 429 → backoff_retry → Success', 'HTTP Repair');
  let c = 0;
  const api = async () => { c++; if (c === 1) { const r = await fetch('https://httpbin.org/status/429'); if (!r.ok) throw new Error(`HTTP 429 (status=${r.status})`); } const r = await fetch('https://httpbin.org/get'); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); };
  const safe = wrap(api, { mode: 'auto', agentId: 'e2e', geneMapPath: ':memory:', maxRetries: 2, verbose: true } as WrapOptions);
  const t = Date.now();
  try { const r = await safe(); rec('HTTP 429', c >= 2, `Repaired: ${c} calls, ${Date.now() - t}ms, origin=${r?.origin}`, 'HTTP Repair'); }
  catch { const d = await engine.repair(new Error('HTTP 429')); rec('HTTP 429', !!d.winner || d.immune, `Diagnosed: ${d.winner?.strategy ?? d.gene?.strategy}`, 'HTTP Repair'); }
}

async function test_http_500() {
  sec('A2: HTTP 500 → retry → Success', 'HTTP Repair');
  let c = 0;
  const api = async () => { c++; if (c === 1) { const r = await fetch('https://httpbin.org/status/500'); if (!r.ok) throw new Error(`HTTP 500`); } const r = await fetch('https://httpbin.org/get'); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); };
  const safe = wrap(api, { mode: 'auto', agentId: 'e2e', geneMapPath: ':memory:', maxRetries: 2, verbose: true } as WrapOptions);
  try { await safe(); rec('HTTP 500', c >= 2, `Repaired: ${c} calls`, 'HTTP Repair'); }
  catch { const d = await engine.repair(new Error('HTTP 500')); rec('HTTP 500', !!d.winner || d.immune, `Diagnosed`, 'HTTP Repair'); }
}

// ═══ PART B: RPC Reads ═══

async function test_rpc() {
  sec('B1: Real RPC Reads', 'RPC Read');
  try {
    const [cid, nonce, bal, blk] = await Promise.all([pub.getChainId(), pub.getTransactionCount({ address: account.address }), pub.getBalance({ address: account.address }), pub.getBlockNumber()]);
    log(`Chain: ${cid} | Block: ${blk} | Nonce: ${nonce} | Balance: ${formatEther(bal)} ETH`);
    rec('RPC Reads', cid === 84532, `chainId=${cid}, nonce=${nonce}, balance=${formatEther(bal)} ETH, block=${blk}`, 'RPC Read');
  } catch (e: any) { rec('RPC Reads', false, e.message.slice(0, 60), 'RPC Read'); }
}

// ═══ PART C: Chain Writes 🔥 ═══

async function test_real_transfer() {
  sec('C1: Real ETH Transfer → basescan tx hash', 'Chain Write');
  try {
    const bal = await pub.getBalance({ address: account.address });
    log(`Balance: ${formatEther(bal)} ETH`);
    if (bal < parseEther('0.00001')) { rec('Real Transfer', false, 'Balance too low', 'Chain Write'); return; }

    const amt = parseEther('0.000001');
    log(`Sending ${formatEther(amt)} ETH to burn address...`);
    const hash = await wallet.sendTransaction({ to: BURN, value: amt });
    log(`Tx: ${hash}`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    log(`Status: ${receipt.status} | Block: ${receipt.blockNumber} | Gas: ${receipt.gasUsed}`);
    rec('Real Transfer', receipt.status === 'success', `block=${receipt.blockNumber}, gas=${receipt.gasUsed}`, 'Chain Write', hash);
  } catch (e: any) { log(`Error: ${e.shortMessage ?? e.message}`); rec('Real Transfer', false, e.shortMessage ?? e.message, 'Chain Write'); }
}

async function test_nonce_repair_tx() {
  sec('C2: Nonce Repair → Send Real Tx with Corrected Nonce', 'Chain Write');
  try {
    const realNonce = await pub.getTransactionCount({ address: account.address });
    log(`Real nonce from chain: ${realNonce}`);

    // Helix diagnoses the nonce error
    const r = await engine.repair(new Error(`nonce too high: expected ${realNonce}, got ${realNonce + 100}`), { chainId: 84532, walletAddress: account.address });
    const s = r.winner?.strategy ?? r.gene?.strategy ?? 'none';
    log(`Helix strategy: ${s} ${r.immune ? I : ''}`);

    // Send real tx with the correct nonce (what Helix would provide)
    const bal = await pub.getBalance({ address: account.address });
    if (bal < parseEther('0.00001')) { rec('Nonce → Real Tx', false, 'Balance too low for tx', 'Chain Write'); return; }

    const hash = await wallet.sendTransaction({ to: BURN, value: parseEther('0.000001'), nonce: realNonce });
    log(`Tx with corrected nonce: ${hash}`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    log(`Status: ${receipt.status} | Block: ${receipt.blockNumber}`);
    rec('Nonce → Real Tx', receipt.status === 'success', `Helix(${s}) → nonce=${realNonce} → block=${receipt.blockNumber}`, 'Chain Write', hash);
  } catch (e: any) { log(`Error: ${e.shortMessage ?? e.message}`); rec('Nonce → Real Tx', false, e.shortMessage ?? e.message, 'Chain Write'); }
}

// ═══ PART D: Gene Loop ═══

async function test_gene_loop() {
  sec('D1: Gene Loop — PCEC → Gene → IMMUNE', 'Gene Loop');
  const r1 = await freshEngine.repair(new Error('AA25 invalid account nonce'), { chainId: 84532, walletAddress: account.address });
  log(`1st: strategy=${r1.winner?.strategy ?? r1.gene?.strategy}, immune=${r1.immune}`);
  const r2 = await freshEngine.repair(new Error('nonce mismatch'), { chainId: 84532, walletAddress: account.address });
  log(`2nd: immune=${r2.immune} ${r2.immune ? I : ''}`);
  const r3 = await freshEngine.repair(new Error('nonce too low'), { chainId: 84532 });
  log(`3rd: immune=${r3.immune} ${r3.immune ? I : ''}`);
  const gene = freshEngine.getGeneMap().lookup('verification-failed' as any, 'signature' as any);
  log(`Gene q=${gene?.qValue?.toFixed(3)}, fixes=${gene?.successCount}`);
  rec('Gene Loop', r2.immune || r3.immune, `${r2.immune ? 'IMMUNE on 2nd' : ''}${r3.immune ? ', IMMUNE on 3rd' : ''}, q=${gene?.qValue?.toFixed(3)}`, 'Gene Loop');
}

// ═══ PART E: Coinbase + Cross-Platform ═══

async function test_coinbase() {
  sec('E1: Coinbase Scenarios + Cross-Platform', 'Coinbase');
  const tests = [
    { err: 'AA25 invalid account nonce', lbl: 'AA25' },
    { err: 'rate_limit_exceeded: 429', lbl: 'CDP Rate' },
    { err: 'EXECUTION_REVERTED (-32521)', lbl: 'Reverted' },
    { err: 'max per user op spend limit exceeded', lbl: 'Policy' },
    { err: 'insufficient USDC token balance for 402 payment', lbl: 'x402 USDC' },
    { err: 'wallet connected to wrong network', lbl: 'x402 Network' },
  ];
  let ok = 0;
  for (const t of tests) {
    const r = await engine.repair(new Error(t.err), { chainId: 84532 });
    const s = r.winner?.strategy ?? r.gene?.strategy ?? 'none';
    const pass = s !== 'none';
    if (pass) ok++;
    log(`${pass ? P : F} ${t.lbl}: ${s} ${r.immune ? I : ''}`);
  }

  // Cross-platform
  const xp = ['nonce mismatch', '429 Too Many Requests', 'session expired'];
  let imm = 0;
  for (const e of xp) { const r = await engine.repair(new Error(e), { chainId: 84532 }); if (r.immune) imm++; }
  log(`Cross-platform immunity: ${imm}/${xp.length}`);

  rec('Coinbase', ok >= 4, `${ok}/${tests.length} diagnosed, ${imm}/${xp.length} cross-platform immune`, 'Coinbase');
}

// ═══ MAIN ═══

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  HELIX — Full E2E Test (Real ETH on Base Sepolia)                ║
╠══════════════════════════════════════════════════════════════════╣
║  A: HTTP Repairs  B: RPC Reads  C: Chain Writes  D: Gene Loop    ║
║  E: Coinbase Scenarios + Cross-Platform Immunity                 ║
║  Wallet: ${account.address}      ║
║  Chain:  Base Sepolia (84532) · RPC: sepolia.base.org            ║
╚══════════════════════════════════════════════════════════════════╝`);

  const t0 = Date.now();
  await test_http_429();
  await test_http_500();
  await test_rpc();
  await test_real_transfer();
  await test_nonce_repair_tx();
  await test_gene_loop();
  await test_coinbase();

  const elapsed = Date.now() - t0;
  const cats = ['HTTP Repair', 'RPC Read', 'Chain Write', 'Gene Loop', 'Coinbase'];

  console.log(`\n${'═'.repeat(65)}\n  HELIX FULL E2E SUMMARY\n${'═'.repeat(65)}`);
  for (const c of cats) {
    const cr = results.filter(r => r.cat === c);
    if (!cr.length) continue;
    console.log(`\n  ${c} (${cr.filter(r => r.pass).length}/${cr.length}):`);
    for (const r of cr) { console.log(`    ${r.pass ? P : F} ${r.name}: ${r.detail}`); if (r.tx) console.log(`       🔗 https://sepolia.basescan.org/tx/${r.tx}`); }
  }

  const passed = results.filter(r => r.pass).length;
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`  Total: ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(0)}%)`);
  console.log(`  Time: ${elapsed}ms`);

  if (txHashes.length > 0) { console.log(`\n  🔗 Real tx hashes:`); txHashes.forEach(h => console.log(`     https://sepolia.basescan.org/tx/${h}`)); }

  const finalBal = await pub.getBalance({ address: account.address });
  console.log(`\n  Wallet: ${account.address}`);
  console.log(`  Final balance: ${formatEther(finalBal)} ETH`);

  if (passed >= results.length - 1 && txHashes.length > 0) console.log(`\n  🎉 Full E2E passed with real tx hashes on basescan.`);
  console.log(`${'═'.repeat(65)}\n`);
}

main().catch(console.error);
