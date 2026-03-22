// ── Public API ──
export { wrap, createEngine, shutdown } from './engine/wrap.js';

// ── Types ──
export type {
  FailureClassification,
  RepairCandidate,
  GeneCapsule,
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
  HelixProviderConfig,
  DexConfig,
} from './engine/types.js';

export { REVENUE_AT_RISK, DEFAULT_CONFIG } from './engine/types.js';

// ── Platform adapters (for advanced users) ──
export { tempoAdapter, privyAdapter, coinbaseAdapter, genericAdapter, stripeAdapter, defaultAdapters } from './platforms/index.js';

// ── Engine internals (for advanced users) ──
export { PcecEngine } from './engine/pcec.js';
export { GeneMap } from './engine/gene-map.js';
export { EventBus, bus } from './engine/bus.js';
export { evaluate } from './engine/evaluate.js';
export { HelixProvider } from './engine/provider.js';
export { detectSignature, applyOverrides } from './engine/auto-detect.js';
export { getDexPreset, DEX_PRESETS } from './engine/dex-presets.js';
export { registerShutdownHandler } from './engine/lifecycle.js';
export { getRootCause } from './engine/root-causes.js';
export type { RootCause } from './engine/root-causes.js';
export { SEED_GENES } from './engine/seed-genes.js';
export { validateStrategyParams, STRATEGY_SCHEMAS } from './engine/strategy-schemas.js';
export { simulate, simulateAsync } from './testing.js';
export type { SimulateOptions, SimulateResult } from './testing.js';
