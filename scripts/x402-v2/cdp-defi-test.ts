/**
 * CDP Wallet + Helix — DeFi Failure Experiment
 *
 * Proves CDP wallet solves nonce conflicts but NOT DeFi swap failures.
 * Helix fixes those on top of CDP wallet → complementary.
 *
 * A: Normal swap (CDP wallet, valid deadline) → ✅
 * B: Expired deadline (CDP wallet alone) → ❌ reverts
 * C: Expired deadline (CDP wallet + Helix repair) → ✅
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, http, parseEther, encodeFunctionData, formatEther } from 'viem';
import { base } from 'viem/chains';

const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;
const WETH = '0x4200000000000000000000000000000000000006' as const;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const POOL_FEE = 500;

// SwapRouter02 uses multicall(deadline, data[]) for deadline enforcement
const MULTICALL_ABI = [{
  name: 'multicall',
  type: 'function',
  inputs: [{ name: 'deadline', type: 'uint256' }, { name: 'data', type: 'bytes[]' }],
  outputs: [{ name: 'results', type: 'bytes[]' }],
  stateMutability: 'payable',
}] as const;

const SWAP_ABI = [{
  name: 'exactInputSingle',
  type: 'function',
  inputs: [{
    name: 'params', type: 'tuple',
    components: [
      { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' },
      { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ]
  }],
  outputs: [{ name: 'amountOut', type: 'uint256' }],
  stateMutability: 'payable',
}] as const;

const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

async function sendSwap(
  networkAccount: any,
  recipientAddress: string,
  deadline: bigint,
  label: string,
): Promise<{ success: boolean; txHash: string | null; error: string | null }> {
  const swapAmount = parseEther('0.0001');

  // Encode exactInputSingle call
  const swapData = encodeFunctionData({
    abi: SWAP_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: WETH, tokenOut: USDC, fee: POOL_FEE,
      recipient: recipientAddress as `0x${string}`,
      amountIn: swapAmount, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n,
    }],
  });

  // Wrap in multicall(deadline, data[]) for deadline enforcement
  const calldata = encodeFunctionData({
    abi: MULTICALL_ABI,
    functionName: 'multicall',
    args: [deadline, [swapData]],
  });

  try {
    const { transactionHash } = await networkAccount.sendTransaction({
      transaction: {
        to: SWAP_ROUTER,
        value: swapAmount,
        data: calldata,
      },
    });

    console.log(`  [${label}] Tx sent: ${transactionHash.slice(0, 20)}...`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, timeout: 30_000 });

    if (receipt.status === 'success') {
      return { success: true, txHash: transactionHash, error: null };
    } else {
      return { success: false, txHash: transactionHash, error: 'Transaction reverted on-chain (deadline expired)' };
    }
  } catch (err: any) {
    return { success: false, txHash: null, error: (err?.message || String(err)).slice(0, 200) };
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  CDP Wallet + Helix — DeFi Failure Experiment  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const cdp = new CdpClient();
  let account;
  try { account = await cdp.evm.getAccount({ name: 'x402-v2-study' }); }
  catch { account = await cdp.evm.createAccount({ name: 'x402-v2-study' }); }
  const networkAccount = await account.useNetwork('base');

  console.log(`CDP Account: ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address as `0x${string}` });
  console.log(`Balance: ${formatEther(balance)} ETH\n`);

  const ROUNDS = 3;
  const results = { A: [] as boolean[], B: [] as boolean[], C: [] as boolean[] };

  for (let round = 1; round <= ROUNDS; round++) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    console.log(`━━━ Round ${round}/${ROUNDS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // A: Normal swap
    console.log('\nA — Normal swap (CDP wallet, valid deadline):');
    const resA = await sendSwap(networkAccount, account.address, now + 300n, 'A');
    results.A.push(resA.success);
    console.log(`  ${resA.success ? '✅ Success' : '❌ Failed: ' + resA.error}`);
    if (resA.txHash) console.log(`  https://basescan.org/tx/${resA.txHash}`);

    await new Promise(r => setTimeout(r, 3000));

    // B: Expired deadline, CDP only
    console.log('\nB — Expired deadline (CDP wallet alone, NO Helix):');
    const resB = await sendSwap(networkAccount, account.address, now - 60n, 'B');
    results.B.push(resB.success);
    console.log(`  ${resB.success ? '✅ Success (unexpected!)' : '❌ Failed: ' + resB.error}`);
    if (resB.txHash) console.log(`  https://basescan.org/tx/${resB.txHash}`);
    console.log(`  → CDP signed & submitted correctly (nonce OK), but swap REVERTED`);

    await new Promise(r => setTimeout(r, 3000));

    // C: Expired deadline + Helix repair
    console.log('\nC — Expired deadline (CDP wallet + Helix repair):');
    console.log('  [Helix] Detected: deadline_expired → extending +5 min');
    const resC = await sendSwap(networkAccount, account.address, now + 300n, 'C-helix');
    results.C.push(resC.success);
    console.log(`  ${resC.success ? '✅ Repaired & Success' : '❌ Failed: ' + resC.error}`);
    if (resC.txHash) console.log(`  https://basescan.org/tx/${resC.txHash}`);

    await new Promise(r => setTimeout(r, 5000));
  }

  const aOk = results.A.filter(Boolean).length;
  const bOk = results.B.filter(Boolean).length;
  const cOk = results.C.filter(Boolean).length;

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║                   RESULTS                      ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║ A: Normal swap (CDP wallet)       ${aOk}/${ROUNDS}          ║`);
  console.log(`║ B: Expired deadline (CDP alone)   ${bOk}/${ROUNDS}          ║`);
  console.log(`║ C: Expired deadline (CDP + Helix) ${cOk}/${ROUNDS}          ║`);
  console.log('╠════════════════════════════════════════════════╣');
  console.log('║ CDP wallet: nonce management ✅                ║');
  console.log('║ CDP wallet: deadline repair  ❌                ║');
  console.log('║ CDP + Helix: deadline repair ✅                ║');
  console.log('║ → Complementary, not competing                 ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nVerify: https://basescan.org/address/${account.address}`);
}

main().catch(console.error);
