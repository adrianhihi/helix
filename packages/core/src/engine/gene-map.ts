import Database from 'better-sqlite3';
import type { ErrorCode, FailureCategory, GeneCapsule, Platform } from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS genes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  failure_code TEXT NOT NULL,
  category TEXT NOT NULL,
  strategy TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  success_count INTEGER NOT NULL DEFAULT 1,
  avg_repair_ms REAL NOT NULL DEFAULT 0,
  platforms TEXT NOT NULL DEFAULT '[]',
  q_value REAL NOT NULL DEFAULT 0.5,
  last_success_at INTEGER,
  last_failed_at INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(failure_code, category)
);
`;

function parseRow(row: Record<string, unknown>): GeneCapsule {
  return {
    id: row.id as number,
    failureCode: row.failure_code as ErrorCode,
    category: row.category as FailureCategory,
    strategy: row.strategy as string,
    params: JSON.parse(row.params as string),
    successCount: row.success_count as number,
    avgRepairMs: row.avg_repair_ms as number,
    platforms: JSON.parse(row.platforms as string) as Platform[],
    qValue: row.q_value as number,
    consecutiveFailures: row.consecutive_failures as number,
    lastSuccessAt: row.last_success_at as number | undefined,
    lastFailedAt: row.last_failed_at as number | undefined,
    createdAt: row.created_at as string,
    lastUsedAt: row.last_used_at as string,
  };
}

export class GeneMap {
  private db: Database.Database;
  private stmtLookup: Database.Statement;
  private stmtUpsert: Database.Statement;
  private stmtList: Database.Statement;
  private stmtCount: Database.Statement;
  private stmtUpdatePlatforms: Database.Statement;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);

    this.stmtLookup = this.db.prepare(`
      SELECT * FROM genes WHERE failure_code = ? AND category = ? ORDER BY q_value DESC LIMIT 1
    `);

    this.stmtUpsert = this.db.prepare(`
      INSERT INTO genes (failure_code, category, strategy, params, success_count, avg_repair_ms, platforms, q_value, consecutive_failures)
      VALUES (@failureCode, @category, @strategy, @params, @successCount, @avgRepairMs, @platforms, @qValue, @consecutiveFailures)
      ON CONFLICT(failure_code, category) DO UPDATE SET
        strategy = @strategy,
        params = @params,
        success_count = success_count + 1,
        avg_repair_ms = (avg_repair_ms * success_count + @avgRepairMs) / (success_count + 1),
        platforms = @platforms,
        q_value = @qValue,
        consecutive_failures = @consecutiveFailures,
        last_used_at = datetime('now')
    `);

    this.stmtList = this.db.prepare(`SELECT * FROM genes ORDER BY q_value DESC, success_count DESC`);
    this.stmtCount = this.db.prepare(`SELECT COUNT(*) as count FROM genes`);
    this.stmtUpdatePlatforms = this.db.prepare(`
      UPDATE genes SET platforms = ?, last_used_at = datetime('now') WHERE failure_code = ? AND category = ?
    `);
  }

  lookup(code: ErrorCode, category: FailureCategory): GeneCapsule | null {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return null;

    this.db.prepare(`
      UPDATE genes SET last_used_at = datetime('now'), success_count = success_count + 1
      WHERE failure_code = ? AND category = ?
    `).run(code, category);

    const gene = parseRow(row);
    gene.successCount += 1; // reflect the bump we just did
    return gene;
  }

  addPlatform(code: ErrorCode, category: FailureCategory, platform: Platform): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const platforms: Platform[] = JSON.parse(row.platforms as string);
    if (!platforms.includes(platform)) {
      platforms.push(platform);
      this.stmtUpdatePlatforms.run(JSON.stringify(platforms), code, category);
    }
  }

  store(gene: GeneCapsule): void {
    this.stmtUpsert.run({
      failureCode: gene.failureCode,
      category: gene.category,
      strategy: gene.strategy,
      params: JSON.stringify(gene.params, (_k, v) => typeof v === 'bigint' ? v.toString() : v),
      successCount: gene.successCount,
      avgRepairMs: gene.avgRepairMs,
      platforms: JSON.stringify(gene.platforms),
      qValue: gene.qValue ?? 0.5,
      consecutiveFailures: gene.consecutiveFailures ?? 0,
    });
  }

  /** RL update after successful repair */
  recordSuccess(code: string, category: string, repairMs: number): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const alpha = 0.1;
    const oldQ = row.q_value as number;
    const newQ = oldQ + alpha * (1.0 - oldQ);
    this.db.prepare(`
      UPDATE genes SET
        q_value = ?,
        avg_repair_ms = (avg_repair_ms * success_count + ?) / (success_count + 1),
        success_count = success_count + 1,
        last_success_at = ?,
        consecutive_failures = 0,
        last_used_at = datetime('now')
      WHERE failure_code = ? AND category = ?
    `).run(newQ, repairMs, Date.now(), code, category);
  }

  /** RL update after failed repair */
  recordFailure(code: string, category: string): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const alpha = 0.1;
    const oldQ = row.q_value as number;
    const newQ = oldQ + alpha * (0.0 - oldQ);
    this.db.prepare(`
      UPDATE genes SET
        q_value = ?,
        last_failed_at = ?,
        consecutive_failures = consecutive_failures + 1,
        last_used_at = datetime('now')
      WHERE failure_code = ? AND category = ?
    `).run(newQ, Date.now(), code, category);
  }

  list(): GeneCapsule[] {
    return (this.stmtList.all() as Record<string, unknown>[]).map(parseRow);
  }

  immuneCount(): number {
    return (this.stmtCount.get() as { count: number }).count;
  }

  getSuccessRate(failureCode: string, strategy: string): number {
    const row = this.db.prepare(`
      SELECT success_count, q_value FROM genes WHERE failure_code = ? AND strategy = ?
    `).get(failureCode, strategy) as { success_count: number; q_value: number } | undefined;
    if (!row || row.success_count < 3) return 0.5;
    return Math.min(0.5 + (row.success_count / 100), 0.95);
  }

  stats(): { totalGenes: number; avgQValue: number; platforms: string[]; topStrategies: { strategy: string; count: number }[] } {
    const rows = this.stmtList.all() as Record<string, unknown>[];
    const allPlatforms = new Set<string>();
    let qSum = 0;
    for (const r of rows) {
      qSum += r.q_value as number;
      for (const p of JSON.parse(r.platforms as string)) allPlatforms.add(p);
    }
    return {
      totalGenes: rows.length,
      avgQValue: rows.length > 0 ? Math.round((qSum / rows.length) * 100) / 100 : 0,
      platforms: [...allPlatforms],
      topStrategies: rows.slice(0, 10).map(r => ({
        strategy: r.strategy as string,
        count: r.success_count as number,
      })),
    };
  }

  close(): void {
    this.db.close();
  }
}
