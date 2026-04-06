export interface TxAttempt {
  group: 'control' | 'helix';
  scenario: string;
  attempt: number;
  txHash: string | null;
  success: boolean;
  onChain: boolean;
  errorMessage: string | null;
  errorType: string | null;
  repairApplied: string | null;
  gasUsedMON: number;
  deadline: number;
  nonce: number | null;
  timestamp: string;
  explorerUrl: string | null;
}

export interface ScenarioResult {
  scenario: string;
  description: string;
  control: { attempts: TxAttempt[]; succeeded: boolean; totalGasMON: number };
  helix:   { attempts: TxAttempt[]; succeeded: boolean; totalGasMON: number; repairApplied: string | null };
}
