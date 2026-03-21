#!/usr/bin/env node
/**
 * Real Chain Example — Uses Base Sepolia testnet.
 * Real RPC calls, no transactions sent (read-only).
 *
 * Run: npm run demo:chain
 */
import { HelixProvider } from '../../packages/core/src/engine/provider.js';
import { createEngine } from '../../packages/core/src/engine/wrap.js';
import type { FailureClassification } from '../../packages/core/src/engine/types.js';

const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const;

function f(overrides: Partial<FailureClassification> = {}): FailureClassification {
  return { code: 'unknown', category: 'unknown', severity: 'medium', platform: 'coinbase', details: '', timestamp: Date.now(), ...overrides };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  HELIX — Real Chain Example (Base Sepolia testnet)    ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log();

  const provider = new HelixProvider({ rpcUrl: BASE_SEPOLIA_RPC });

  // ── Test 1: Real nonce refresh ──
  console.log('▸ Test 1: refresh_nonce (real eth_getTransactionCount)');
  const r1 = await provider.execute('refresh_nonce',
    f({ code: 'verification-failed', category: 'signature' }),
    { walletAddress: VITALIK });
  console.log(`  Success: ${r1.success}`);
  console.log(`  ${r1.description}`);
  console.log();

  // ── Test 2: Real balance check ──
  console.log('▸ Test 2: get_balance (real eth_getBalance)');
  const r2 = await provider.execute('get_balance',
    f({ code: 'payment-insufficient', category: 'balance' }),
    { walletAddress: VITALIK });
  console.log(`  Success: ${r2.success}`);
  console.log(`  ${r2.description}`);
  console.log();

  // ── Test 3: Real chain ID ──
  console.log('▸ Test 3: switch_network (real eth_chainId)');
  const r3 = await provider.execute('switch_network',
    f({ code: 'token-uninitialized', category: 'network' }),
    { targetChainId: 84532 });
  console.log(`  Success: ${r3.success}`);
  console.log(`  ${r3.description}`);
  console.log();

  // ── Test 4: Full PCEC with real RPC ──
  console.log('▸ Test 4: Full PCEC engine with real RPC provider');
  const engine = createEngine({
    mode: 'auto',
    provider: { rpcUrl: BASE_SEPOLIA_RPC },
    geneMapPath: ':memory:',
  });
  const r4 = await engine.repair(
    new Error('AA25 Invalid account nonce. Expected 12, got 10'),
    { walletAddress: VITALIK },
  );
  console.log(`  Success: ${r4.success}`);
  console.log(`  Strategy: ${r4.winner?.strategy ?? r4.gene?.strategy ?? 'none'}`);
  console.log(`  Verified: ${r4.verified}`);
  console.log(`  Explanation: ${r4.explanation.split('\n')[0]}`);
  console.log();

  console.log('Done. All tests used real RPC calls to Base Sepolia.');
}

main().catch(console.error);
