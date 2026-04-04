export const CONFIG = {
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  chainId: 8453,
  testDurationMs: 12 * 60 * 60 * 1000,
  intervalMs: 30_000,
  transferAmountETH: '0.000001',
  failureInjection: {
    lowGas: 0.08,
    wrongNonce: 0.06,
    rapidFire: 0.05,
    insufficientBalance: 0.03,
    normal: 0.78,
  },
  outputDir: './ab-test-results-v2',
  logFile: './ab-test-results-v2/transactions.jsonl',
  reportFile: './ab-test-results-v2/report.json',
  summaryFile: './ab-test-results-v2/summary.md',
};
