/**
 * CDP Concurrency Test — 5 simultaneous txs from same account, 10 rounds
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { base } from 'viem/chains';

const RECIPIENT = process.env.RECIPIENT || '0xd296C79EF6D4a048c80293386A58fA15C6e658A9';
const AMOUNT = parseEther('0.00001');
const ROUNDS = 10;
const CONCURRENT = 5;

async function main() {
  const cdp = new CdpClient();
  let account;
  try { account = await cdp.evm.getAccount({ name: 'x402-v2-study' }); }
  catch { account = await cdp.evm.createAccount({ name: 'x402-v2-study' }); }
  const baseAccount = await account.useNetwork('base');

  const pub = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const bal = await pub.getBalance({ address: account.address as `0x${string}` });
  console.log(`Account: ${account.address}\nBalance: ${formatEther(bal)} ETH\n`);
  console.log(`${ROUNDS} rounds × ${CONCURRENT} concurrent txs = ${ROUNDS * CONCURRENT} total\n`);

  let totalOk = 0, totalFail = 0;
  const errors: Record<string, number> = {};

  for (let round = 1; round <= ROUNDS; round++) {
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, () =>
        baseAccount.sendTransaction({ transaction: { to: RECIPIENT as `0x${string}`, value: AMOUNT } })
      )
    );

    let ok = 0, fail = 0;
    const icons: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') { ok++; icons.push('✅'); }
      else {
        fail++;
        icons.push('❌');
        const msg = (r.reason?.message || '').slice(0, 80);
        const key = msg.includes('nonce') ? 'nonce' : msg.includes('429') ? 'rate_limit' : msg.includes('already known') ? 'already_known' : msg.slice(0, 40) || 'unknown';
        errors[key] = (errors[key] || 0) + 1;
      }
    }
    totalOk += ok; totalFail += fail;
    console.log(`  Round ${String(round).padStart(2)}: ${icons.join('')} → ${ok}/${CONCURRENT} success`);

    // Wait between rounds for nonce to settle
    if (round < ROUNDS) await new Promise(r => setTimeout(r, 5000));
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`SUMMARY: ${totalOk}/${totalOk + totalFail} success (${((totalOk / (totalOk + totalFail)) * 100).toFixed(1)}%)`);
  console.log(`Failure rate: ${((totalFail / (totalOk + totalFail)) * 100).toFixed(1)}%`);
  if (Object.keys(errors).length) {
    console.log(`\nError breakdown:`);
    for (const [k, v] of Object.entries(errors).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  }
  console.log('═'.repeat(50));
}

main().catch(console.error);
