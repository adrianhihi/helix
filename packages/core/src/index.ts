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
export { registerShutdownHandler } from './engine/lifecycle.js';
export { getRootCause } from './engine/root-causes.js';
export type { RootCause } from './engine/root-causes.js';
export { SEED_GENES } from './engine/seed-genes.js';
export { validateStrategyParams, STRATEGY_SCHEMAS } from './engine/strategy-schemas.js';
export { simulate, simulateAsync } from './testing.js';
export type { SimulateOptions, SimulateResult } from './testing.js';
