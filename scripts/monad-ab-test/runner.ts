/**
 * Monad Mainnet A/B Test — Helix vs Blind Retry
 *
 * Tests 4 scenarios:
 *  A. Normal transactions (baseline)
 *  B. Expired deadline → blind retry fails, Helix extends → success
 *  C. Parallel nonce conflict → blind retry creates more conflict, Helix sequences
 *  D. High-concurrency burst (Monad-specific: 10K TPS stress)
 *
 * Uses MON → WMON wrap instead of swap (no USDC needed)
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import type { TxAttempt, ScenarioResult } from './types.js';

const WMON_ADDRESS = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
const WMON_ABI = ['function deposit() external payable', 'function withdraw(uint256 wad) external', 'function balanceOf(address) external view returns (uint256)'];
const WRAP_AMOUNT = ethers.parseEther('0.001');
const MAX_ATTEMPTS = 3;
const EXPLORER = 'https://monadvision.com/tx';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function classifyError(msg: string): { code: string; repair: string } {
  const m = (msg || '').toLowerCase();
  if (m.includes('deadline') || m.includes('transaction too old') || m.includes('expired')) return { code: 'deadline_expired', repair: 'extend_deadline' };
  if (m.includes('nonce too low') || m.includes('nonce') || m.includes('replacement transaction')) return { code: 'nonce_conflict', repair: 'refresh_nonce' };
  if (m.includes('insufficient') || m.includes('balance')) return { code: 'insufficient_balance', repair: 'reduce_amount' };
  if (m.includes('gas') || m.includes('fee')) return { code: 'gas_error', repair: 'increase_gas' };
  return { code: 'unknown', repair: 'none' };
}

async function wrapMON(signer: ethers.Wallet, _provider: ethers.Provider, deadline: number, nonce: number | null, gasLimit = 100000): Promise<{ hash: string; gasUsedMON: number; onChain: boolean }> {
  if (deadline < Math.floor(Date.now() / 1000)) throw new Error(`Transaction too old: deadline ${deadline} has expired`);
  const wmon = new ethers.Contract(WMON_ADDRESS, WMON_ABI, signer);
  const txParams: any = { value: WRAP_AMOUNT, gasLimit };
  if (nonce !== null) txParams.nonce = nonce;
  const tx = await wmon.deposit(txParams);
  const receipt = await tx.wait();
  const gasUsedMON = Number(receipt!.gasUsed * receipt!.gasPrice) / 1e18;
  return { hash: tx.hash, gasUsedMON, onChain: true };
}

function makeTxAttempt(group: 'control' | 'helix', scenario: string, attempt: number, deadline: number, nonce: number | null): TxAttempt {
  return { group, scenario, attempt, txHash: null, success: false, onChain: false, errorMessage: null, errorType: null, repairApplied: null, gasUsedMON: 0, deadline, nonce, timestamp: new Date().toISOString(), explorerUrl: null };
}

async function runScenarioA(provider: ethers.Provider, signer: ethers.Wallet): Promise<ScenarioResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO A — Normal Transactions (Baseline)');
  console.log('═'.repeat(60));
  const result: ScenarioResult = { scenario: 'A_normal', description: 'Normal MON→WMON wrap', control: { attempts: [], succeeded: false, totalGasMON: 0 }, helix: { attempts: [], succeeded: false, totalGasMON: 0, repairApplied: null } };
  for (const group of ['control', 'helix'] as const) {
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const a = makeTxAttempt(group, 'A', 1, deadline, null);
    try {
      const { hash, gasUsedMON } = await wrapMON(signer, provider, deadline, null);
      a.txHash = hash; a.success = true; a.onChain = true; a.gasUsedMON = gasUsedMON; a.explorerUrl = `${EXPLORER}/${hash}`;
      result[group].succeeded = true;
      console.log(`  ✅ ${group}: ${hash.slice(0, 20)}...`);
    } catch (err: any) { a.errorMessage = err.message; a.errorType = classifyError(err.message).code; console.log(`  ❌ ${group}: ${a.errorType}`); }
    result[group].attempts.push(a); result[group].totalGasMON += a.gasUsedMON;
    await sleep(2000);
  }
  return result;
}

async function runScenarioB(provider: ethers.Provider, signer: ethers.Wallet): Promise<ScenarioResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO B — Expired Deadline');
  console.log('═'.repeat(60));
  const result: ScenarioResult = { scenario: 'B_expired_deadline', description: 'Expired deadline — blind retry reuses same expired deadline', control: { attempts: [], succeeded: false, totalGasMON: 0 }, helix: { attempts: [], succeeded: false, totalGasMON: 0, repairApplied: null } };
  const expiredDeadline = Math.floor(Date.now() / 1000) - 60;

  console.log('\n[control] Expired deadline...');
  for (let i = 1; i <= MAX_ATTEMPTS && !result.control.succeeded; i++) {
    const a = makeTxAttempt('control', 'B', i, expiredDeadline, null);
    try { const r = await wrapMON(signer, provider, expiredDeadline, null); a.txHash = r.hash; a.success = true; a.onChain = true; a.gasUsedMON = r.gasUsedMON; a.explorerUrl = `${EXPLORER}/${r.hash}`; result.control.succeeded = true; console.log(`  [control] #${i}: ✅`);
    } catch (err: any) { a.errorMessage = err.message; a.errorType = classifyError(err.message).code; console.log(`  [control] #${i}: ❌ ${a.errorType}`); await sleep(1000); }
    result.control.attempts.push(a); result.control.totalGasMON += a.gasUsedMON;
  }

  await sleep(2000);
  console.log('\n[helix]   Expired deadline...');
  let dl = expiredDeadline;
  for (let i = 1; i <= MAX_ATTEMPTS && !result.helix.succeeded; i++) {
    const a = makeTxAttempt('helix', 'B', i, dl, null);
    try { const r = await wrapMON(signer, provider, dl, null); a.txHash = r.hash; a.success = true; a.onChain = true; a.gasUsedMON = r.gasUsedMON; a.explorerUrl = `${EXPLORER}/${r.hash}`; result.helix.succeeded = true; console.log(`  [helix]   #${i}: ✅ (extended deadline worked!)`);
    } catch (err: any) {
      a.errorMessage = err.message; const { code } = classifyError(err.message); a.errorType = code;
      if (code === 'deadline_expired' && i < MAX_ATTEMPTS) { dl = Math.floor(Date.now() / 1000) + 300; a.repairApplied = `extend_deadline → ${dl}`; result.helix.repairApplied = 'extend_deadline'; console.log(`  [helix]   #${i}: ❌ expired → 🔧 extending +5min`); }
      else console.log(`  [helix]   #${i}: ❌ ${code}`);
      await sleep(1000);
    }
    result.helix.attempts.push(a); result.helix.totalGasMON += a.gasUsedMON;
  }
  return result;
}

async function runScenarioC(provider: ethers.Provider, signer: ethers.Wallet): Promise<ScenarioResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO C — Parallel Nonce Conflict');
  console.log('═'.repeat(60));
  const result: ScenarioResult = { scenario: 'C_nonce_conflict', description: 'Stale nonce from read race', control: { attempts: [], succeeded: false, totalGasMON: 0 }, helix: { attempts: [], succeeded: false, totalGasMON: 0, repairApplied: null } };
  const validDl = Math.floor(Date.now() / 1000) + 600;
  const currentNonce = await provider.getTransactionCount(signer.address);
  const staleNonce = Math.max(0, currentNonce - 2);
  console.log(`  Current nonce: ${currentNonce}, stale: ${staleNonce}`);

  console.log('\n[control] Stale nonce (blind retry)...');
  for (let i = 1; i <= MAX_ATTEMPTS && !result.control.succeeded; i++) {
    const a = makeTxAttempt('control', 'C', i, validDl, staleNonce);
    try { const r = await wrapMON(signer, provider, validDl, staleNonce); a.txHash = r.hash; a.success = true; a.onChain = true; a.gasUsedMON = r.gasUsedMON; a.explorerUrl = `${EXPLORER}/${r.hash}`; result.control.succeeded = true; console.log(`  [control] #${i}: ✅ (unexpected)`);
    } catch (err: any) { a.errorMessage = err.message; a.errorType = classifyError(err.message).code; console.log(`  [control] #${i}: ❌ ${a.errorType}`); await sleep(1000); }
    result.control.attempts.push(a); result.control.totalGasMON += a.gasUsedMON;
  }

  await sleep(2000);
  console.log('\n[helix]   Stale nonce...');
  let nc: number | null = staleNonce;
  for (let i = 1; i <= MAX_ATTEMPTS && !result.helix.succeeded; i++) {
    const a = makeTxAttempt('helix', 'C', i, validDl, nc);
    try { const r = await wrapMON(signer, provider, validDl, nc); a.txHash = r.hash; a.success = true; a.onChain = true; a.gasUsedMON = r.gasUsedMON; a.explorerUrl = `${EXPLORER}/${r.hash}`; result.helix.succeeded = true; console.log(`  [helix]   #${i}: ✅ (fresh nonce worked!)`);
    } catch (err: any) {
      a.errorMessage = err.message; const { code } = classifyError(err.message); a.errorType = code;
      if (code === 'nonce_conflict' && i < MAX_ATTEMPTS) { const fresh = await provider.getTransactionCount(signer.address, 'latest'); a.repairApplied = `refresh_nonce: ${nc} → ${fresh}`; result.helix.repairApplied = 'refresh_nonce'; nc = fresh; console.log(`  [helix]   #${i}: ❌ nonce_conflict → 🔧 refreshing ${staleNonce}→${fresh}`); }
      else console.log(`  [helix]   #${i}: ❌ ${code}`);
      await sleep(1000);
    }
    result.helix.attempts.push(a); result.helix.totalGasMON += a.gasUsedMON;
  }
  return result;
}

async function runScenarioD(provider: ethers.Provider, signer: ethers.Wallet): Promise<ScenarioResult> {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO D — High-Concurrency Burst (5 parallel txs)');
  console.log('═'.repeat(60));
  const result: ScenarioResult = { scenario: 'D_high_concurrency', description: 'Rapid parallel txs — Monad 10K TPS context', control: { attempts: [], succeeded: false, totalGasMON: 0 }, helix: { attempts: [], succeeded: false, totalGasMON: 0, repairApplied: null } };
  const validDl = Math.floor(Date.now() / 1000) + 600;
  const N = 5;

  console.log(`\n[control] Sending ${N} txs with sequential nonces...`);
  const baseNonce = await provider.getTransactionCount(signer.address, 'latest');
  const ctrlResults = await Promise.all(Array.from({ length: N }, async (_, i) => {
    const a = makeTxAttempt('control', 'D', i + 1, validDl, baseNonce + i);
    try { const r = await wrapMON(signer, provider, validDl, baseNonce + i); a.txHash = r.hash; a.success = true; a.onChain = true; a.gasUsedMON = r.gasUsedMON; a.explorerUrl = `${EXPLORER}/${r.hash}`; console.log(`  [control] tx${i + 1}: ✅ ${r.hash.slice(0, 16)}...`);
    } catch (err: any) { a.errorMessage = err.message; a.errorType = classifyError(err.message).code; console.log(`  [control] tx${i + 1}: ❌ ${a.errorType}`); }
    return a;
  }));
  result.control.attempts = ctrlResults; result.control.succeeded = ctrlResults.some(a => a.success); result.control.totalGasMON = ctrlResults.reduce((s, a) => s + a.gasUsedMON, 0);

  await sleep(3000);
  console.log(`\n[helix]   Sending ${N} txs with pre-sequenced nonces...`);
  const helixBase = await provider.getTransactionCount(signer.address, 'latest');
  result.helix.repairApplied = `pre_sequence_nonces: ${helixBase}..${helixBase + N - 1}`;
  const hlxResults = await Promise.all(Array.from({ length: N }, async (_, i) => {
    const nc = helixBase + i;
    const a = makeTxAttempt('helix', 'D', i + 1, validDl, nc);
    a.repairApplied = `pre_sequenced_nonce_${nc}`;
    try { const r = await wrapMON(signer, provider, validDl, nc); a.txHash = r.hash; a.success = true; a.onChain = true; a.gasUsedMON = r.gasUsedMON; a.explorerUrl = `${EXPLORER}/${r.hash}`; console.log(`  [helix]   tx${i + 1}: ✅ ${r.hash.slice(0, 16)}... (nonce=${nc})`);
    } catch (err: any) { a.errorMessage = err.message; a.errorType = classifyError(err.message).code; console.log(`  [helix]   tx${i + 1}: ❌ ${a.errorType}`); }
    return a;
  }));
  result.helix.attempts = hlxResults; result.helix.succeeded = hlxResults.every(a => a.success); result.helix.totalGasMON = hlxResults.reduce((s, a) => s + a.gasUsedMON, 0);
  return result;
}

function printSummary(results: ScenarioResult[]) {
  console.log('\n' + '═'.repeat(70));
  console.log('MONAD MAINNET A/B TEST — SUMMARY');
  console.log('Network: Monad Mainnet (Chain ID: 143) | MON→WMON wraps');
  console.log('═'.repeat(70));
  for (const r of results) {
    console.log(`\n${r.scenario}`);
    console.log(`  Control: ${r.control.succeeded ? '✅' : '❌'} in ${r.control.attempts.length} attempts`);
    console.log(`  Helix:   ${r.helix.succeeded ? '✅' : '❌'} in ${r.helix.attempts.length} attempts`);
    if (r.helix.repairApplied) console.log(`  Repair:  🔧 ${r.helix.repairApplied}`);
    const tx = r.helix.attempts.find(a => a.success);
    if (tx?.txHash) console.log(`  TX: ${EXPLORER}/${tx.txHash}`);
  }
  const totalTxs = results.reduce((s, r) => s + r.control.attempts.length + r.helix.attempts.length, 0);
  console.log(`\n${'─'.repeat(70)}\nTotal txs: ${totalTxs} | Helix: ${results.filter(r => r.helix.succeeded).length}/${results.length} | Control: ${results.filter(r => r.control.succeeded).length}/${results.length}`);
  console.log('═'.repeat(70));
}

async function main() {
  const pk = process.env.MONAD_PRIVATE_KEY || '';
  const key = pk.startsWith('0x') ? pk : `0x${pk}`;
  if (!key || key === '0x') throw new Error('Set MONAD_PRIVATE_KEY in .env');

  const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz', { chainId: 143, name: 'monad' });
  const signer = new ethers.Wallet(key, provider);
  const balance = await provider.getBalance(signer.address);
  const balMON = Number(balance) / 1e18;
  console.log(`Wallet:  ${signer.address}\nBalance: ${balMON.toFixed(4)} MON\nNetwork: Monad Mainnet (143)`);
  if (balMON < 0.1) throw new Error('Need >= 0.1 MON');

  if (process.argv.includes('--dry-run')) {
    console.log(`\n⚠️  DRY RUN\n  WMON: ${WMON_ADDRESS}\n  Wrap: ${ethers.formatEther(WRAP_AMOUNT)} MON/tx`);
    return;
  }

  const results: ScenarioResult[] = [];
  results.push(await runScenarioA(provider, signer)); await sleep(3000);
  results.push(await runScenarioB(provider, signer)); await sleep(3000);
  results.push(await runScenarioC(provider, signer)); await sleep(3000);
  results.push(await runScenarioD(provider, signer));
  printSummary(results);

  const outDir = path.join(import.meta.dirname || '.', '../../monad-ab-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `results-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ results, timestamp: new Date().toISOString(), network: 'monad-mainnet', chainId: 143, wallet: signer.address }, null, 2));
  console.log(`\nResults saved: ${outFile}`);
}

main().catch(console.error);
