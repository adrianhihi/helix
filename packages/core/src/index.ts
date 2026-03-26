// ── Public API ──
export { wrap, createEngine, shutdown } from './engine/wrap.js';

// ── Types ──
export type {
  FailureClassification,
  RepairCandidate,
  GeneCapsule,
  StrategyStep,
  RepairResult,
  PlatformAdapter,
  ErrorCode,
  FailureCategory,
  Platform,
  Severity,
  SseEvent,
  SseEventType,
  HelixConfig,
  WrapOptions,
  HelixMode,
  RepairContext,
  HelixProviderConfig,
  DexConfig,
} from './engine/types.js';

export { REVENUE_AT_RISK, DEFAULT_CONFIG } from './engine/types.js';

// ── Platform adapters (for advanced users) ──
export { tempoAdapter, privyAdapter, coinbaseAdapter, genericAdapter, stripeAdapter, defaultAdapters } from './platforms/index.js';

// ── Engine internals (for advanced users) ──
export { PcecEngine } from './engine/pcec.js';
export { GeneMap, calculateAdaptiveAlpha, thompsonSample } from './engine/gene-map.js';
export type { AdaptiveAlphaConfig } from './engine/gene-map.js';
export { EventBus, bus } from './engine/bus.js';
export { evaluate } from './engine/evaluate.js';
export { HelixProvider } from './engine/provider.js';
export { detectSignature, applyOverrides } from './engine/auto-detect.js';
export { llmClassify, llmConstructCandidates, llmGenerateReasoning } from './engine/llm.js';
export type { LlmConfig } from './engine/llm.js';
export { reportDiscovery } from './engine/telemetry.js';
export type { TelemetryEvent, TelemetryConfig } from './engine/telemetry.js';
export { createLogger } from './engine/logger.js';
export type { HelixLogger, LogLevel, LogFormat } from './engine/logger.js';
export { getDexPreset, DEX_PRESETS } from './engine/dex-presets.js';
export { detectStrategyChain, isChainStrategy, parseChainSteps } from './engine/chain.js';
export { HelixOtel, NOOP_OTEL } from './engine/otel.js';
export type { OtelConfig } from './engine/otel.js';
export { GeneRegistryClient } from './engine/gene-registry.js';
export type { GeneRegistryConfig, RegistryGene } from './engine/gene-registry.js';
export { registerShutdownHandler } from './engine/lifecycle.js';
export { getRootCause } from './engine/root-causes.js';
export type { RootCause } from './engine/root-causes.js';
export { SEED_GENES } from './engine/seed-genes.js';
export { validateStrategyParams, STRATEGY_SCHEMAS } from './engine/strategy-schemas.js';
export { computeRepairScore, SCORE_WEIGHTS } from './engine/repair-score.js';
export type { RepairScore } from './engine/repair-score.js';
export { maybeDistillFromFailures, analyzeFailurePattern } from './engine/failure-distiller.js';
export type { FailedRepairRecord } from './engine/failure-distiller.js';
export { MetaLearner } from './engine/meta-learner.js';
export type { MetaPattern } from './engine/meta-learner.js';
export { checkConditions, getConditionMultiplier, updateGeneConditions } from './engine/conditional-genes.js';
export type { GeneCondition } from './engine/conditional-genes.js';
export { AdversarialDefense } from './engine/adversarial.js';
export type { ReputationInfo, VerificationResult, RollbackCheck } from './engine/adversarial.js';
export { CausalGraph } from './engine/causal-graph.js';
export type { CausalNode, CausalEdge } from './engine/causal-graph.js';
export { NegativeKnowledge } from './engine/negative-knowledge.js';
export type { AntiPattern } from './engine/negative-knowledge.js';
export { GeneDream } from './engine/dream.js';
export type { DreamConfig, DreamStats, DreamEvent } from './engine/dream.js';
export { IdleScheduler } from './engine/idle-scheduler.js';
export type { IdleSchedulerConfig } from './engine/idle-scheduler.js';
export { runMigrations, needsMigration, getSchemaVersion, CURRENT_SCHEMA_VERSION } from './engine/migrations.js';
export type { Migration } from './engine/migrations.js';
export { createApiServer } from './api-server.js';
export type { ApiServerOptions } from './api-server.js';
export { simulate, simulateAsync } from './testing.js';
export type { SimulateOptions, SimulateResult } from './testing.js';
export { matchErrorSignature, tokenize, tokenSimilarity, addSignature, getSignatures } from './engine/error-embedding.js';
export type { ErrorSignature } from './engine/error-embedding.js';
export { ABTestManager } from './engine/ab-test.js';
export type { ABTest } from './engine/ab-test.js';
