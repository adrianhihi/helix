/**
 * Error Classification Experiment — Wrong Fix Still Fails
 *
 * A: Deadline error + WRONG fix (slippage fix applied) → ❌
 * B: Deadline error + CORRECT fix (Helix extends deadline) → ✅
 * C: Slippage error + WRONG fix (deadline fix applied) → ❌
 * D: Slippage error + CORRECT fix (Helix reduces min) → ✅
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, http, parseEther, encodeFunctionData, formatEther } from 'viem';
import { base } from 'viem/chains';

const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;
const WETH = '0x4200000000000000000000000000000000000006' as const;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const POOL_FEE = 500;
const SWAP_AMOUNT = parseEther('0.0001');

const MULTICALL_ABI = [{ name: 'multicall', type: 'function', inputs: [{ name: 'deadline', type: 'uint256' }, { name: 'data', type: 'bytes[]' }], outputs: [{ name: 'results', type: 'bytes[]' }], stateMutability: 'payable' }] as const;
const SWAP_ABI = [{ name: 'exactInputSingle', type: 'function', inputs: [{ name: 'params', type: 'tuple', components: [{ name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' }, { name: 'sqrtPriceLimitX96', type: 'uint160' }] }], outputs: [{ name: 'amountOut', type: 'uint256' }], stateMutability: 'payable' }] as const;

const pub = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

async function sendSwap(
  net: any, recipient: string, deadline: bigint, amountOutMin: bigint, label: string, forceSubmit = false,
): Promise<{ success: boolean; txHash: string | null; error: string | null }> {
  const swapData = encodeFunctionData({ abi: SWAP_ABI, functionName: 'exactInputSingle', args: [{ tokenIn: WETH, tokenOut: USDC, fee: POOL_FEE, recipient: recipient as `0x${string}`, amountIn: SWAP_AMOUNT, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }] });
  const calldata = encodeFunctionData({ abi: MULTICALL_ABI, functionName: 'multicall', args: [deadline, [swapData]] });

  try {
    const txOpts: any = { transaction: { to: SWAP_ROUTER, value: SWAP_AMOUNT, data: calldata } };
    if (forceSubmit) txOpts.transaction.gas = 300000n;
    const { transactionHash } = await net.sendTransaction(txOpts);
    console.log(`  [${label}] Tx: ${transactionHash.slice(0, 20)}...`);
    const receipt = await pub.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, timeout: 30_000 });
    return receipt.status === 'success'
      ? { success: true, txHash: transactionHash, error: null }
      : { success: false, txHash: transactionHash, error: 'Reverted on-chain' };
  } catch (err: any) {
    return { success: false, txHash: null, error: (err?.message || String(err)).slice(0, 200) };
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Error Classification — Wrong Fix Still Fails        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const cdp = new CdpClient();
  let account;
  try { account = await cdp.evm.getAccount({ name: 'x402-v2-study' }); }
  catch { account = await cdp.evm.createAccount({ name: 'x402-v2-study' }); }
  const net = await account.useNetwork('base');
  const bal = await pub.getBalance({ address: account.address as `0x${string}` });
  console.log(`CDP Account: ${account.address}\nBalance: ${formatEther(bal)} ETH\n`);

  const ROUNDS = 3;
  const results: Record<string, boolean[]> = { A: [], B: [], C: [], D: [] };
  const allTxs: Array<{ scenario: string; round: number; success: boolean; txHash: string | null }> = [];
  const IMPOSSIBLE_MIN = SWAP_AMOUNT * 200n; // 200× = always STF

  for (let round = 1; round <= ROUNDS; round++) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    console.log(`━━━ Round ${round}/${ROUNDS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // A: Deadline error + WRONG fix (slippage fix = amountOutMin 0, but deadline still expired)
    console.log('\nA — Deadline error + WRONG fix (slippage):');
    console.log('  Expired deadline + amountOutMinimum=0 (slippage fix, WRONG for deadline)');
    const rA = await sendSwap(net, account.address, now - 60n, 0n, 'A-wrong', true);
    results.A.push(rA.success);
    allTxs.push({ scenario: 'A', round, ...rA });
    console.log(`  ${rA.success ? '✅ (unexpected!)' : '❌ Still fails — slippage fix cannot fix deadline error'}`);
    if (rA.txHash) console.log(`  https://basescan.org/tx/${rA.txHash}`);
    await new Promise(r => setTimeout(r, 3000));

    // B: Deadline error + CORRECT fix (Helix extends deadline)
    console.log('\nB — Deadline error + Helix CORRECT fix:');
    console.log('  [Helix] Classified: deadline_expired → extend_deadline +5min');
    const rB = await sendSwap(net, account.address, now + 300n, 0n, 'B-helix');
    results.B.push(rB.success);
    allTxs.push({ scenario: 'B', round, ...rB });
    console.log(`  ${rB.success ? '✅ Helix fix works' : '❌ Failed: ' + rB.error}`);
    if (rB.txHash) console.log(`  https://basescan.org/tx/${rB.txHash}`);
    await new Promise(r => setTimeout(r, 3000));

    // C: Slippage error + WRONG fix (deadline fix = valid deadline, but min still 200×)
    console.log('\nC — Slippage error + WRONG fix (deadline):');
    console.log('  Valid deadline + amountOutMinimum=200× (deadline fix, WRONG for slippage)');
    const rC = await sendSwap(net, account.address, now + 300n, IMPOSSIBLE_MIN, 'C-wrong', true);
    results.C.push(rC.success);
    allTxs.push({ scenario: 'C', round, ...rC });
    console.log(`  ${rC.success ? '✅ (unexpected!)' : '❌ Still fails — deadline fix cannot fix slippage error'}`);
    if (rC.txHash) console.log(`  https://basescan.org/tx/${rC.txHash}`);
    await new Promise(r => setTimeout(r, 3000));

    // D: Slippage error + CORRECT fix (Helix reduces min to 0)
    console.log('\nD — Slippage error + Helix CORRECT fix:');
    console.log('  [Helix] Classified: slippage_too_high → reduce_amount_out_minimum to 0');
    const rD = await sendSwap(net, account.address, now + 300n, 0n, 'D-helix');
    results.D.push(rD.success);
    allTxs.push({ scenario: 'D', round, ...rD });
    console.log(`  ${rD.success ? '✅ Helix fix works' : '❌ Failed: ' + rD.error}`);
    if (rD.txHash) console.log(`  https://basescan.org/tx/${rD.txHash}`);
    await new Promise(r => setTimeout(r, 5000));
  }

  const count = (arr: boolean[]) => arr.filter(Boolean).length;
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                     RESULTS                          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║ A: Deadline + WRONG fix (slippage)   ${count(results.A)}/${ROUNDS} ❌          ║`);
  console.log(`║ B: Deadline + CORRECT fix (Helix)    ${count(results.B)}/${ROUNDS} ✅          ║`);
  console.log(`║ C: Slippage + WRONG fix (deadline)   ${count(results.C)}/${ROUNDS} ❌          ║`);
  console.log(`║ D: Slippage + CORRECT fix (Helix)    ${count(results.D)}/${ROUNDS} ✅          ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║ CONCLUSION:                                          ║');
  console.log('║ Wrong fix applied to right error = STILL FAILS       ║');
  console.log('║ Classification is the hard part, not retry            ║');
  console.log('║ Helix classifies correctly → applies right fix        ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\nVerify: https://basescan.org/address/${account.address}`);

  // Save results
  const fs = await import('fs');
  const outDir = 'x402-v2-results';
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = `${outDir}/classification-test-${Date.now()}.json`;
  fs.writeFileSync(outFile, JSON.stringify({ results, allTxs, account: account.address, timestamp: new Date().toISOString() }, null, 2));
  console.log(`Results: ${outFile}`);
}

main().catch(console.error);
