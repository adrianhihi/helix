// ── Error Codes ──────────────────────────────────────────────────
// Platform-agnostic error codes. Each platform's perceive() maps
// platform-specific errors to these universal codes.

export type ErrorCode =
  // MPP/Payment protocol
  | 'payment-required'
  | 'payment-insufficient'
  | 'payment-expired'
  | 'verification-failed'
  | 'method-unsupported'
  | 'malformed-credential'
  | 'invalid-challenge'
  // Chain/transaction
  | 'tx-reverted'
  | 'swap-reverted'
  | 'token-uninitialized'
  // Compliance
  | 'tip-403'
  | 'policy-violation'
  // Complex
  | 'cascade-failure'
  | 'offramp-failed'
  // Generic HTTP
  | 'rate-limited'
  | 'server-error'
  | 'timeout'
  // Unknown
  | 'unknown';

// ── Failure Categories ──────────────────────────────────────────
// These are the SAME across all platforms. Gene Map stores by category.
// This is what enables cross-platform immunity.

export type FailureCategory =
  | 'balance'
  | 'session'
  | 'currency'
  | 'signature'    // nonce, key rotation, signing failures
  | 'batch'
  | 'service'      // downstream service errors
  | 'dex'          // swap/exchange failures
  | 'compliance'   // policy blocks, whitelist/blacklist
  | 'cascade'      // multi-agent chain failures
  | 'offramp'      // fiat off-ramp failures
  | 'network'      // wrong chain, token not deployed
  | 'policy'       // wallet-level spending limits (Privy etc)
  | 'auth'         // rate limits, API auth failures
  | 'unknown';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

// ── Platform identifier ─────────────────────────────────────────

export type Platform = 'tempo' | 'privy' | 'stripe' | 'generic' | 'unknown';

// ── PCEC Types ──────────────────────────────────────────────────

export interface FailureClassification {
  code: ErrorCode;
  category: FailureCategory;
  severity: Severity;
  platform: Platform;
  details: string;
  timestamp: number;
  // Optional enrichment
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
  platform: Platform;  // which platform contributed this candidate
}

export interface GeneCapsule {
  id?: number;
  failureCode: ErrorCode;
  category: FailureCategory;
  strategy: string;
  params: Record<string, unknown>;
  successCount: number;
  avgRepairMs: number;
  platforms: Platform[];  // which platforms have used this gene
  createdAt?: string;
  lastUsedAt?: string;
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
}

// ── Platform Adapter Interface ──────────────────────────────────

export interface PlatformAdapter {
  name: Platform;
  perceive(error: Error, context?: Record<string, unknown>): FailureClassification | null;
  construct(failure: FailureClassification): RepairCandidate[];
}

// ── SSE Event Types ─────────────────────────────────────────────

export type SseEventType =
  | 'perceive'
  | 'construct'
  | 'evaluate'
  | 'commit'
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
  platforms?: string[];  // e.g. ['tempo', 'privy'] — default: all
  config?: Partial<HelixConfig>;
}

// ── Revenue estimates per category ──────────────────────────────

export const REVENUE_AT_RISK: Record<string, number> = {
  balance: 150,
  session: 50,
  currency: 200,
  signature: 100,
  batch: 500,
  service: 300,
  dex: 175,
  compliance: 250,
  cascade: 1000,
  offramp: 400,
  network: 100,
  policy: 200,
  auth: 50,
  unknown: 50,
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
