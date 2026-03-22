import { bus } from './bus.js';
import { GeneMap } from './gene-map.js';
import { PcecEngine } from './pcec.js';
import type { RepairResult, WrapOptions } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { defaultAdapters } from '../platforms/index.js';

let _defaultEngine: PcecEngine | null = null;
let _defaultGeneMap: GeneMap | null = null;

export function createEngine(options?: WrapOptions): PcecEngine {
  const geneMap = new GeneMap(options?.geneMapPath ?? options?.config?.geneMapPath ?? DEFAULT_CONFIG.geneMapPath);
  const engine = new PcecEngine(geneMap, options?.agentId ?? options?.config?.projectName ?? 'default', options);
  for (const adapter of defaultAdapters) {
    if (!options?.platforms || options.platforms.includes(adapter.name) || adapter.name === 'generic') {
      engine.registerAdapter(adapter);
    }
  }
  return engine;
}

function getDefaultEngine(options?: WrapOptions): { engine: PcecEngine; geneMap: GeneMap } {
  if (!_defaultEngine) {
    const geneMap = new GeneMap(options?.geneMapPath ?? options?.config?.geneMapPath ?? DEFAULT_CONFIG.geneMapPath);
    const engine = new PcecEngine(geneMap, options?.agentId ?? 'default', options);
    for (const adapter of defaultAdapters) {
      if (!options?.platforms || options.platforms.includes(adapter.name) || adapter.name === 'generic') {
        engine.registerAdapter(adapter);
      }
    }
    _defaultEngine = engine;
    _defaultGeneMap = geneMap;
  }
  return { engine: _defaultEngine, geneMap: _defaultGeneMap! };
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

    // Kill switch
    const enabled = typeof options?.enabled === 'function' ? options.enabled() : (options?.enabled ?? true);
    if (!enabled) return fn(...args);

    // Current args — may be modified by parameterModifier
    let currentArgs = args;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn(...currentArgs);
        // If this was a repaired retry, attach _helix metadata
        if (attempt > 0) {
          return Object.assign(result as any, {
            _helix: { repaired: true, attempts: attempt + 1, totalMs: Date.now() - startTime },
          });
        }
        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          if (verbose) console.error(`\x1b[31m[helix] All ${maxRetries} repair attempts exhausted\x1b[0m`);
          throw error;
        }

        try {
          const { engine } = getDefaultEngine(options);
          const errorMsg = (error as any)?.shortMessage ?? (error as Error).message ?? String(error);
          const wrappedError = error instanceof Error ? error : new Error(errorMsg);

          if (verbose) console.log(`\x1b[33m[helix] Payment failed (attempt ${attempt + 1}/${maxRetries}), engaging PCEC...\x1b[0m`);
          bus.emit('retry', agentId, { attempt: attempt + 1, maxRetries });

          const result: RepairResult = await engine.repair(wrappedError, {
            ...options?.context,
            chainId: (error as any)?.chain?.id,
            walletAddress: (error as any)?.account?.address,
          });

          if (result.success) options?.onRepair?.(result);
          else options?.onFailure?.(result);

          // Observe mode — throw with diagnosis
          if (result.mode === 'observe') {
            const enriched = error as Error & { helixRecommendation: RepairResult; _helix: RepairResult };
            enriched.helixRecommendation = result;
            enriched._helix = result;
            throw enriched;
          }

          const strategy = result.winner?.strategy ?? result.gene?.strategy;

          if (result.success && strategy) {
            if (verbose) {
              const tag = result.immune ? '\x1b[36m⚡ IMMUNE' : '\x1b[32m✓ REPAIRED';
              console.log(`${tag}\x1b[0m via ${strategy} in ${result.totalMs}ms ($${result.revenueProtected} protected)`);
            }

            // Check if parameterModifier can apply overrides for non-simple strategies
            if (!SIMPLE_RETRY.includes(strategy) && options?.parameterModifier) {
              // Get overrides from the repair result — provider.execute returns them
              const overrides = (result as any).commitOverrides ?? {};
              if (Object.keys(overrides).length > 0) {
                currentArgs = options.parameterModifier(currentArgs as unknown[], overrides, strategy) as TArgs;
                if (verbose) console.log(`\x1b[33m[helix] Applied overrides: ${Object.keys(overrides).join(', ')}\x1b[0m`);
              }
            }
            // For simple retry: just loop back (currentArgs unchanged)
            // For parameter strategies: currentArgs was modified above
            // Either way, the next loop iteration calls fn(currentArgs)
          } else {
            if (verbose) console.error(`\x1b[31m[helix] PCEC repair failed, retrying...\x1b[0m`);
          }
        } catch (helixError) {
          if ((helixError as any)?.helixRecommendation || (helixError as any)?._helix) {
            throw helixError;
          }
          options?.onHelixError?.(helixError as Error);
          throw error;
        }
      }
    }
    throw new Error('Helix: unexpected repair loop exit');
  };
}

export function shutdown(): void {
  _defaultGeneMap?.close();
  _defaultGeneMap = null;
  _defaultEngine = null;
}
