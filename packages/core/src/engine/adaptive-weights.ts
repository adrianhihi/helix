/**
 * Adaptive Evaluate Weights — online learning for 6D scoring dimensions.
 */
import type Database from 'better-sqlite3';

export interface DimensionWeights { accuracy: number; cost: number; latency: number; safety: number; transferability: number; reliability: number }

const DEFAULT_WEIGHTS: DimensionWeights = { accuracy: 0.25, cost: 0.15, latency: 0.15, safety: 0.25, transferability: 0.1, reliability: 0.1 };
const DIMS = ['accuracy', 'cost', 'latency', 'safety', 'transferability', 'reliability'] as const;

export class AdaptiveWeights {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS adaptive_weights (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, dimension TEXT NOT NULL, weight REAL NOT NULL, observations INTEGER DEFAULT 0, updated_at INTEGER DEFAULT (unixepoch()), UNIQUE(category, dimension))`);
    db.exec(`CREATE TABLE IF NOT EXISTS weight_history (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, dimension TEXT NOT NULL, old_weight REAL NOT NULL, new_weight REAL NOT NULL, reason TEXT, recorded_at INTEGER DEFAULT (unixepoch()))`);
  }

  getWeights(category: string): DimensionWeights {
    for (const cat of [category, 'global']) {
      const rows = this.db.prepare('SELECT dimension, weight FROM adaptive_weights WHERE category = ?').all(cat) as any[];
      if (rows.length === DIMS.length) { const w: any = {}; for (const r of rows) w[r.dimension] = r.weight; return w; }
    }
    return { ...DEFAULT_WEIGHTS };
  }

  update(category: string, scores: DimensionWeights, success: boolean): void {
    const current = this.getWeights(category);
    const obs = this.getObs(category);
    const lr = Math.max(0.01, 0.1 / (1 + obs * 0.05));
    const vals = DIMS.map(d => scores[d]);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const updated: any = { ...current };
    for (const d of DIMS) { const dev = scores[d] - avg; updated[d] = current[d] + (success ? lr * dev : -lr * dev); }
    const norm = this.normalize(updated);
    for (const d of DIMS) {
      this.db.prepare(`INSERT INTO adaptive_weights (category, dimension, weight, observations) VALUES (?,?,?,1) ON CONFLICT(category, dimension) DO UPDATE SET weight = excluded.weight, observations = observations + 1, updated_at = unixepoch()`).run(category, d, norm[d]);
      if (Math.abs(norm[d] - current[d]) > 0.005) this.db.prepare('INSERT INTO weight_history (category, dimension, old_weight, new_weight, reason) VALUES (?,?,?,?,?)').run(category, d, current[d], norm[d], success ? 'success' : 'failure');
    }
    this.updateGlobal();
  }

  private normalize(w: DimensionWeights): DimensionWeights {
    const r: any = {};
    let total = 0;
    for (const d of DIMS) { r[d] = Math.max(0.02, w[d]); total += r[d]; }
    for (const d of DIMS) r[d] = Math.max(0.02, Math.round((r[d] / total) * 1000) / 1000);
    const sum = DIMS.reduce((s, d) => s + r[d], 0);
    r.accuracy += Math.round((1.0 - sum) * 1000) / 1000;
    return r;
  }

  private getObs(category: string): number { return (this.db.prepare('SELECT MAX(observations) as o FROM adaptive_weights WHERE category = ?').get(category) as any)?.o || 0; }

  private updateGlobal(): void {
    for (const d of DIMS) {
      const avg = (this.db.prepare("SELECT AVG(weight) as a FROM adaptive_weights WHERE dimension = ? AND category != 'global'").get(d) as any)?.a;
      if (avg) this.db.prepare("INSERT INTO adaptive_weights (category, dimension, weight) VALUES ('global', ?, ?) ON CONFLICT(category, dimension) DO UPDATE SET weight = excluded.weight, updated_at = unixepoch()").run(d, avg);
    }
  }

  getAllWeights(): Record<string, DimensionWeights> {
    const rows = this.db.prepare('SELECT category, dimension, weight FROM adaptive_weights ORDER BY category').all() as any[];
    const r: Record<string, any> = {};
    for (const row of rows) { if (!r[row.category]) r[row.category] = {}; r[row.category][row.dimension] = row.weight; }
    return r;
  }

  getHistory(limit = 50): any[] { return this.db.prepare('SELECT * FROM weight_history ORDER BY recorded_at DESC LIMIT ?').all(limit); }
  reset(category: string): void { this.db.prepare('DELETE FROM adaptive_weights WHERE category = ?').run(category); }
  getDefaults(): DimensionWeights { return { ...DEFAULT_WEIGHTS }; }
}
