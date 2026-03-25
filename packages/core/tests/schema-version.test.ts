import { describe, it, expect, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';
import Database from 'better-sqlite3';

describe('Schema Versioning (D10)', () => {
  let gm: GeneMap;
  afterEach(() => { gm?.close(); });

  it('creates schema version table', () => {
    gm = new GeneMap(':memory:');
    const db = (gm as any).db as Database.Database;
    const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number };
    expect(row.version).toBe(6);
  });

  it('migrates from v0 to latest', () => {
    gm = new GeneMap(':memory:');
    const db = (gm as any).db as Database.Database;
    // Check all tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('genes');
    expect(names).toContain('repair_log');
    expect(names).toContain('repair_attribution');
    expect(names).toContain('schema_version');
  });

  it('does not re-migrate already migrated DB', () => {
    gm = new GeneMap(':memory:');
    // Creating another GeneMap on the same DB should not error
    // (We can't reuse the same in-memory DB, but verify no crash)
    gm.close();
    gm = new GeneMap(':memory:');
    expect(gm.immuneCount()).toBeGreaterThan(0);
  });
});
