export interface GeneCapsule {
  id?: number;
  failureCode: string;
  category: string;
  strategy: string;
  params: Record<string, unknown>;
  successCount: number;
  avgRepairMs: number;
  platforms: string[];
  qValue: number;
  qVariance?: number;
  qCount?: number;
  last5Rewards?: number[];
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastFailedAt?: number;
  createdAt?: string;
  lastUsedAt?: string;
  reasoning?: string;
  failureAnalysis?: string[];
  successContext?: Record<string, unknown>;
  failureContext?: Record<string, unknown>;
  scores?: Record<string, number>;
}

export interface GeneMapOptions {
  dbPath?: string;
}
