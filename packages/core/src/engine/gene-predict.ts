import type Database from 'better-sqlite3';
import type { ErrorCode, FailureCategory } from './types.js';

export interface Prediction {
  code: string;
  category: string;
  probability: number;
  avgDelayMs: number;
}

export interface LinkInfo {
  toCode: string;
  toCategory: string;
  count: number;
  probability: number;
}

/**
 * Predictive Failure Graph — extracted from GeneMap.
 *
 * Records directed failure transitions (A→B), calculates transition
 * probabilities, predicts likely next failures, and preloads genes.
 */
export class GenePredictiveGraph {
  constructor(
    private db: Database.Database,
    private stmtLookup: Database.Statement,
    private cache: Map<string, Record<string, unknown>>,
    private cacheKey: (code: string, category: string) => string,
  ) {}

  /** Record a directed failure transition with delay. */
  recordTransition(fromCode: string, fromCategory: string, toCode: string, toCategory: string, delayMs: number): void {
    this.db.prepare(`INSERT INTO gene_links (gene_a_code, gene_a_category, gene_b_code, gene_b_category, co_occurrence_count, avg_delay_ms, last_seen_at) VALUES (?, ?, ?, ?, 1, ?, datetime('now')) ON CONFLICT(gene_a_code, gene_a_category, gene_b_code, gene_b_category) DO UPDATE SET avg_delay_ms = (avg_delay_ms * co_occurrence_count + ?) / (co_occurrence_count + 1), co_occurrence_count = co_occurrence_count + 1, last_seen_at = datetime('now')`).run(fromCode, fromCategory, toCode, toCategory, delayMs, delayMs);
    this.updateTransitionProbabilities(fromCode, fromCategory);
  }

  /** Recalculate transition probabilities: P(B|A) = count(A→B) / total(A→*) */
  private updateTransitionProbabilities(fromCode: string, fromCategory: string): void {
    const links = this.db.prepare(`SELECT gene_b_code, gene_b_category, co_occurrence_count FROM gene_links WHERE gene_a_code = ? AND gene_a_category = ?`).all(fromCode, fromCategory) as { gene_b_code: string; gene_b_category: string; co_occurrence_count: number }[];
    const total = links.reduce((s, l) => s + l.co_occurrence_count, 0);
    if (total === 0) return;
    for (const link of links) {
      this.db.prepare(`UPDATE gene_links SET transition_probability = ?, from_count = ? WHERE gene_a_code = ? AND gene_a_category = ? AND gene_b_code = ? AND gene_b_category = ?`).run(link.co_occurrence_count / total, total, fromCode, fromCategory, link.gene_b_code, link.gene_b_category);
    }
  }

  /** Predict top 3 next failures with ≥ minProbability and ≥ 3 co-occurrences. */
  predictNext(code: string, category: string, minProbability: number = 0.1): Prediction[] {
    return this.db.prepare(`SELECT gene_b_code as code, gene_b_category as category, transition_probability as probability, avg_delay_ms as avgDelayMs FROM gene_links WHERE gene_a_code = ? AND gene_a_category = ? AND transition_probability >= ? AND co_occurrence_count >= 3 ORDER BY transition_probability DESC LIMIT 3`).all(code, category, minProbability) as Prediction[];
  }

  /** Preload a Gene into L1 cache without incrementing success_count. */
  preload(code: ErrorCode, category: FailureCategory): void {
    const key = this.cacheKey(code, category);
    if (this.cache.has(key)) return;
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (row) this.cache.set(key, row);
  }

  /** Get outgoing links from a given error. */
  getLinks(code: string, category: string): LinkInfo[] {
    return this.db.prepare(`SELECT gene_b_code as toCode, gene_b_category as toCategory, co_occurrence_count as count, transition_probability as probability FROM gene_links WHERE gene_a_code = ? AND gene_a_category = ? ORDER BY co_occurrence_count DESC`).all(code, category) as LinkInfo[];
  }
}
