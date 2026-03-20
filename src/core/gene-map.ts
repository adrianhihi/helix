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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(failure_code, category)
);
`;

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
      SELECT * FROM genes WHERE failure_code = ? AND category = ?
    `);

    this.stmtUpsert = this.db.prepare(`
      INSERT INTO genes (failure_code, category, strategy, params, success_count, avg_repair_ms, platforms)
      VALUES (@failureCode, @category, @strategy, @params, @successCount, @avgRepairMs, @platforms)
      ON CONFLICT(failure_code, category) DO UPDATE SET
        strategy = @strategy,
        params = @params,
        success_count = success_count + 1,
        avg_repair_ms = (avg_repair_ms * success_count + @avgRepairMs) / (success_count + 1),
        platforms = @platforms,
        last_used_at = datetime('now')
    `);

    this.stmtList = this.db.prepare(`
      SELECT * FROM genes ORDER BY success_count DESC
    `);

    this.stmtCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM genes
    `);

    this.stmtUpdatePlatforms = this.db.prepare(`
      UPDATE genes SET platforms = ?, last_used_at = datetime('now')
      WHERE failure_code = ? AND category = ?
    `);
  }

  lookup(code: ErrorCode, category: FailureCategory): GeneCapsule | null {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return null;

    // Update last_used_at and increment success_count on hit
    this.db.prepare(`
      UPDATE genes SET last_used_at = datetime('now'), success_count = success_count + 1
      WHERE failure_code = ? AND category = ?
    `).run(code, category);

    return {
      id: row.id as number,
      failureCode: row.failure_code as ErrorCode,
      category: row.category as FailureCategory,
      strategy: row.strategy as string,
      params: JSON.parse(row.params as string),
      successCount: (row.success_count as number) + 1,
      avgRepairMs: row.avg_repair_ms as number,
      platforms: JSON.parse(row.platforms as string) as Platform[],
      createdAt: row.created_at as string,
      lastUsedAt: row.last_used_at as string,
    };
  }

  /** Add a platform to an existing gene if not already present */
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
      params: JSON.stringify(gene.params),
      successCount: gene.successCount,
      avgRepairMs: gene.avgRepairMs,
      platforms: JSON.stringify(gene.platforms),
    });
  }

  list(): GeneCapsule[] {
    const rows = this.stmtList.all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as number,
      failureCode: row.failure_code as ErrorCode,
      category: row.category as FailureCategory,
      strategy: row.strategy as string,
      params: JSON.parse(row.params as string),
      successCount: row.success_count as number,
      avgRepairMs: row.avg_repair_ms as number,
      platforms: JSON.parse(row.platforms as string) as Platform[],
      createdAt: row.created_at as string,
      lastUsedAt: row.last_used_at as string,
    }));
  }

  immuneCount(): number {
    const row = this.stmtCount.get() as { count: number };
    return row.count;
  }

  getSuccessRate(failureCode: string, strategy: string): number {
    const row = this.db.prepare(`
      SELECT success_count FROM genes
      WHERE failure_code = ? AND strategy = ?
    `).get(failureCode, strategy) as { success_count: number } | undefined;

    if (!row || row.success_count < 3) return 0.5; // too few samples, return neutral
    // More successes → higher probability, capped at 0.95
    return Math.min(0.5 + (row.success_count / 100), 0.95);
  }

  close(): void {
    this.db.close();
  }
}
