/**
 * Negative Knowledge — anti-patterns from failed repairs (Reflexion paper).
 * Remember why repairs failed. Avoid repeating mistakes.
 */
import type Database from 'better-sqlite3';

export interface AntiPattern {
  id: number;
  failureCode: string;
  category: string;
  strategy: string;
  failureReasoning?: string;
  observationCount: number;
  createdAt: number;
}

export class NegativeKnowledge {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS anti_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, failure_reasoning TEXT, context_conditions TEXT DEFAULT '{}', observation_count INTEGER DEFAULT 1, created_at INTEGER DEFAULT (unixepoch()), UNIQUE(failure_code, category, strategy))`);
  }

  record(failureCode: string, category: string, strategy: string, reasoning?: string): void {
    this.db.prepare(`INSERT INTO anti_patterns (failure_code, category, strategy, failure_reasoning) VALUES (?,?,?,?) ON CONFLICT(failure_code, category, strategy) DO UPDATE SET observation_count = observation_count + 1, failure_reasoning = COALESCE(excluded.failure_reasoning, failure_reasoning)`).run(failureCode, category, strategy, reasoning ?? null);
  }

  /** Returns penalty multiplier: 1.0 = no penalty, 0.3 = strong penalty */
  getPenalty(failureCode: string, category: string, strategy: string): number {
    const row = this.db.prepare('SELECT observation_count FROM anti_patterns WHERE failure_code = ? AND category = ? AND strategy = ?').get(failureCode, category, strategy) as any;
    if (!row) return 1.0;
    if (row.observation_count >= 3) return 0.3;
    if (row.observation_count >= 2) return 0.35;
    return 0.5;
  }

  getAll(): AntiPattern[] {
    return (this.db.prepare('SELECT id, failure_code as failureCode, category, strategy, failure_reasoning as failureReasoning, observation_count as observationCount, created_at as createdAt FROM anti_patterns ORDER BY observation_count DESC').all()) as AntiPattern[];
  }

  getForError(failureCode: string, category: string): AntiPattern[] {
    return (this.db.prepare('SELECT id, failure_code as failureCode, category, strategy, failure_reasoning as failureReasoning, observation_count as observationCount, created_at as createdAt FROM anti_patterns WHERE failure_code = ? AND category = ? ORDER BY observation_count DESC').all(failureCode, category)) as AntiPattern[];
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as cnt FROM anti_patterns').get() as any).cnt;
  }
}
