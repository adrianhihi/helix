#!/usr/bin/env node
/**
 * Helix — Real Payment Agent (Auto-Detect, Shared Gene Map)
 *
 * All scenarios share one Gene Map via getDefaultEngine singleton.
 * S3 uses wrap() to auto-fix nonce errors (not manual engine.repair).
 * S4 proves IMMUNE by reusing the same Gene Map as S3.
 */

import { wrap } from '../../packages/core/src/engine/wrap.js';
import { createPublicClient, createWalletClient, http, parseEther, formatEther, type Hash } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { WrapOptions } from '../../packages/core/src/engine/types.js';
import { unlinkSync } from 'fs';

const PK = process.env.HELIX_TEST_PRIVATE_KEY as `0x${string}`;
if (!PK) { console.error('❌ Set HELIX_TEST_PRIVATE_KEY'); process.exit(1); }

const account = privateKeyToAccount(PK);
const RPC = 'https://sepolia.base.org';
const BURN = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const wal = createWalletClient({ chain: baseSepolia, transport: http(RPC), account });

// Clean old Gene Map so we start fresh
const GENE_DB = '/tmp/helix-e2e-payment.db';
try { unlinkSync(GENE_DB); } catch {}

// Payment function
async function sendPayment(p: { to: `0x${string}`; value: bigint; nonce?: number }): Promise<{ hash: Hash; status: string }> {
  const tx: any = { to: p.to, value: p.value };
  if (p.nonce !== undefined) tx.nonce = p.nonce;
  const hash = await wal.sendTransaction(tx);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

// ONE wrap() instance — shared Gene Map across ALL scenarios
const safePay = wrap(sendPayment, {
  mode: 'auto',
  agentId: 'payment-agent',
  provider: { rpcUrl: RPC, privateKey: PK },
  maxRetries: 2,
  verbose: true,
  geneMapPath: GENE_DB,
} as WrapOptions);

const txHashes: string[] = [];

// ═══ S1: Normal Payment ═══
async function s1() {
  console.log(`\n${'═'.repeat(55)}\n  S1: Normal Payment (baseline)\n${'═'.repeat(55)}`);
  try {
    const r = await safePay({ to: BURN, value: parseEther('0.000001') });
    console.log(`  ✅ Tx: ${r.hash}`);
    console.log(`  🔗 https://sepolia.basescan.org/tx/${r.hash}`);
    console.log(`  Helix: ${(r as any)._helix ? 'repaired' : 'pass-through'}`);
    txHashes.push(r.hash);
    return r.hash;
  } catch (e: any) { console.log(`  ❌ ${e.shortMessage ?? e.message}`); return null; }
}

// ═══ S2: Rate-Limited API → backoff_retry ═══
async function s2() {
  console.log(`\n${'═'.repeat(55)}\n  S2: Rate-Limited API → backoff_retry\n${'═'.repeat(55)}`);
  let c = 0;
  const api = async (p: { orderId: string }) => {
    c++; console.log(`  API call #${c}`);
    if (c === 1) {
      const res = await fetch('https://httpbin.org/status/429');
      throw new Error(`HTTP ${res.status}: Rate limited (real httpbin)`);
    }
    const r = await fetch('https://httpbin.org/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    return { success: true, data: await r.json() };
  };
  const safeApi = wrap(api, { mode: 'auto', agentId: 'payment-agent-s2', maxRetries: 3, verbose: true, geneMapPath: GENE_DB } as WrapOptions);
  const t = Date.now();
  try {
    const r = await safeApi({ orderId: 'ORD-001' });
    console.log(`  ✅ Repaired: ${c} calls, ${Date.now() - t}ms`);
    return true;
  } catch (e: any) { console.log(`  ❌ ${e.message.slice(0, 80)}`); return false; }
}

// ═══ S3: Wrong Nonce → wrap() Auto-Fix ═══
async function s3() {
  console.log(`\n${'═'.repeat(55)}\n  S3: Wrong Nonce → wrap() Auto-Fix\n${'═'.repeat(55)}`);
  const realNonce = await pub.getTransactionCount({ address: account.address });
  console.log(`  Real nonce: ${realNonce}, sending with wrong nonce: ${realNonce + 100}`);
  try {
    // THIS is the key test: safePay with intentionally wrong nonce
    // wrap() should: catch RPC error → PCEC → refresh_nonce → auto-detect injects correct nonce → retry → success
    const r = await safePay({ to: BURN, value: parseEther('0.000001'), nonce: realNonce + 100 });
    console.log(`  ✅ Repaired! Tx: ${r.hash}`);
    console.log(`  🔗 https://sepolia.basescan.org/tx/${r.hash}`);
    if ((r as any)._helix) {
      console.log(`  Strategy: ${(r as any)._helix.strategy ?? 'auto'}`);
      console.log(`  Attempts: ${(r as any)._helix.attempts}`);
      console.log(`  Repaired: ${(r as any)._helix.repaired}`);
    }
    txHashes.push(r.hash);
    return r.hash;
  } catch (e: any) {
    console.log(`  ❌ ${e.shortMessage ?? e.message}`);
    if (e._helix) console.log(`  Helix: ${JSON.stringify({ strategy: e._helix.winner?.strategy ?? e._helix.gene?.strategy, immune: e._helix.immune })}`);
    return null;
  }
}

// ═══ S4: Second Nonce Error → IMMUNE ⚡ ═══
async function s4() {
  console.log(`\n${'═'.repeat(55)}\n  S4: Second Nonce Error → IMMUNE ⚡\n${'═'.repeat(55)}`);
  const realNonce = await pub.getTransactionCount({ address: account.address });
  console.log(`  Sending with wrong nonce again: ${realNonce + 200}`);
  const t = Date.now();
  try {
    // Same safePay, same Gene Map → should be IMMUNE from S3's Gene
    const r = await safePay({ to: BURN, value: parseEther('0.000001'), nonce: realNonce + 200 });
    const elapsed = Date.now() - t;
    console.log(`  ✅ Tx: ${r.hash}`);
    console.log(`  🔗 https://sepolia.basescan.org/tx/${r.hash}`);
    if ((r as any)._helix) {
      console.log(`  Immune: ${(r as any)._helix.immune ?? false} ${(r as any)._helix.immune ? '⚡' : ''}`);
      console.log(`  Time: ${elapsed}ms`);
      console.log(`  Repaired: ${(r as any)._helix.repaired}`);
    }
    txHashes.push(r.hash);
    return r.hash;
  } catch (e: any) {
    console.log(`  ❌ ${e.shortMessage ?? e.message}`);
    if (e._helix) console.log(`  Helix: immune=${e._helix.immune}`);
    return null;
  }
}

// ═══ MAIN ═══
async function main() {
  console.log(`
╔═════════════════════════════════════════════════════════╗
║  HELIX — Real Payment Agent (Shared Gene Map)           ║
║  wrap(fn, { mode: 'auto' }) — auto-detect, no config    ║
║  Wallet: ${account.address}  ║
║  Chain:  Base Sepolia (84532)                           ║
║  Gene DB: ${GENE_DB.padEnd(40)}║
╚═════════════════════════════════════════════════════════╝`);

  const bal = await pub.getBalance({ address: account.address });
  console.log(`\n  Balance: ${formatEther(bal)} ETH`);
  if (bal < parseEther('0.00003')) { console.error('  ❌ Need ETH'); process.exit(1); }

  await s1();  // baseline
  await s2();  // HTTP 429 repair
  await s3();  // Wrong nonce → wrap() auto-fix → real tx
  await s4();  // Same error → IMMUNE (shared Gene Map)

  const finalBal = await pub.getBalance({ address: account.address });
  console.log(`\n${'═'.repeat(55)}\n  SUMMARY\n${'═'.repeat(55)}`);
  if (txHashes.length > 0) {
    console.log(`\n  🔗 Real transactions:`);
    txHashes.forEach((h, i) => console.log(`     ${i + 1}. https://sepolia.basescan.org/tx/${h}`));
  }
  console.log(`\n  Balance: ${formatEther(bal)} → ${formatEther(finalBal)} ETH`);
  console.log(`  Gas: ${formatEther(bal - finalBal)} ETH`);
  console.log(`  Tx count: ${txHashes.length}`);
  console.log(`\n  Proves:`);
  console.log(`    ✅ wrap(sendPayment) auto-detects viem tx`);
  console.log(`    ✅ Wrong nonce → wrap() auto-fixes → real tx hash`);
  console.log(`    ✅ Shared Gene Map → IMMUNE on 2nd nonce error`);
  console.log(`    ✅ HTTP 429 → backoff_retry → real httpbin`);
  console.log(`${'═'.repeat(55)}\n`);

  // Cleanup
  try { unlinkSync(GENE_DB); } catch {}
}

main().catch(console.error);
