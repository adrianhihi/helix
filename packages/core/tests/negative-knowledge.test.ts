import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NegativeKnowledge } from '../src/engine/negative-knowledge.js';

describe('Negative Knowledge', () => {
  let db: Database.Database;
  let nk: NegativeKnowledge;

  beforeEach(() => { db = new Database(':memory:'); nk = new NegativeKnowledge(db); });
  afterEach(() => db.close());

  it('record stores anti-pattern', () => {
    nk.record('nonce', 'nonce', 'reduce_request', 'wrong strategy');
    expect(nk.count()).toBe(1);
  });

  it('getPenalty returns 1.0 for unknown', () => {
    expect(nk.getPenalty('x', 'y', 'z')).toBe(1.0);
  });

  it('getPenalty returns 0.5 for 1 observation', () => {
    nk.record('n', 'n', 'r');
    expect(nk.getPenalty('n', 'n', 'r')).toBe(0.5);
  });

  it('getPenalty returns 0.35 for 2 observations', () => {
    nk.record('n', 'n', 'r');
    nk.record('n', 'n', 'r');
    expect(nk.getPenalty('n', 'n', 'r')).toBe(0.35);
  });

  it('getPenalty returns 0.3 for 3+ observations', () => {
    nk.record('n', 'n', 'r');
    nk.record('n', 'n', 'r');
    nk.record('n', 'n', 'r');
    expect(nk.getPenalty('n', 'n', 'r')).toBe(0.3);
  });

  it('never fully excludes (always > 0)', () => {
    for (let i = 0; i < 10; i++) nk.record('x', 'y', 'z');
    expect(nk.getPenalty('x', 'y', 'z')).toBeGreaterThan(0);
  });

  it('getForError returns matching', () => {
    nk.record('a', 'b', 'c');
    nk.record('a', 'b', 'd');
    nk.record('x', 'y', 'z');
    expect(nk.getForError('a', 'b').length).toBe(2);
  });

  it('observation_count increments on duplicate', () => {
    nk.record('a', 'b', 'c');
    nk.record('a', 'b', 'c');
    nk.record('a', 'b', 'c');
    const all = nk.getAll();
    expect(all.length).toBe(1);
    expect(all[0].observationCount).toBe(3);
  });
});
