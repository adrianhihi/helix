/**
 * Causal Repair Graph — dynamic causal inference between errors.
 * Nodes = error types, Edges = causal relationships with probability + delay.
 */
import type Database from 'better-sqlite3';

export interface CausalNode { code: string; category: string; occurrences: number }
export interface CausalEdge { from: string; to: string; probability: number; avgDelayMs: number; observations: number }

export class CausalGraph {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS causal_events (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, category TEXT NOT NULL, agent_id TEXT, timestamp INTEGER DEFAULT (unixepoch() * 1000), repaired INTEGER DEFAULT 0, strategy TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS causal_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, from_code TEXT NOT NULL, from_category TEXT NOT NULL, to_code TEXT NOT NULL, to_category TEXT NOT NULL, probability REAL DEFAULT 0, avg_delay_ms REAL DEFAULT 0, observations INTEGER DEFAULT 1, updated_at INTEGER DEFAULT (unixepoch()), UNIQUE(from_code, from_category, to_code, to_category))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_causal_events_time ON causal_events(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_causal_events_code ON causal_events(code, category)`);
  }

  recordOccurrence(code: string, category: string, agentId?: string): void {
    this.db.prepare('INSERT INTO causal_events (code, category, agent_id, timestamp) VALUES (?,?,?,?)').run(code, category, agentId ?? null, Date.now());
  }

  recordCausation(currentCode: string, currentCategory: string, windowMs = 60000): CausalEdge[] {
    const now = Date.now();
    const recent = this.db.prepare(`SELECT DISTINCT code, category, MAX(timestamp) as latest_ts FROM causal_events WHERE timestamp >= ? AND timestamp <= ? AND NOT (code = ? AND category = ?) GROUP BY code, category`).all(now - windowMs, now, currentCode, currentCategory) as any[];
    const edges: CausalEdge[] = [];

    for (const prev of recent) {
      const delay = now - prev.latest_ts;
      this.db.prepare(`INSERT INTO causal_edges (from_code, from_category, to_code, to_category, avg_delay_ms) VALUES (?,?,?,?,?) ON CONFLICT(from_code, from_category, to_code, to_category) DO UPDATE SET observations = observations + 1, avg_delay_ms = (avg_delay_ms * (observations - 1) + ?) / observations, updated_at = unixepoch()`).run(prev.code, prev.category, currentCode, currentCategory, delay, delay);
      edges.push({ from: `${prev.code}:${prev.category}`, to: `${currentCode}:${currentCategory}`, probability: 0, avgDelayMs: delay, observations: 1 });
    }

    this.updateProbabilities();
    return edges;
  }

  private updateProbabilities(): void {
    const edges = this.db.prepare('SELECT id, from_code, from_category, observations FROM causal_edges').all() as any[];
    for (const e of edges) {
      const total = (this.db.prepare('SELECT COUNT(*) as cnt FROM causal_events WHERE code = ? AND category = ?').get(e.from_code, e.from_category) as any).cnt;
      if (total > 0) this.db.prepare('UPDATE causal_edges SET probability = ? WHERE id = ?').run(Math.min(1, e.observations / total), e.id);
    }
  }

  predict(code: string, category: string, minProbability = 0.3): { code: string; category: string; probability: number; avgDelayMs: number }[] {
    return (this.db.prepare(`SELECT to_code, to_category, probability, avg_delay_ms FROM causal_edges WHERE from_code = ? AND from_category = ? AND probability >= ? ORDER BY probability DESC LIMIT 5`).all(code, category, minProbability) as any[]).map(p => ({ code: p.to_code, category: p.to_category, probability: p.probability, avgDelayMs: p.avg_delay_ms }));
  }

  getCausalChain(code: string, category: string, depth = 3): { nodes: string[]; edges: CausalEdge[] } {
    const visited = new Set<string>();
    const allEdges: CausalEdge[] = [];
    const queue = [`${code}:${category}`];
    for (let d = 0; d < depth && queue.length > 0; d++) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const [c, cat] = current.split(':');
      for (const p of this.predict(c, cat, 0.1)) {
        const key = `${p.code}:${p.category}`;
        allEdges.push({ from: current, to: key, probability: p.probability, avgDelayMs: p.avgDelayMs, observations: 0 });
        if (!visited.has(key)) queue.push(key);
      }
    }
    return { nodes: Array.from(visited), edges: allEdges };
  }

  getFullGraph(): { nodes: CausalNode[]; edges: CausalEdge[] } {
    const nodes = this.db.prepare('SELECT code, category, COUNT(*) as occurrences FROM causal_events GROUP BY code, category').all() as CausalNode[];
    const edges = (this.db.prepare('SELECT from_code, from_category, to_code, to_category, probability, avg_delay_ms, observations FROM causal_edges ORDER BY probability DESC').all() as any[]).map(e => ({ from: `${e.from_code}:${e.from_category}`, to: `${e.to_code}:${e.to_category}`, probability: e.probability, avgDelayMs: e.avg_delay_ms, observations: e.observations }));
    return { nodes, edges };
  }

  cleanup(maxAgeDays = 30): number {
    return this.db.prepare('DELETE FROM causal_events WHERE timestamp < ?').run(Date.now() - maxAgeDays * 86400000).changes;
  }
}
