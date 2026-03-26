import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CausalGraph } from '../src/engine/causal-graph.js';

describe('Causal Repair Graph', () => {
  let db: Database.Database;
  let cg: CausalGraph;

  beforeEach(() => { db = new Database(':memory:'); cg = new CausalGraph(db); });
  afterEach(() => db.close());

  it('recordOccurrence stores event', () => {
    cg.recordOccurrence('nonce-mismatch', 'nonce', 'agent-1');
    expect(db.prepare('SELECT COUNT(*) as cnt FROM causal_events').get() as any).toEqual({ cnt: 1 });
  });

  it('recordCausation builds edge when two errors within window', () => {
    cg.recordOccurrence('nonce-mismatch', 'nonce');
    const edges = cg.recordCausation('gas-spike', 'gas');
    expect(edges.length).toBeGreaterThan(0);
    expect((db.prepare('SELECT COUNT(*) as cnt FROM causal_edges').get() as any).cnt).toBe(1);
  });

  it('no causation when errors > window apart', () => {
    db.prepare('INSERT INTO causal_events (code, category, timestamp) VALUES (?,?,?)').run('old', 'old', Date.now() - 120000);
    expect(cg.recordCausation('new', 'new', 60000).length).toBe(0);
  });

  it('observations increment on repeat', () => {
    cg.recordOccurrence('a', 'x');
    cg.recordCausation('b', 'y');
    cg.recordOccurrence('a', 'x');
    cg.recordCausation('b', 'y');
    expect((db.prepare('SELECT observations FROM causal_edges').get() as any).observations).toBe(2);
  });

  it('predict returns likely next errors', () => {
    cg.recordOccurrence('a', 'x');
    cg.recordCausation('b', 'y');
    cg.recordOccurrence('a', 'x');
    cg.recordCausation('b', 'y');
    const p = cg.predict('a', 'x', 0);
    expect(p.length).toBeGreaterThan(0);
    expect(p[0].code).toBe('b');
  });

  it('getCausalChain traverses multiple levels', () => {
    cg.recordOccurrence('a', 'x');
    cg.recordCausation('b', 'x');
    cg.recordOccurrence('b', 'x');
    cg.recordCausation('c', 'x');
    const chain = cg.getCausalChain('a', 'x');
    expect(chain.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('getFullGraph returns nodes and edges', () => {
    cg.recordOccurrence('x', 'y');
    cg.recordCausation('z', 'w');
    const g = cg.getFullGraph();
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it('cleanup removes old events', () => {
    db.prepare('INSERT INTO causal_events (code, category, timestamp) VALUES (?,?,?)').run('old', 'old', Date.now() - 40 * 86400000);
    cg.recordOccurrence('new', 'new');
    expect(cg.cleanup(30)).toBe(1);
    expect((db.prepare('SELECT COUNT(*) as cnt FROM causal_events').get() as any).cnt).toBe(1);
  });
});
