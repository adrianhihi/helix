import type { GeneCapsule, RepairContext } from './types.js';

/** Simplify context to trackable numeric/string fields. */
export function simplifyContext(ctx: RepairContext): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  if (ctx.chainId !== undefined) s.chainId = ctx.chainId;
  if (ctx.gasPriceGwei !== undefined) s.gasPriceGwei = ctx.gasPriceGwei;
  if (ctx.hourOfDay !== undefined) s.hourOfDay = ctx.hourOfDay;
  else s.hourOfDay = new Date().getHours();
  if (ctx.agentId) s.agentId = ctx.agentId;
  return s;
}

/** Parse stored context, handling both old object format and new array format. */
export function getContextArray(raw: string | undefined): Record<string, unknown>[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * Calculate how similar current context is to past success contexts.
 * Returns 0.5 (very different) to 1.0 (very similar or no data).
 */
export function contextSimilarity(gene: GeneCapsule, context: RepairContext): number {
  let successContexts: Record<string, unknown>[];
  try {
    const raw = gene.successContext;
    if (!raw) return 1.0;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return 1.0;
    successContexts = parsed;
  } catch { return 1.0; }

  if (successContexts.length === 0) return 1.0;

  let totalSim = 0;
  let comparisons = 0;

  for (const past of successContexts) {
    let fieldSim = 0;
    let fields = 0;

    // gasPriceGwei — ratio similarity
    if (context.gasPriceGwei !== undefined && past.gasPriceGwei !== undefined) {
      const cur = context.gasPriceGwei;
      const prev = past.gasPriceGwei as number;
      fieldSim += Math.min(cur, prev) / Math.max(cur, prev, 1);
      fields++;
    }

    // hourOfDay — circular similarity (23 and 0 are close)
    if (context.hourOfDay !== undefined && past.hourOfDay !== undefined) {
      const diff = Math.abs((context.hourOfDay - (past.hourOfDay as number) + 24) % 24);
      fieldSim += 1 - Math.min(diff, 24 - diff) / 12;
      fields++;
    }

    // chainId — exact match
    if (context.chainId !== undefined && past.chainId !== undefined) {
      fieldSim += context.chainId === past.chainId ? 1.0 : 0.0;
      fields++;
    }

    if (fields > 0) {
      totalSim += fieldSim / fields;
      comparisons++;
    }
  }

  if (comparisons === 0) return 1.0;
  return 0.5 + (totalSim / comparisons) * 0.5;
}
