import { bus } from './bus.js';
import { GeneMap } from './gene-map.js';
import { PcecEngine } from './pcec.js';
import type { HelixConfig, RepairResult, WrapOptions } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { defaultAdapters } from '../platforms/index.js';

export { bus } from './bus.js';
export { GeneMap } from './gene-map.js';
export { PcecEngine, evaluate, commit } from './pcec.js';
export * from './types.js';

let _defaultEngine: PcecEngine | null = null;
let _defaultGeneMap: GeneMap | null = null;

export function createEngine(options?: WrapOptions): PcecEngine {
  const geneMap = new GeneMap(options?.geneMapPath ?? options?.config?.geneMapPath ?? DEFAULT_CONFIG.geneMapPath);
  const engine = new PcecEngine(geneMap, options?.agentId ?? options?.config?.projectName ?? 'default');

  // Register platform adapters
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
    const engine = new PcecEngine(geneMap, options?.agentId ?? 'default');

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

export function wrap<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: WrapOptions,
): (...args: TArgs) => Promise<TResult> {
  const maxRetries = options?.maxRetries ?? options?.config?.maxRetries ?? DEFAULT_CONFIG.maxRetries;
  const verbose = options?.verbose ?? options?.config?.verbose ?? DEFAULT_CONFIG.verbose;
  const agentId = options?.agentId ?? 'wrapped';

  return async (...args: TArgs): Promise<TResult> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        if (attempt === maxRetries) {
          if (verbose) {
            console.error(`\x1b[31m[helix] All ${maxRetries} repair attempts exhausted\x1b[0m`);
          }
          throw error;
        }

        const { engine } = getDefaultEngine(options);

        if (verbose) {
          console.log(
            `\x1b[33m[helix] Payment failed (attempt ${attempt + 1}/${maxRetries}), engaging PCEC...\x1b[0m`,
          );
        }

        bus.emit('retry', agentId, { attempt: attempt + 1, maxRetries });

        const result: RepairResult = await engine.repair(error as Error);

        if (!result.success) {
          if (verbose) {
            console.error(`\x1b[31m[helix] PCEC repair failed, retrying...\x1b[0m`);
          }
        } else if (verbose) {
          const tag = result.immune ? '\x1b[36m⚡ IMMUNE' : '\x1b[32m✓ REPAIRED';
          console.log(
            `${tag}\x1b[0m via ${result.winner?.strategy} in ${result.totalMs}ms ` +
              `($${result.revenueProtected} protected)`,
          );
        }
        // Loop continues — retry the original fn
      }
    }

    // Should not reach here, but TypeScript needs it
    throw new Error('Helix: unexpected repair loop exit');
  };
}

export function shutdown(): void {
  _defaultGeneMap?.close();
  _defaultGeneMap = null;
  _defaultEngine = null;
}
