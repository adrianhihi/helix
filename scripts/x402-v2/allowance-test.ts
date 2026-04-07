/**
 * ERC-20 Allowance Missing — Helix Two-Step Repair
 *
 * A: Control (no allowance) → swap reverts on-chain
 * B: Helix (detect → approve → retry swap) → success
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, http, parseUnits, encodeFunctionData, maxUint256, formatEther } from 'viem';
import { base } from 'viem/chains';

const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;
const WETH = '0x4200000000000000000000000000000000000006' as const;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const POOL_FEE = 500;
const USDC_AMOUNT = parseUnits('0.1', 6); // 0.1 USDC per swap
const ROUNDS = 3;

const SWAP_ABI = [{ name: 'exactInputSingle', type: 'function', inputs: [{ name: 'params', type: 'tuple', components: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' }, { name: 'sqrtPriceLimitX96', type: 'uint160' }] }], outputs: [{ name: 'amountOut', type: 'uint256' }], stateMutability: 'payable' }] as const;
const ERC20_ABI = [
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const;

const pub = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function revokeAllowance(net: any, addr: `0x${string}`) {
  const current = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'allowance', args: [addr, SWAP_ROUTER] });
  if (current > 0n) {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [SWAP_ROUTER, 0n] });
    const { transactionHash } = await net.sendTransaction({ transaction: { to: USDC, data } });
    await pub.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, timeout: 30000 });
    console.log(`  Allowance revoked: ${transactionHash.slice(0, 16)}...`);
  }
}

function buildSwapCalldata(recipient: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: SWAP_ABI, functionName: 'exactInputSingle',
    args: [{ tokenIn: USDC, tokenOut: WETH, fee: POOL_FEE, recipient, amountIn: USDC_AMOUNT, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }],
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  ERC-20 Allowance Missing — Helix Two-Step Repair    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: 'x402-v2-study' });
  const net = await account.useNetwork('base');
  const addr = account.address as `0x${string}`;

  const usdcBal = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] });
  const ethBal = await pub.getBalance({ address: addr });
  console.log(`CDP Wallet: ${addr}`);
  console.log(`USDC: ${Number(usdcBal) / 1e6} | ETH: ${formatEther(ethBal)}\n`);

  if (usdcBal < USDC_AMOUNT * BigInt(ROUNDS * 2)) {
    console.error(`Need at least ${Number(USDC_AMOUNT * BigInt(ROUNDS * 2)) / 1e6} USDC`);
    process.exit(1);
  }

  const results = { ctrl: [] as boolean[], helix: [] as boolean[] };
  const allTxs: string[] = [];

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`━━━ Round ${round}/${ROUNDS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    const swapData = buildSwapCalldata(addr);

    // ── Scenario A: Control (no allowance) ──
    console.log('\nA — Control (no allowance, force on-chain revert):');
    await revokeAllowance(net, addr);
    try {
      const { transactionHash } = await net.sendTransaction({ transaction: { to: SWAP_ROUTER, data: swapData, gas: 300000n } });
      allTxs.push(transactionHash);
      const receipt = await pub.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, timeout: 30000 });
      results.ctrl.push(receipt.status === 'success');
      console.log(`  ${receipt.status === 'success' ? '✅ (unexpected!)' : '❌ Reverted (no allowance)'}`);
      console.log(`  https://basescan.org/tx/${transactionHash}`);
    } catch (e: any) {
      results.ctrl.push(false);
      console.log(`  ❌ Rejected: ${(e?.message || '').slice(0, 100)}`);
    }

    await sleep(4000);

    // ── Scenario B: Helix (detect → approve → retry) ──
    console.log('\nB — Helix (detect insufficient_allowance → approve → retry):');
    await revokeAllowance(net, addr);

    // Attempt 1: swap without allowance → revert
    let attempt1Reverted = false;
    try {
      const { transactionHash: h1 } = await net.sendTransaction({ transaction: { to: SWAP_ROUTER, data: swapData, gas: 300000n } });
      allTxs.push(h1);
      const r1 = await pub.waitForTransactionReceipt({ hash: h1 as `0x${string}`, timeout: 30000 });
      if (r1.status === 'reverted') {
        attempt1Reverted = true;
        console.log(`  Attempt 1: ❌ Reverted (no allowance) — ${h1.slice(0, 16)}...`);
        console.log(`  https://basescan.org/tx/${h1}`);
      } else {
        results.helix.push(true);
        console.log(`  Attempt 1: ✅ (unexpected success)`);
        await sleep(5000);
        continue;
      }
    } catch (e: any) {
      attempt1Reverted = true;
      console.log(`  Attempt 1: ❌ Rejected: ${(e?.message || '').slice(0, 80)}`);
    }

    if (attempt1Reverted) {
      // Step 1: Helix sends approve
      console.log('  [Helix] Detected: insufficient_allowance');
      console.log('  [Helix] Step 1: approve(SwapRouter, MaxUint256)');
      const approveData = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [SWAP_ROUTER, maxUint256] });
      try {
        const { transactionHash: ah } = await net.sendTransaction({ transaction: { to: USDC, data: approveData } });
        allTxs.push(ah);
        await pub.waitForTransactionReceipt({ hash: ah as `0x${string}`, timeout: 30000 });
        console.log(`  [Helix] Approved ✅ — ${ah.slice(0, 16)}...`);
        console.log(`  https://basescan.org/tx/${ah}`);

        await sleep(2000);

        // Step 2: Retry swap
        console.log('  [Helix] Step 2: retry swap');
        const { transactionHash: h2 } = await net.sendTransaction({ transaction: { to: SWAP_ROUTER, data: swapData, gas: 300000n } });
        allTxs.push(h2);
        const r2 = await pub.waitForTransactionReceipt({ hash: h2 as `0x${string}`, timeout: 30000 });
        results.helix.push(r2.status === 'success');
        console.log(`  Attempt 2: ${r2.status === 'success' ? '✅ Repaired & Success' : '❌ Still failed'}`);
        console.log(`  https://basescan.org/tx/${h2}`);
      } catch (e: any) {
        results.helix.push(false);
        console.log(`  ❌ Approve/retry failed: ${(e?.message || '').slice(0, 80)}`);
      }
    }

    await sleep(5000);
  }

  const aOk = results.ctrl.filter(Boolean).length;
  const bOk = results.helix.filter(Boolean).length;

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                     RESULTS                          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║ A: No allowance (control)    ${aOk}/${ROUNDS}                    ║`);
  console.log(`║ B: Helix approve+retry       ${bOk}/${ROUNDS}                    ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║ Helix two-step repair:                                ║');
  console.log('║   1. detect insufficient_allowance                    ║');
  console.log('║   2. approve(router, MaxUint256)                      ║');
  console.log('║   3. retry swap → success                             ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  console.log(`\nAll tx hashes (${allTxs.length} total):`);
  allTxs.forEach((h, i) => console.log(`  ${i + 1}. https://basescan.org/tx/${h}`));
  console.log(`\nVerify: https://basescan.org/address/${addr}`);
}

main().catch(console.error);
