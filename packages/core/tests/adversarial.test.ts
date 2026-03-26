import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AdversarialDefense } from '../src/engine/adversarial.js';

describe('Adversarial Robustness', () => {
  let db: Database.Database;
  let defense: AdversarialDefense;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS genes (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT, category TEXT, strategy TEXT, q_value REAL DEFAULT 0.5, params TEXT DEFAULT '{}', success_count INTEGER DEFAULT 0, consecutive_failures INTEGER DEFAULT 0, avg_repair_ms REAL DEFAULT 0, platforms TEXT DEFAULT '[]')`);
    db.prepare("INSERT INTO genes (id, failure_code, category, strategy, q_value) VALUES (1,'test','test','retry',0.7)").run();
    defense = new AdversarialDefense(db);
  });
  afterEach(() => db.close());

  // Layer 1: Reputation
  it('initial reputation is 0.5', () => { expect(defense.getReputation('a').reputation).toBe(0.5); });
  it('success increases reputation', () => { defense.updateReputation('a', true); expect(defense.getReputation('a').reputation).toBeGreaterThan(0.5); });
  it('failure decreases reputation', () => { defense.updateReputation('a', false); expect(defense.getReputation('a').reputation).toBeLessThan(0.5); });
  it('reputation never below 0', () => { for (let i = 0; i < 20; i++) defense.updateReputation('a', false); expect(defense.getReputation('a').reputation).toBeGreaterThanOrEqual(0); });
  it('reputation never above 1', () => { for (let i = 0; i < 30; i++) defense.updateReputation('a', true); expect(defense.getReputation('a').reputation).toBeLessThanOrEqual(1); });
  it('untrusted when < 0.3', () => { for (let i = 0; i < 5; i++) defense.updateReputation('a', false); expect(defense.isTrusted('a')).toBe(false); });
  it('trusted by default', () => { expect(defense.isTrusted('new')).toBe(true); });

  // Layer 2: Multi-agent verification
  it('needs 3 agents to verify', () => {
    defense.verifyGene(1, 'a', true);
    expect(defense.getVerificationStatus(1).isVerified).toBe(false);
    defense.verifyGene(1, 'b', true);
    expect(defense.getVerificationStatus(1).isVerified).toBe(false);
    defense.verifyGene(1, 'c', true);
    expect(defense.getVerificationStatus(1).isVerified).toBe(true);
  });
  it('same agent counts once', () => { defense.verifyGene(1, 'a', true); defense.verifyGene(1, 'a', true); expect(defense.getVerificationStatus(1).verifiedBy).toBe(1); });
  it('failed verification not counted', () => {
    defense.verifyGene(1, 'a', true); defense.verifyGene(1, 'b', false); defense.verifyGene(1, 'c', true);
    expect(defense.getVerificationStatus(1).verifiedBy).toBe(2);
  });

  // Layer 3: Anomaly detection
  it('flags large Q-value jumps', () => { expect(defense.detectAnomaly(1, 0.75)).toBe(false); expect(defense.detectAnomaly(1, 0.2)).toBe(true); });
  it('no anomaly for missing gene', () => { expect(defense.detectAnomaly(999, 0.5)).toBe(false); });
  it('snapshot stores state', () => { defense.takeSnapshot(1); expect((db.prepare('SELECT COUNT(*) as c FROM gene_snapshots').get() as any).c).toBe(1); });
  it('detects unstable Q-value', () => {
    for (let i = 0; i < 5; i++) db.prepare('INSERT INTO gene_snapshots (gene_id, q_value, strategy) VALUES (?,?,?)').run(1, i % 2 === 0 ? 0.9 : 0.1, 'retry');
    expect(defense.checkQValueStability(1).stable).toBe(false);
  });

  // Layer 4: Auto-rollback
  it('triggers on 3 consecutive failures from 2+ agents', () => {
    defense.verifyGene(1, 'a', false); defense.verifyGene(1, 'b', false); defense.verifyGene(1, 'c', false);
    expect(defense.checkRollback(1).shouldRollback).toBe(true);
  });
  it('does not trigger with mixed results', () => {
    defense.verifyGene(1, 'a', true); defense.verifyGene(1, 'b', false); defense.verifyGene(1, 'c', false);
    expect(defense.checkRollback(1).shouldRollback).toBe(false);
  });
  it('rollback restores snapshot', () => {
    defense.takeSnapshot(1);
    db.prepare('UPDATE genes SET q_value = 0.05 WHERE id = 1').run();
    expect(defense.rollback(1)).toBe(true);
    expect((db.prepare('SELECT q_value FROM genes WHERE id = 1').get() as any).q_value).toBeCloseTo(0.7);
  });
  it('rollback fails without snapshot', () => { expect(defense.rollback(999)).toBe(false); });

  // Stats
  it('getStats returns counts', () => {
    defense.updateReputation('a', true); defense.verifyGene(1, 'a', true); defense.takeSnapshot(1);
    const s = defense.getStats();
    expect(s.totalAgents).toBe(1);
    expect(s.totalVerifications).toBe(1);
    expect(s.totalSnapshots).toBe(1);
  });
});
