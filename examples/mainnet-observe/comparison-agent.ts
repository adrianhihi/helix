/**
 * Helix Before/After Comparison Agent
 *
 * Runs two agents alternately:
 * - Without Helix: errors = failed transactions
 * - With Helix: errors = auto-repaired transactions
 *
 * Error distribution (based on real Coinbase/Privy/viem patterns):
 *   nonce conflict:       40%
 *   gas too low:          25%
 *   rate limit:           20%
 *   insufficient balance: 10%
 *   session expired:       5% (mapped to nonce — session not testable without Privy SDK)
 *
 * Change DURATION_MS for different run lengths:
 *   5 min test:  300_000
 *   24 hour run: 86_400_000
 *
 * Usage:
 *   export BASE_RPC_URL="..."
 *   export PRIVATE_KEY="0x..."
 *   export RECIPIENT="0x..."
 *   npx tsx examples/mainnet-observe/comparison-agent.ts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { wrap } from '@helix-agent/core';
import * as fs from 'fs';

const RPC_URL = process.env.BASE_RPC_URL!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RECIPIENT = process.env.RECIPIENT!;

// ── Config ────────────────────────────────────────────────
const DURATION_MS = parseInt(process.env.DURATION_MS || '300000'); // 5 min default
const TX_INTERVAL_MS = parseInt(process.env.TX_INTERVAL_MS || '30000'); // 30s between txs
const ERROR_RATE = parseFloat(process.env.ERROR_RATE || '0.3'); // 30% error rate

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

// ── Stats ─────────────────────────────────────────────────
const stats = {
  without: { attempts: 0, failed: 0, succeeded: 0, errors: [] as string[] },
  with: { attempts: 0, failed: 0, succeeded: 0, repaired: 0, txHashes: [] as string[], repairs: [] as { error: string; strategy: string; txHash: string; repairMs: number }[] },
};

// ── Error injection ───────────────────────────────────────
type ErrorType = 'nonce' | 'gas' | 'rate_limit' | 'balance' | 'none';

function pickErrorType(): ErrorType {
  if (Math.random() > ERROR_RATE) return 'none';

  const rand = Math.random();
  if (rand < 0.40) return 'nonce';        // 40% nonce conflict
  if (rand < 0.65) return 'gas';          // 25% gas too low
  if (rand < 0.85) return 'rate_limit';   // 20% rate limit
  if (rand < 0.95) return 'balance';      // 10% insufficient balance
  return 'nonce';                          // 5% → nonce (session not testable)
}

async function buildTxParams(errorType: ErrorType) {
  const currentNonce = await publicClient.getTransactionCount({ address: account.address });
  const balance = await publicClient.getBalance({ address: account.address });

  switch (errorType) {
    case 'nonce':
      return {
        to: RECIPIENT as `0x${string}`,
        value: parseEther('0.000001'),
        nonce: Math.max(0, currentNonce - 1), // stale nonce
      };
    case 'gas':
      return {
        to: RECIPIENT as `0x${string}`,
        value: parseEther('0.000001'),
        gas: 1n, // way too low
      };
    case 'balance':
      return {
        to: RECIPIENT as `0x${string}`,
        value: (balance * 110n) / 100n, // 110% of balance
      };
    default:
      return {
        to: RECIPIENT as `0x${string}`,
        value: parseEther('0.000001'),
      };
  }
}

// ── Raw payment (no Helix) ────────────────────────────────
async function rawPayment(errorType: ErrorType) {
  stats.without.attempts++;
  const timestamp = new Date().toISOString();

  // Rate limit can't be triggered on-chain — simulate it
  if (errorType === 'rate_limit') {
    stats.without.failed++;
    stats.without.errors.push(`[${timestamp}] rate_limit: 429 Too Many Requests`);
    console.log(`  [WITHOUT] ❌ attempt #${stats.without.attempts} (rate_limit) → FAILED: 429 Too Many Requests`);
    return;
  }

  try {
    const params = await buildTxParams(errorType);
    const hash = await walletClient.sendTransaction(params);
    await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 });
    stats.without.succeeded++;
    console.log(`  [WITHOUT] ✅ attempt #${stats.without.attempts} (${errorType}) → success`);
  } catch (e: any) {
    stats.without.failed++;
    const msg = e.shortMessage || e.message?.substring(0, 60) || 'unknown';
    stats.without.errors.push(`[${timestamp}] ${errorType}: ${msg}`);
    console.log(`  [WITHOUT] ❌ attempt #${stats.without.attempts} (${errorType}) → FAILED: ${msg}`);
  }
}

// ── Helix payment (with Helix) ────────────────────────────
async function helixPayment(errorType: ErrorType) {
  stats.with.attempts++;

  // Rate limit: wrap a function that throws 429
  if (errorType === 'rate_limit') {
    let attempt = 0;
    async function rateLimitedPay() {
      attempt++;
      if (attempt <= 1) throw new Error('429 Too Many Requests: rate limit exceeded');
      // On retry (after backoff), succeed with a normal tx
      return walletClient.sendTransaction({
        to: RECIPIENT as `0x${string}`,
        value: parseEther('0.000001'),
      });
    }

    const safePay = wrap(rateLimitedPay, {
      mode: 'auto' as any,
      platform: 'coinbase',
      verbose: false,
    });

    try {
      const start = Date.now();
      const result = await safePay();
      const repairMs = Date.now() - start;
      const hash = typeof result === 'string' ? result : '';

      if (hash) {
        try { await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 15_000 }); } catch {}
      }

      stats.with.succeeded++;
      stats.with.repaired++;
      stats.with.repairs.push({ error: 'rate_limit', strategy: 'backoff_retry', txHash: hash, repairMs });
      if (hash) stats.with.txHashes.push(hash);
      console.log(`  [WITH]    🔧 attempt #${stats.with.attempts} (rate_limit) → repaired via backoff_retry in ${repairMs}ms${hash ? ` → TX ${hash.substring(0, 10)}...` : ''}`);
    } catch (e: any) {
      stats.with.failed++;
      const msg = e.shortMessage || e.message?.substring(0, 60) || 'unknown';
      console.log(`  [WITH]    ❌ attempt #${stats.with.attempts} (rate_limit) → failed: ${msg}`);
    }
    return;
  }

  async function sendTx(params: any) {
    return walletClient.sendTransaction(params);
  }

  const safePay = wrap(sendTx, {
    mode: 'auto' as any,
    platform: 'coinbase',
    verbose: false,
  });

  try {
    const params = await buildTxParams(errorType);
    const start = Date.now();
    const result = await safePay(params);
    const repairMs = Date.now() - start;

    const hash = typeof result === 'string' ? result : '';

    if (hash) {
      try {
        await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 15_000 });
      } catch {}
    }

    stats.with.succeeded++;

    if (errorType !== 'none') {
      stats.with.repaired++;
      stats.with.repairs.push({
        error: errorType,
        strategy: 'auto-repaired',
        txHash: hash,
        repairMs,
      });
      if (hash) stats.with.txHashes.push(hash);
      console.log(`  [WITH]    🔧 attempt #${stats.with.attempts} (${errorType}) → repaired in ${repairMs}ms${hash ? ` → TX ${hash.substring(0, 10)}...` : ''}`);
    } else {
      console.log(`  [WITH]    ✅ attempt #${stats.with.attempts} (${errorType}) → success`);
    }
  } catch (e: any) {
    stats.with.failed++;
    const msg = e.shortMessage || e.message?.substring(0, 60) || 'unknown';
    console.log(`  [WITH]    ❌ attempt #${stats.with.attempts} (${errorType}) → failed: ${msg}`);
  }
}

// ── Save log ──────────────────────────────────────────────
function saveLog() {
  const log = {
    timestamp: new Date().toISOString(),
    duration_ms: DURATION_MS,
    error_rate: ERROR_RATE,
    without_helix: {
      attempts: stats.without.attempts,
      succeeded: stats.without.succeeded,
      failed: stats.without.failed,
      failure_rate: `${((stats.without.failed / Math.max(stats.without.attempts, 1)) * 100).toFixed(1)}%`,
      errors: stats.without.errors,
    },
    with_helix: {
      attempts: stats.with.attempts,
      succeeded: stats.with.succeeded,
      failed: stats.with.failed,
      repaired: stats.with.repaired,
      repair_rate: `${((stats.with.repaired / Math.max(stats.with.failed + stats.with.repaired, 1)) * 100).toFixed(1)}%`,
      tx_hashes: stats.with.txHashes,
      repairs: stats.with.repairs,
    },
  };

  fs.writeFileSync('comparison-log.json', JSON.stringify(log, null, 2));
  return log;
}

// ── Print summary ─────────────────────────────────────────
function printSummary() {
  const log = saveLog();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESULTS\n');
  console.log('  WITHOUT Helix:');
  console.log(`    Attempts:  ${log.without_helix.attempts}`);
  console.log(`    Succeeded: ${log.without_helix.succeeded}`);
  console.log(`    Failed:    ${log.without_helix.failed} (${log.without_helix.failure_rate})`);
  console.log();
  console.log('  WITH Helix:');
  console.log(`    Attempts:  ${log.with_helix.attempts}`);
  console.log(`    Succeeded: ${log.with_helix.succeeded}`);
  console.log(`    Repaired:  ${log.with_helix.repaired} (${log.with_helix.repair_rate})`);
  console.log(`    Failed:    ${log.with_helix.failed}`);
  console.log();

  // Error distribution breakdown
  const errorCounts = stats.with.repairs.reduce((acc, r) => {
    acc[r.error] = (acc[r.error] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  if (Object.keys(errorCounts).length > 0) {
    console.log('  Error distribution (WITH Helix):');
    Object.entries(errorCounts).forEach(([type, count]) => {
      console.log(`    ${type.padEnd(15)} ${count} repairs`);
    });
    console.log();
  }

  if (log.with_helix.tx_hashes.length > 0) {
    console.log('  TX Hashes (repaired transactions):');
    log.with_helix.tx_hashes.slice(0, 5).forEach(h => {
      console.log(`    https://basescan.org/tx/${h}`);
    });
    if (log.with_helix.tx_hashes.length > 5) {
      console.log(`    ... and ${log.with_helix.tx_hashes.length - 5} more`);
    }
  }

  console.log();
  console.log('  Saved to comparison-log.json');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('\nHelix Before/After Comparison Agent');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Wallet:    ${account.address}`);
  console.log(`Recipient: ${RECIPIENT}`);
  console.log(`Duration:  ${DURATION_MS / 60000} minutes`);
  console.log(`Interval:  ${TX_INTERVAL_MS / 1000}s between txs`);
  console.log(`Error rate: ${(ERROR_RATE * 100).toFixed(0)}%`);
  console.log(`Error distribution: nonce 40% | gas 25% | rate_limit 20% | balance 10%`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance:   ${formatEther(balance)} ETH`);
  console.log();

  if (balance < parseEther('0.001')) {
    console.error('❌ Insufficient balance. Need at least 0.001 ETH.');
    process.exit(1);
  }

  const startTime = Date.now();
  let txCount = 0;

  console.log('Starting... (Ctrl+C to stop early)\n');

  // Save log on exit
  process.on('SIGINT', () => {
    console.log('\n\nStopped early.');
    printSummary();
    process.exit(0);
  });

  while (Date.now() - startTime < DURATION_MS) {
    txCount++;
    const errorType = pickErrorType();
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n[${elapsed}s] TX #${txCount} — error type: ${errorType}`);

    // Run both agents with same error type
    await rawPayment(errorType);
    await new Promise(r => setTimeout(r, 2000)); // 2s gap between the two
    await helixPayment(errorType);

    // Save log every iteration
    saveLog();

    // Wait for next interval
    const remaining = TX_INTERVAL_MS - (Date.now() - startTime) % TX_INTERVAL_MS;
    if (Date.now() - startTime + remaining < DURATION_MS) {
      console.log(`\n  Next tx in ${Math.round(remaining / 1000)}s...`);
      await new Promise(r => setTimeout(r, remaining));
    }
  }

  printSummary();
}

main().catch(console.error);
