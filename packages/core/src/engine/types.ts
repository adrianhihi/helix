// ── Error Codes ──────────────────────────────────────────────────

export type ErrorCode =
  | 'payment-required'
  | 'payment-insufficient'
  | 'payment-expired'
  | 'verification-failed'
  | 'method-unsupported'
  | 'malformed-credential'
  | 'invalid-challenge'
  | 'tx-reverted'
  | 'swap-reverted'
  | 'token-uninitialized'
  | 'tip-403'
  | 'policy-violation'
  | 'cascade-failure'
  | 'offramp-failed'
  | 'rate-limited'
  | 'server-error'
  | 'timeout'
  | 'unknown';

// ── Failure Categories ──────────────────────────────────────────

export type FailureCategory =
  | 'balance'
  | 'session'
  | 'currency'
  | 'signature'
  | 'batch'
  | 'service'
  | 'dex'
  | 'compliance'
  | 'cascade'
  | 'offramp'
  | 'network'
  | 'policy'
  | 'auth'
  | 'unknown';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type Platform = 'tempo' | 'privy' | 'coinbase' | 'stripe' | 'generic' | 'unknown';

// ── Execution Mode ──────────────────────────────────────────────

export type HelixMode = 'observe' | 'auto' | 'full';

// ── PCEC Types ──────────────────────────────────────────────────

export interface FailureClassification {
  code: ErrorCode;
  category: FailureCategory;
  severity: Severity;
  platform: Platform;
  details: string;
  timestamp: number;
  rootCauseHint?: string;
  actualBalance?: number;
  requiredAmount?: number;
  chainId?: number;
  walletAddress?: string;
}

export interface RepairCandidate {
  id: string;
  strategy: string;
  description: string;
  estimatedCostUsd: number;
  estimatedSpeedMs: number;
  requirements: string[];
  score: number;
  successProbability: number;
  platform: Platform;
}

export interface GeneCapsule {
  id?: number;
  failureCode: ErrorCode;
  category: FailureCategory;
  strategy: string;
  params: Record<string, unknown>;
  successCount: number;
  avgRepairMs: number;
  platforms: Platform[];
  qValue: number;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastFailedAt?: number;
  createdAt?: string;
  lastUsedAt?: string;
  // OPT-4: ReasoningBank
  reasoning?: string;
  failureAnalysis?: string[];
  successContext?: { chains?: string[]; walletTypes?: string[]; platforms?: string[] };
  failureContext?: { chains?: string[]; walletTypes?: string[]; note?: string };
}

export interface RepairResult {
  success: boolean;
  failure: FailureClassification;
  candidates: RepairCandidate[];
  winner: RepairCandidate | null;
  gene: GeneCapsule | null;
  immune: boolean;
  totalMs: number;
  revenueProtected: number;
  mode: HelixMode;
  explanation: string;
  verified: boolean;
  skippedStrategies?: string[];
  costEstimate: number;
  // OPT-10: Failure Attribution
  attribution?: { agentId: string; stepId?: string; workflow?: string; timestamp: number };
  /** Overrides from strategy execution — used by wrap() auto-detect for retry */
  commitOverrides?: Record<string, unknown>;
}

// ── Platform Adapter Interface ──────────────────────────────────

export interface PlatformAdapter {
  name: Platform;
  perceive(error: Error, context?: Record<string, unknown>): FailureClassification | null;
  construct(failure: FailureClassification): RepairCandidate[];
}

// ── Provider Config ─────────────────────────────────────────────

export interface DexConfig {
  routerAddress: `0x${string}`;
  quoterAddress?: `0x${string}`;
  wethAddress: `0x${string}`;
  defaultTokens: { usdc?: `0x${string}`; usdt?: `0x${string}`; dai?: `0x${string}` };
  defaultSlippage: number;
  defaultDeadlineSeconds: number;
}

export interface HelixProviderConfig {
  rpcUrl?: string;
  privateKey?: string;
  privy?: { appId: string; appSecret: string; walletId?: string };
  coinbase?: { apiKeyName: string; apiKeyPrivateKey: string };
  dex?: DexConfig;
}

// ── SSE Event Types ─────────────────────────────────────────────

export type SseEventType =
  | 'perceive'
  | 'construct'
  | 'evaluate'
  | 'commit'
  | 'verify'
  | 'gene'
  | 'immune'
  | 'error'
  | 'stats'
  | 'retry';

export interface SseEvent {
  type: SseEventType;
  agentId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ── Config ──────────────────────────────────────────────────────

export interface HelixConfig {
  projectName: string;
  walletAddress: string;
  stablecoins: string[];
  monthlyBudget: number;
  maxRetries: number;
  timeoutMs: number;
  dashboardPort: number;
  verbose: boolean;
  geneMapPath: string;
}

export interface WrapOptions {
  agentId?: string;
  maxRetries?: number;
  verbose?: boolean;
  geneMapPath?: string;
  platforms?: string[];
  config?: Partial<HelixConfig>;
  mode?: HelixMode;
  enabled?: boolean | (() => boolean);
  maxRepairCostUsd?: number;
  maxSlippage?: number;
  approvedTokens?: string[];
  allowCategories?: string[];
  blockStrategies?: string[];
  provider?: HelixProviderConfig;
  onRepair?: (result: RepairResult) => void;
  onFailure?: (result: RepairResult) => void;
  onHelixError?: (error: Error) => void;
  onSystematic?: (warning: string, failure: FailureClassification) => void;
  /** Apply repair overrides to function args for retry. Called when a strategy produces overrides (e.g. corrected nonce). */
  parameterModifier?: (args: unknown[], overrides: Record<string, unknown>, strategy: string) => unknown[];
  context?: Record<string, unknown>;
}

// ── Revenue estimates per category ──────────────────────────────

export const REVENUE_AT_RISK: Record<string, number> = {
  balance: 150, session: 50, currency: 200, signature: 100,
  batch: 500, service: 300, dex: 175, compliance: 250,
  cascade: 1000, offramp: 400, network: 100, policy: 200,
  auth: 50, unknown: 50,
};

// ── Default Config ──────────────────────────────────────────────

export const DEFAULT_CONFIG: HelixConfig = {
  projectName: 'helix-agent',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
  stablecoins: ['USDC', 'USDT', 'DAI'],
  monthlyBudget: 10000,
  maxRetries: 3,
  timeoutMs: 30000,
  dashboardPort: 7842,
  verbose: true,
  geneMapPath: './helix-genes.db',
};
