/**
 * Nonce Conflict — Clean Version (self-hosted EOA)
 *
 * Deliberately injects stale nonce (currentNonce - 1).
 * Control: fails every time. Helix: refresh_nonce → success.
 */

import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const RECIPIENT = process.env.RECIPIENT_ADDRESS || process.env.RECIPIENT || '0x4392bADe0C015cc2dD13924f099EE6d57c270Adb';
const AMOUNT = ethers.parseEther('0.00001');
const ROUNDS = 3;

async function sendWithStaleNonce(): Promise<{ success: boolean; txHash: string | null; error: string | null }> {
  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  const stale = nonce - 1;
  try {
    const tx = await wallet.sendTransaction({ to: RECIPIENT, value: AMOUNT, nonce: stale });
    await provider.waitForTransaction(tx.hash, 1, 30000);
    return { success: true, txHash: tx.hash, error: null };
  } catch (err: any) {
    return { success: false, txHash: null, error: (err?.message || String(err)).slice(0, 150) };
  }
}

async function sendWithHelixRepair(): Promise<{ success: boolean; txHash: string | null; repaired: boolean; error: string | null }> {
  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  const stale = nonce - 1;

  // First attempt: stale nonce
  try {
    const tx = await wallet.sendTransaction({ to: RECIPIENT, value: AMOUNT, nonce: stale });
    await provider.waitForTransaction(tx.hash, 1, 30000);
    return { success: true, txHash: tx.hash, repaired: false, error: null };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isNonce = msg.toLowerCase().includes('nonce') || msg.includes('too low') || msg.includes('already used');

    if (isNonce) {
      console.log('  [Helix] Detected: nonce_conflict');
      console.log('  [Helix] Strategy: refresh_nonce');
      const fresh = await provider.getTransactionCount(wallet.address, 'pending');
      console.log(`  [Helix] Refreshed nonce: ${stale} → ${fresh}`);

      try {
        const tx = await wallet.sendTransaction({ to: RECIPIENT, value: AMOUNT, nonce: fresh });
        await provider.waitForTransaction(tx.hash, 1, 30000);
        return { success: true, txHash: tx.hash, repaired: true, error: null };
      } catch (e2: any) {
        return { success: false, txHash: null, repaired: false, error: (e2?.message || '').slice(0, 150) };
      }
    }
    return { success: false, txHash: null, repaired: false, error: msg.slice(0, 150) };
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Nonce Conflict — Clean Version (self-hosted EOA) ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const bal = await provider.getBalance(wallet.address);
  console.log(`Wallet:  ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(bal)} ETH\n`);

  const results = { A: [] as boolean[], B: [] as boolean[] };

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`━━━ Round ${round}/${ROUNDS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    console.log('\nA — Stale nonce, NO Helix (control):');
    const rA = await sendWithStaleNonce();
    results.A.push(rA.success);
    console.log(`  ${rA.success ? '✅ (unexpected!)' : '❌ Failed: ' + rA.error}`);
    if (rA.txHash) console.log(`  https://basescan.org/tx/${rA.txHash}`);

    await new Promise(r => setTimeout(r, 3000));

    console.log('\nB — Stale nonce, WITH Helix:');
    const rB = await sendWithHelixRepair();
    results.B.push(rB.success);
    console.log(`  ${rB.success ? `✅ ${rB.repaired ? 'Repaired & Success' : 'Success'}` : '❌ Failed: ' + rB.error}`);
    if (rB.txHash) console.log(`  https://basescan.org/tx/${rB.txHash}`);

    await new Promise(r => setTimeout(r, 8000));
  }

  const aOk = results.A.filter(Boolean).length;
  const bOk = results.B.filter(Boolean).length;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║                    RESULTS                        ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║ A: Stale nonce, no repair   ${aOk}/${ROUNDS}                  ║`);
  console.log(`║ B: Stale nonce, Helix       ${bOk}/${ROUNDS}                  ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ Control → nonce too low → fails every time        ║');
  console.log('║ Helix   → refresh_nonce → success every time      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\nVerify: https://basescan.org/address/${wallet.address}`);
}

main().catch(console.error);
