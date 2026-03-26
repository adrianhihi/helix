/**
 * Gene Map Schema Migrations (Data Versioning)
 *
 * Standalone migration system using gene_meta table.
 * Works alongside existing schema_version table.
 * Each migration is idempotent (safe to run twice).
 */

import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

export const CURRENT_SCHEMA_VERSION = 4;

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Base schema — genes table with Q-value RL',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS genes (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, params TEXT DEFAULT '{}', q_value REAL DEFAULT 0.5, success_count INTEGER DEFAULT 0, consecutive_failures INTEGER DEFAULT 0, avg_repair_ms REAL DEFAULT 0, platforms TEXT DEFAULT '[]', reasoning TEXT, failure_analysis TEXT DEFAULT '[]', success_context TEXT DEFAULT '{}', failure_context TEXT DEFAULT '{}', scores TEXT DEFAULT '{}', q_variance REAL DEFAULT 0.25, q_count INTEGER DEFAULT 0, last_5_rewards TEXT DEFAULT '[]', last_success_at INTEGER, last_failed_at INTEGER, created_at TEXT DEFAULT (datetime('now')), last_used_at TEXT DEFAULT (datetime('now')), UNIQUE(failure_code, category))`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_genes_lookup ON genes(failure_code, category)`);
    },
  },
  {
    version: 2,
    description: 'Gene Dream — gene_meta table for dream state',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS gene_meta (key TEXT PRIMARY KEY, value TEXT)`);
      const addCol = (col: string, type: string, def: string) => { try { db.exec(`ALTER TABLE genes ADD COLUMN ${col} ${type} DEFAULT ${def}`); } catch { /* exists */ } };
      addCol('embedding', 'TEXT', 'NULL');
      addCol('dream_cluster', 'TEXT', 'NULL');
      addCol('is_meta_gene', 'INTEGER', '0');
    },
  },
  {
    version: 3,
    description: 'Gene Telemetry — gene_discoveries table',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS gene_discoveries (id INTEGER PRIMARY KEY AUTOINCREMENT, error_pattern TEXT NOT NULL, code TEXT NOT NULL, category TEXT NOT NULL, severity TEXT, strategy TEXT NOT NULL, q_value REAL, source TEXT, reasoning TEXT, llm_provider TEXT, platform TEXT, helix_version TEXT, reported_at INTEGER, reviewed INTEGER DEFAULT 0, approved INTEGER DEFAULT 0, report_count INTEGER DEFAULT 1, avg_q REAL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_discoveries_unique ON gene_discoveries(code, category, strategy, platform)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_discoveries_reviewed ON gene_discoveries(reviewed)`);
    },
  },
  {
    version: 4,
    description: 'Causal Graph + Negative Knowledge',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS causal_events (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, category TEXT NOT NULL, agent_id TEXT, timestamp INTEGER DEFAULT (unixepoch() * 1000), repaired INTEGER DEFAULT 0, strategy TEXT)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_causal_events_time ON causal_events(timestamp)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_causal_events_code ON causal_events(code, category)`);
      db.exec(`CREATE TABLE IF NOT EXISTS causal_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, from_code TEXT NOT NULL, from_category TEXT NOT NULL, to_code TEXT NOT NULL, to_category TEXT NOT NULL, probability REAL DEFAULT 0, avg_delay_ms REAL DEFAULT 0, observations INTEGER DEFAULT 1, updated_at INTEGER DEFAULT (unixepoch()), UNIQUE(from_code, from_category, to_code, to_category))`);
      db.exec(`CREATE TABLE IF NOT EXISTS anti_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, failure_reasoning TEXT, context_conditions TEXT DEFAULT '{}', observation_count INTEGER DEFAULT 1, created_at INTEGER DEFAULT (unixepoch()), UNIQUE(failure_code, category, strategy))`);
    },
  },
];

export function getSchemaVersion(db: Database.Database): number {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS gene_meta (key TEXT PRIMARY KEY, value TEXT)`);
    const row = db.prepare("SELECT value FROM gene_meta WHERE key = 'data_schema_version'").get() as any;
    return row ? Number(row.value) : 0;
  } catch { return 0; }
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.exec(`CREATE TABLE IF NOT EXISTS gene_meta (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare("INSERT INTO gene_meta (key, value) VALUES ('data_schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version));
}

export function runMigrations(db: Database.Database, options?: { decayOnMajorBump?: boolean }): Migration[] {
  const currentVersion = getSchemaVersion(db);
  const pending = migrations.filter(m => m.version > currentVersion);
  if (pending.length === 0) return [];

  const applied: Migration[] = [];

  db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      setSchemaVersion(db, migration.version);
      applied.push(migration);
    }

    if (options?.decayOnMajorBump && pending.length >= 2) {
      const totalDecay = Math.pow(0.9, pending.length);
      try {
        db.prepare('UPDATE genes SET q_value = q_value * ? WHERE q_value > 0.2').run(totalDecay);
      } catch { /* genes table may not exist yet */ }
    }
  })();

  return applied;
}

export function needsMigration(db: Database.Database): { needed: boolean; currentVersion: number; targetVersion: number; pendingCount: number } {
  const currentVersion = getSchemaVersion(db);
  const pending = migrations.filter(m => m.version > currentVersion);
  return { needed: pending.length > 0, currentVersion, targetVersion: CURRENT_SCHEMA_VERSION, pendingCount: pending.length };
}
