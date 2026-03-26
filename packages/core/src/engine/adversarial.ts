/**
 * Adversarial Robustness — 4-layer defense against Gene Map poisoning.
 * L1: Reputation scoring, L2: Multi-agent verification,
 * L3: Anomaly detection, L4: Auto-rollback.
 */
import type Database from 'better-sqlite3';

export interface ReputationInfo { agentId: string; reputation: number; totalReports: number; successfulReports: number }
export interface VerificationResult { geneId: number; verifiedBy: number; required: number; isVerified: boolean }
export interface RollbackCheck { shouldRollback: boolean; reason?: string; failureCount?: number }

export class AdversarialDefense {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS agent_reputation (agent_id TEXT PRIMARY KEY, reputation REAL DEFAULT 0.5, total_reports INTEGER DEFAULT 0, successful_reports INTEGER DEFAULT 0, updated_at INTEGER DEFAULT (unixepoch()))`);
    db.exec(`CREATE TABLE IF NOT EXISTS gene_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, gene_id INTEGER NOT NULL, agent_id TEXT NOT NULL, success INTEGER NOT NULL, verified_at INTEGER DEFAULT (unixepoch()), UNIQUE(gene_id, agent_id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS gene_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, gene_id INTEGER NOT NULL, q_value REAL NOT NULL, strategy TEXT NOT NULL, params TEXT DEFAULT '{}', snapshot_at INTEGER DEFAULT (unixepoch()))`);
  }

  // ═══ Layer 1: Reputation ═══
  getReputation(agentId: string): ReputationInfo {
    const r = this.db.prepare('SELECT * FROM agent_reputation WHERE agent_id = ?').get(agentId) as any;
    if (!r) return { agentId, reputation: 0.5, totalReports: 0, successfulReports: 0 };
    return { agentId: r.agent_id, reputation: r.reputation, totalReports: r.total_reports, successfulReports: r.successful_reports };
  }

  updateReputation(agentId: string, success: boolean): void {
    this.db.prepare(`INSERT INTO agent_reputation (agent_id) VALUES (?) ON CONFLICT(agent_id) DO NOTHING`).run(agentId);
    const delta = success ? 0.05 : -0.1;
    this.db.prepare(`UPDATE agent_reputation SET reputation = MAX(0.0, MIN(1.0, reputation + ?)), total_reports = total_reports + 1, successful_reports = successful_reports + ?, updated_at = unixepoch() WHERE agent_id = ?`).run(delta, success ? 1 : 0, agentId);
  }

  isTrusted(agentId: string): boolean { return this.getReputation(agentId).reputation >= 0.3; }

  // ═══ Layer 2: Multi-Agent Verification ═══
  verifyGene(geneId: number, agentId: string, success: boolean): VerificationResult {
    this.db.prepare(`INSERT INTO gene_verifications (gene_id, agent_id, success) VALUES (?,?,?) ON CONFLICT(gene_id, agent_id) DO UPDATE SET success = excluded.success, verified_at = unixepoch()`).run(geneId, agentId, success ? 1 : 0);
    return this.getVerificationStatus(geneId);
  }

  getVerificationStatus(geneId: number, required = 3): VerificationResult {
    const cnt = (this.db.prepare('SELECT COUNT(DISTINCT agent_id) as cnt FROM gene_verifications WHERE gene_id = ? AND success = 1').get(geneId) as any)?.cnt || 0;
    return { geneId, verifiedBy: cnt, required, isVerified: cnt >= required };
  }

  // ═══ Layer 3: Anomaly Detection ═══
  detectAnomaly(geneId: number, newQValue: number, threshold = 0.3): boolean {
    const cur = this.db.prepare('SELECT q_value FROM genes WHERE id = ?').get(geneId) as any;
    if (!cur) return false;
    return Math.abs(newQValue - cur.q_value) > threshold;
  }

  checkQValueStability(geneId: number): { stable: boolean; variance: number } {
    const snaps = this.db.prepare('SELECT q_value FROM gene_snapshots WHERE gene_id = ? ORDER BY snapshot_at DESC LIMIT 10').all(geneId) as any[];
    if (snaps.length < 3) return { stable: true, variance: 0 };
    const vals = snaps.map((s: any) => s.q_value);
    const mean = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
    const variance = vals.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / vals.length;
    return { stable: variance < 0.05, variance };
  }

  takeSnapshot(geneId: number): void {
    const gene = this.db.prepare('SELECT id, q_value, strategy, params FROM genes WHERE id = ?').get(geneId) as any;
    if (!gene) return;
    this.db.prepare('INSERT INTO gene_snapshots (gene_id, q_value, strategy, params) VALUES (?,?,?,?)').run(geneId, gene.q_value, gene.strategy, gene.params || '{}');
    this.db.prepare('DELETE FROM gene_snapshots WHERE gene_id = ? AND id NOT IN (SELECT id FROM gene_snapshots WHERE gene_id = ? ORDER BY snapshot_at DESC LIMIT 20)').run(geneId, geneId);
  }

  // ═══ Layer 4: Auto-Rollback ═══
  checkRollback(geneId: number, maxFails = 3): RollbackCheck {
    const recent = this.db.prepare('SELECT agent_id, success FROM gene_verifications WHERE gene_id = ? ORDER BY verified_at DESC LIMIT ?').all(geneId, maxFails) as any[];
    if (recent.length < maxFails) return { shouldRollback: false };
    const allFailed = recent.every((v: any) => v.success === 0);
    const uniqueAgents = new Set(recent.map((v: any) => v.agent_id)).size;
    if (allFailed && uniqueAgents >= 2) return { shouldRollback: true, reason: `${maxFails} consecutive failures from ${uniqueAgents} agents`, failureCount: maxFails };
    return { shouldRollback: false };
  }

  rollback(geneId: number): boolean {
    const snap = this.db.prepare('SELECT * FROM gene_snapshots WHERE gene_id = ? AND q_value > 0.3 ORDER BY snapshot_at DESC LIMIT 1').get(geneId) as any;
    if (!snap) return false;
    this.db.prepare('UPDATE genes SET q_value = ?, strategy = ?, params = ?, consecutive_failures = 0 WHERE id = ?').run(snap.q_value, snap.strategy, snap.params, geneId);
    return true;
  }

  getStats() {
    const a = (this.db.prepare('SELECT COUNT(*) as c FROM agent_reputation').get() as any).c;
    const t = (this.db.prepare('SELECT COUNT(*) as c FROM agent_reputation WHERE reputation >= 0.3').get() as any).c;
    const u = (this.db.prepare('SELECT COUNT(*) as c FROM agent_reputation WHERE reputation < 0.3').get() as any).c;
    const v = (this.db.prepare('SELECT COUNT(*) as c FROM gene_verifications').get() as any).c;
    const vg = (this.db.prepare('SELECT COUNT(DISTINCT gene_id) as c FROM (SELECT gene_id FROM gene_verifications WHERE success = 1 GROUP BY gene_id HAVING COUNT(DISTINCT agent_id) >= 3)').get() as any).c;
    const s = (this.db.prepare('SELECT COUNT(*) as c FROM gene_snapshots').get() as any).c;
    return { totalAgents: a, trustedAgents: t, untrustedAgents: u, totalVerifications: v, verifiedGenes: vg, totalSnapshots: s };
  }
}
