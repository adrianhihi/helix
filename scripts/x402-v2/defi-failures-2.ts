/**
 * DeFi Failure Experiments 2 — Gas Too Low + Insufficient Balance
 *
 * A: Gas too low (gasLimit=21000 for swap) → Helix bumps → success
 * B: Insufficient balance for gas → Helix reduces amount → success
 *
 * (ERC-20 allowance skipped — CDP wallet has no USDC)
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, http, parseEther, formatEther, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;
const WETH = '0x4200000000000000000000000000000000000006' as const;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const POOL_FEE = 500;
const ROUNDS = 3;
const RECIPIENT = '0xd296C79EF6D4a048c80293386A58fA15C6e658A9' as const;

const SWAP_ABI = [{ name: 'exactInputSingle', type: 'function', inputs: [{ name: 'params', type: 'tuple', components: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' }, { name: 'sqrtPriceLimitX96', type: 'uint160' }] }], outputs: [{ name: 'amountOut', type: 'uint256' }], stateMutability: 'payable' }] as const;

const pub = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  DeFi Failure Experiments 2 — Gas + Balance         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: 'x402-v2-study' });
  const net = await account.useNetwork('base');
  const addr = account.address as `0x${string}`;
  const bal = await pub.getBalance({ address: addr });
  console.log(`CDP Wallet: ${addr}\nBalance: ${formatEther(bal)} ETH\n`);

  // ════════════ EXPERIMENT A: Gas Too Low ════════════
  console.log('═'.repeat(60));
  console.log('EXPERIMENT A — Gas Too Low (gasLimit=21,000 for swap)');
  console.log('═'.repeat(60));

  const rA = { ctrl: [] as boolean[], helix: [] as boolean[] };
  const swapAmount = parseEther('0.0001');

  for (let r = 1; r <= ROUNDS; r++) {
    const calldata = encodeFunctionData({ abi: SWAP_ABI, functionName: 'exactInputSingle', args: [{ tokenIn: WETH, tokenOut: USDC, fee: POOL_FEE, recipient: addr, amountIn: swapAmount, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] });
    console.log(`\n─── Round ${r} ───`);

    // Control: gasLimit=21000 (way too low)
    console.log('Control (gasLimit=21000):');
    try {
      const { transactionHash } = await net.sendTransaction({ transaction: { to: SWAP_ROUTER, value: swapAmount, data: calldata, gas: 21000n } });
      const receipt = await pub.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, timeout: 30000 });
      rA.ctrl.push(receipt.status === 'success');
      console.log(`  ${receipt.status === 'success' ? '✅' : '❌ Reverted (out of gas)'} — ${transactionHash.slice(0, 20)}...`);
      console.log(`  https://basescan.org/tx/${transactionHash}`);
    } catch (e: any) {
      rA.ctrl.push(false);
      console.log(`  ❌ Rejected: ${(e?.message || '').slice(0, 80)}`);
    }

    await sleep(3000);

    // Helix: detect out_of_gas → bump to 300000
    console.log('Helix (detect gas error → bump_gas_limit):');
    try {
      // Attempt 1: low gas
      const { transactionHash: h1 } = await net.sendTransaction({ transaction: { to: SWAP_ROUTER, value: swapAmount, data: calldata, gas: 21000n } });
      const r1 = await pub.waitForTransactionReceipt({ hash: h1 as `0x${string}`, timeout: 30000 });
      if (r1.status === 'reverted') {
        console.log(`  [Helix] Detected: out_of_gas → bump_gas_limit: 21000 → 300000`);
        // Attempt 2: proper gas
        const { transactionHash: h2 } = await net.sendTransaction({ transaction: { to: SWAP_ROUTER, value: swapAmount, data: calldata, gas: 300000n } });
        const r2 = await pub.waitForTransactionReceipt({ hash: h2 as `0x${string}`, timeout: 30000 });
        rA.helix.push(r2.status === 'success');
        console.log(`  ${r2.status === 'success' ? '✅ Repaired' : '❌ Still failed'}`);
        if (r2.status === 'success') console.log(`  https://basescan.org/tx/${h2}`);
      } else { rA.helix.push(true); console.log(`  ✅ First attempt succeeded`); }
    } catch (e: any) {
      // If RPC rejects low gas entirely, skip to correct gas directly
      console.log(`  [Helix] RPC rejected low gas → bump_gas_limit to 300000`);
      try {
        const { transactionHash: h2 } = await net.sendTransaction({ transaction: { to: SWAP_ROUTER, value: swapAmount, data: calldata, gas: 300000n } });
        const r2 = await pub.waitForTransactionReceipt({ hash: h2 as `0x${string}`, timeout: 30000 });
        rA.helix.push(r2.status === 'success');
        console.log(`  ${r2.status === 'success' ? '✅ Repaired' : '❌'}`);
        if (r2.status === 'success') console.log(`  https://basescan.org/tx/${h2}`);
      } catch (e2: any) { rA.helix.push(false); console.log(`  ❌ ${(e2?.message || '').slice(0, 80)}`); }
    }

    await sleep(5000);
  }

  console.log(`\nExp A: Ctrl ${rA.ctrl.filter(Boolean).length}/${ROUNDS} | Helix ${rA.helix.filter(Boolean).length}/${ROUNDS}`);

  // ════════════ EXPERIMENT B: Insufficient Balance ════════════
  console.log('\n' + '═'.repeat(60));
  console.log('EXPERIMENT B — Insufficient Balance for Gas');
  console.log('═'.repeat(60));

  const rB = { ctrl: [] as boolean[], helix: [] as boolean[] };

  for (let r = 1; r <= ROUNDS; r++) {
    console.log(`\n─── Round ${r} ───`);
    const currentBal = await pub.getBalance({ address: addr });
    const gasPrice = await pub.getGasPrice();
    const gasLimit = 21000n;

    // Control: send entire balance (no gas room)
    console.log(`Control (send entire balance ${formatEther(currentBal)} ETH):`);
    try {
      const { transactionHash } = await net.sendTransaction({ transaction: { to: RECIPIENT, value: currentBal, gas: gasLimit } });
      const receipt = await pub.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, timeout: 30000 });
      rB.ctrl.push(receipt.status === 'success');
      console.log(`  ${receipt.status === 'success' ? '✅' : '❌ Reverted'}`);
    } catch (e: any) {
      rB.ctrl.push(false);
      console.log(`  ❌ Rejected: ${(e?.message || '').slice(0, 80)}`);
    }

    await sleep(3000);

    // Helix: detect insufficient_funds → reduce amount
    console.log('Helix (detect insufficient_funds → reduce_amount):');
    try {
      await net.sendTransaction({ transaction: { to: RECIPIENT, value: currentBal, gas: gasLimit } });
      rB.helix.push(true);
      console.log('  ✅ First attempt succeeded (unexpected)');
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('underpriced')) {
        const freshBal = await pub.getBalance({ address: addr });
        const buffer = gasLimit * gasPrice * 3n; // 3× gas cost buffer
        const safeAmount = freshBal > buffer ? freshBal - buffer : 0n;
        console.log(`  [Helix] Detected: insufficient_funds → reduce_amount`);
        console.log(`  [Helix] ${formatEther(currentBal)} → ${formatEther(safeAmount)} ETH`);
        if (safeAmount > 0n) {
          try {
            const { transactionHash } = await net.sendTransaction({ transaction: { to: RECIPIENT, value: safeAmount, gas: gasLimit } });
            const receipt = await pub.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, timeout: 30000 });
            rB.helix.push(receipt.status === 'success');
            console.log(`  ${receipt.status === 'success' ? '✅ Repaired' : '❌'}`);
            if (receipt.status === 'success') console.log(`  https://basescan.org/tx/${transactionHash}`);
          } catch (e2: any) { rB.helix.push(false); console.log(`  ❌ ${(e2?.message || '').slice(0, 80)}`); }
        } else { rB.helix.push(false); console.log('  ❌ Balance too low even with reduction'); }
      } else { rB.helix.push(false); console.log(`  ❌ Unexpected: ${msg.slice(0, 80)}`); }
    }

    await sleep(5000);
  }

  console.log(`\nExp B: Ctrl ${rB.ctrl.filter(Boolean).length}/${ROUNDS} | Helix ${rB.helix.filter(Boolean).length}/${ROUNDS}`);

  // ════════════ SUMMARY ════════════
  console.log('\n╔' + '═'.repeat(56) + '╗');
  console.log('║                  FINAL SUMMARY                      ║');
  console.log('╠' + '═'.repeat(56) + '╣');
  console.log(`║ A: Gas too low    Ctrl ${rA.ctrl.filter(Boolean).length}/3  Helix ${rA.helix.filter(Boolean).length}/3              ║`);
  console.log(`║ B: No gas buffer  Ctrl ${rB.ctrl.filter(Boolean).length}/3  Helix ${rB.helix.filter(Boolean).length}/3              ║`);
  console.log('╠' + '═'.repeat(56) + '╣');
  console.log(`║ CDP Wallet: ${addr}  ║`);
  console.log('╚' + '═'.repeat(56) + '╝');
}

main().catch(console.error);
