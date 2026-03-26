import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AdaptiveWeights, type DimensionWeights } from '../src/engine/adaptive-weights.js';

describe('Adaptive Evaluate Weights', () => {
  let db: Database.Database;
  let aw: AdaptiveWeights;

  beforeEach(() => { db = new Database(':memory:'); aw = new AdaptiveWeights(db); });
  afterEach(() => db.close());

  it('returns defaults when no data', () => {
    const w = aw.getWeights('nonce');
    expect(w.accuracy).toBe(0.25);
    expect(w.safety).toBe(0.25);
  });

  it('weights sum to ~1.0', () => {
    const w = aw.getWeights('nonce');
    expect(w.accuracy + w.cost + w.latency + w.safety + w.transferability + w.reliability).toBeCloseTo(1.0, 1);
  });

  it('update changes weights on success', () => {
    aw.update('nonce', { accuracy: 0.9, cost: 0.1, latency: 0.5, safety: 0.9, transferability: 0.1, reliability: 0.5 }, true);
    expect(aw.getWeights('nonce')).not.toEqual(aw.getDefaults());
  });

  it('update changes weights on failure', () => {
    aw.update('gas', { accuracy: 0.9, cost: 0.1, latency: 0.5, safety: 0.9, transferability: 0.1, reliability: 0.5 }, false);
    expect(aw.getWeights('gas')).not.toEqual(aw.getDefaults());
  });

  it('stays normalized after many updates', () => {
    for (let i = 0; i < 10; i++) aw.update('nonce', { accuracy: 0.9, cost: 0.1, latency: 0.8, safety: 0.9, transferability: 0.1, reliability: 0.5 }, Math.random() > 0.3);
    const w = aw.getWeights('nonce');
    expect(w.accuracy + w.cost + w.latency + w.safety + w.transferability + w.reliability).toBeCloseTo(1.0, 1);
  });

  it('no weight below 0.02 floor', () => {
    for (let i = 0; i < 20; i++) aw.update('test', { accuracy: 1.0, cost: 0.0, latency: 0.0, safety: 1.0, transferability: 0.0, reliability: 0.0 }, true);
    const w = aw.getWeights('test');
    expect(w.cost).toBeGreaterThanOrEqual(0.02);
    expect(w.transferability).toBeGreaterThanOrEqual(0.02);
  });

  it('different categories get different weights', () => {
    aw.update('nonce', { accuracy: 0.9, cost: 0.1, latency: 0.5, safety: 0.9, transferability: 0.1, reliability: 0.5 }, true);
    aw.update('gas', { accuracy: 0.1, cost: 0.9, latency: 0.9, safety: 0.1, transferability: 0.5, reliability: 0.5 }, true);
    expect(aw.getWeights('nonce').accuracy).not.toBe(aw.getWeights('gas').accuracy);
  });

  it('getAllWeights includes global', () => {
    aw.update('nonce', { accuracy: 0.5, cost: 0.5, latency: 0.5, safety: 0.5, transferability: 0.5, reliability: 0.5 }, true);
    expect(Object.keys(aw.getAllWeights())).toContain('global');
  });

  it('getHistory records changes', () => {
    aw.update('nonce', { accuracy: 0.9, cost: 0.1, latency: 0.1, safety: 0.9, transferability: 0.1, reliability: 0.1 }, true);
    expect(aw.getHistory().length).toBeGreaterThan(0);
  });

  it('reset removes category', () => {
    aw.update('nonce', { accuracy: 0.5, cost: 0.5, latency: 0.5, safety: 0.5, transferability: 0.5, reliability: 0.5 }, true);
    aw.reset('nonce');
    expect(aw.getWeights('nonce').accuracy).toBe(0.25);
  });

  it('getDefaults returns fixed values', () => {
    const d = aw.getDefaults();
    expect(d.accuracy + d.cost + d.latency + d.safety + d.transferability + d.reliability).toBeCloseTo(1.0, 2);
  });
});
