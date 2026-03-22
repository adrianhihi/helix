import { bus } from './bus.js';
import { GeneMap } from './gene-map.js';
import { PcecEngine } from './pcec.js';
import type { RepairResult, WrapOptions } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { defaultAdapters } from '../platforms/index.js';
import { detectSignature, applyOverrides } from './auto-detect.js';

let _defaultEngine: PcecEngine | null = null;
let _defaultGeneMap: GeneMap | null = null;

export function createEngine(options?: WrapOptions): PcecEngine {
  const geneMap = new GeneMap(options?.geneMapPath ?? options?.config?.geneMapPath ?? DEFAULT_CONFIG.geneMapPath);
  const engine = new PcecEngine(geneMap, options?.agentId ?? options?.config?.projectName ?? 'default', options);
  for (const adapter of defaultAdapters) {
    if (!options?.platforms || options.platforms.includes(adapter.name) || adapter.name === 'generic') engine.registerAdapter(adapter);
  }
  return engine;
}

// Cache engines by geneMapPath to allow shared Gene Maps
const _engineCache = new Map<string, { engine: PcecEngine; geneMap: GeneMap }>();

function getDefaultEngine(options?: WrapOptions): { engine: PcecEngine; geneMap: GeneMap } {
  const dbPath = options?.geneMapPath ?? options?.config?.geneMapPath ?? DEFAULT_CONFIG.geneMapPath;
  const cached = _engineCache.get(dbPath);
  if (cached) return cached;

  const geneMap = new GeneMap(dbPath);
  const engine = new PcecEngine(geneMap, options?.agentId ?? 'default', options);
  for (const adapter of defaultAdapters) {
    if (!options?.platforms || options.platforms.includes(adapter.name) || adapter.name === 'generic') engine.registerAdapter(adapter);
  }
  _engineCache.set(dbPath, { engine, geneMap });
  return { engine, geneMap };
}

const SIMPLE_RETRY = ['backoff_retry', 'retry', 'retry_with_receipt', 'renew_session'];

export function wrap<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: WrapOptions,
): (...args: TArgs) => Promise<TResult> {
  const maxRetries = options?.maxRetries ?? options?.config?.maxRetries ?? DEFAULT_CONFIG.maxRetries;
  const verbose = options?.verbose ?? options?.config?.verbose ?? DEFAULT_CONFIG.verbose;
  const agentId = options?.agentId ?? 'wrapped';

  return async (...args: TArgs): Promise<TResult> => {
    const startTime = Date.now();
    const enabled = typeof options?.enabled === 'function' ? options.enabled() : (options?.enabled ?? true);
    if (!enabled) return fn(...args);

    let currentArgs = args;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn(...currentArgs);
        if (attempt > 0) {
          return Object.assign(result as object, { _helix: { repaired: true, attempts: attempt + 1, totalMs: Date.now() - startTime } }) as TResult;
        }
        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          if (verbose) console.error(`\x1b[31m[helix] All ${maxRetries} repair attempts exhausted\x1b[0m`);
          throw error;
        }

        try {
          const { engine } = getDefaultEngine(options);
          const errMsg = (error as any)?.shortMessage ?? (error as Error).message ?? String(error);
          const wrappedError = error instanceof Error ? error : new Error(errMsg);

          if (verbose) console.log(`\x1b[33m[helix] Payment failed (attempt ${attempt + 1}/${maxRetries}), engaging PCEC...\x1b[0m`);
          bus.emit('retry', agentId, { attempt: attempt + 1, maxRetries });

          const result: RepairResult = await engine.repair(wrappedError, {
            ...options?.context,
            chainId: (error as any)?.chain?.id,
            walletAddress: (error as any)?.account?.address,
          });

          if (result.success) options?.onRepair?.(result);
          else options?.onFailure?.(result);

          // Observe mode — diagnosis only
          if (result.mode === 'observe') {
            const enriched = error as Error & { _helix: RepairResult; helixRecommendation: RepairResult };
            enriched._helix = result;
            enriched.helixRecommendation = result;
            throw enriched;
          }

          const strategy = result.winner?.strategy ?? result.gene?.strategy;
          if (!strategy) {
            if (verbose) console.error(`\x1b[31m[helix] No viable strategy\x1b[0m`);
            continue; // next attempt
          }

          if (verbose) {
            const tag = result.immune ? '\x1b[36m⚡ IMMUNE' : '\x1b[32m✓ REPAIRED';
            console.log(`${tag}\x1b[0m via ${strategy} in ${result.totalMs}ms ($${result.revenueProtected} protected)`);
          }

          // Apply overrides for non-simple strategies
          if (!SIMPLE_RETRY.includes(strategy)) {
            const overrides = result.commitOverrides ?? {};

            // Priority 1: User parameterModifier
            if (options?.parameterModifier && Object.keys(overrides).length > 0) {
              currentArgs = options.parameterModifier(currentArgs as unknown[], overrides, strategy) as TArgs;
              if (verbose) console.log(`\x1b[33m[helix] Applied overrides via parameterModifier\x1b[0m`);
            }
            // Priority 2: Auto-detect
            else {
              const sig = detectSignature(currentArgs as unknown[]);
              const applied = applyOverrides([...currentArgs] as unknown[], overrides, strategy, sig);
              if (applied) {
                currentArgs = applied as TArgs;
                if (verbose) console.log(`\x1b[33m[helix] Auto-applied overrides (${sig.type}): ${Object.keys(overrides).join(', ') || strategy}\x1b[0m`);
              }
            }
          }
          // For simple retry: currentArgs stays the same, loop retries
        } catch (helixError) {
          if ((helixError as any)?._helix || (helixError as any)?.helixRecommendation) throw helixError;
          options?.onHelixError?.(helixError as Error);
          throw error;
        }
      }
    }
    throw new Error('Helix: unexpected repair loop exit');
  };
}

export function shutdown(): void {
  for (const { geneMap } of _engineCache.values()) {
    try { geneMap.close(); } catch {}
  }
  _engineCache.clear();
}
