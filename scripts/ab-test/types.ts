export interface TransactionRecord {
  id: string;
  group: 'control' | 'helix';
  timestamp: string;
  txHash: string | null;
  blockNumber: number | null;
  from: string;
  to: string;
  value: string;
  injectedFailure: string;
  success: boolean;
  errorMessage: string | null;
  errorType: string | null;
  repairStrategy: string | null;
  repairAttempts: number;
  repairedTxHash: string | null;
  gasUsed: number | null;
  gasPrice: string | null;
  gasCostETH: string | null;
  gasCostUSD: number | null;
  submitLatencyMs: number;
  confirmLatencyMs: number;
  totalLatencyMs: number;
  llmCalls: number;
  llmTokensUsed: number;
  llmCostUSD: number;
}

export interface GroupSummary {
  totalTransactions: number;
  successful: number;
  failed: number;
  successRate: number;
  errorBreakdown: Record<string, number>;
  totalGasUsedETH: string;
  totalGasCostUSD: number;
  totalLLMCostUSD: number;
  totalCostUSD: number;
  avgCostPerTxUSD: number;
  avgSubmitLatencyMs: number;
  avgConfirmLatencyMs: number;
  avgTotalLatencyMs: number;
  p95LatencyMs: number;
  repairsAttempted?: number;
  repairsSuccessful?: number;
  repairSuccessRate?: number;
}

export interface TestSummary {
  testId: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  network: string;
  chainId: number;
  control: GroupSummary;
  helix: GroupSummary;
  improvement: {
    successRateDelta: number;
    gasSavedUSD: number;
    llmCostSavedUSD: number;
    avgLatencyReductionMs: number;
    revertsPrevented: number;
  };
  firstTxHash: string;
  lastTxHash: string;
  blockRange: [number, number];
  verificationUrl: string;
}
