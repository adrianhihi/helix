import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HelixOtel, NOOP_OTEL } from '../src/engine/otel.js';
import { GeneMap } from '../src/engine/gene-map.js';

describe('OpenTelemetry', () => {
  it('NOOP_OTEL has tracing/metrics disabled', () => {
    expect(NOOP_OTEL.tracingEnabled).toBe(false);
    expect(NOOP_OTEL.metricsEnabled).toBe(false);
  });

  it('startRepairSpan returns null when no tracer', () => {
    expect(NOOP_OTEL.startRepairSpan('test')).toBeNull();
  });

  it('no-op methods do not throw', () => {
    NOOP_OTEL.addStageEvent(null, 'perceive', { code: 'test' });
    NOOP_OTEL.endRepairSpan(null, { success: true, immune: false, totalMs: 5 });
    NOOP_OTEL.recordRepair({ success: true, immune: false, durationMs: 5 });
  });

  it('creates span and metrics when tracer/meter provided', () => {
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn(), addEvent: vi.fn() };
    const mockTracer = { startSpan: vi.fn(() => mockSpan) };
    const mockCounter = { add: vi.fn() };
    const mockHistogram = { record: vi.fn() };
    const mockMeter = { createCounter: vi.fn(() => mockCounter), createHistogram: vi.fn(() => mockHistogram) };

    const otel = new HelixOtel({ tracer: mockTracer, meter: mockMeter });
    expect(otel.tracingEnabled).toBe(true);
    expect(otel.metricsEnabled).toBe(true);

    const span = otel.startRepairSpan('nonce mismatch');
    expect(span).not.toBeNull();
    expect(mockTracer.startSpan).toHaveBeenCalledWith('helix.repair', expect.any(Object));

    otel.addStageEvent(span, 'perceive', { code: 'nonce' });
    expect(mockSpan.addEvent).toHaveBeenCalledWith('helix.pcec.perceive', { code: 'nonce' });

    otel.endRepairSpan(span, { success: true, immune: true, strategy: 'refresh_nonce', totalMs: 5, code: 'nonce', category: 'sig' });
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('helix.result.success', true);
    expect(mockSpan.end).toHaveBeenCalled();

    otel.recordRepair({ success: true, immune: true, strategy: 'refresh_nonce', code: 'nonce', durationMs: 5 });
    expect(mockCounter.add).toHaveBeenCalled();
    expect(mockHistogram.record).toHaveBeenCalledWith(5, expect.any(Object));
  });

  it('serviceName defaults to helix', () => {
    const mockTracer = { startSpan: vi.fn(() => ({ setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn(), addEvent: vi.fn() })) };
    const otel = new HelixOtel({ tracer: mockTracer });
    otel.startRepairSpan('test');
    expect(mockTracer.startSpan).toHaveBeenCalledWith('helix.repair', expect.objectContaining({
      attributes: expect.objectContaining({ 'helix.service': 'helix' }),
    }));
  });

  it('custom serviceName is used', () => {
    const mockTracer = { startSpan: vi.fn(() => ({ setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn(), addEvent: vi.fn() })) };
    const otel = new HelixOtel({ tracer: mockTracer, serviceName: 'my-payment-svc' });
    otel.startRepairSpan('test');
    expect(mockTracer.startSpan).toHaveBeenCalledWith('helix.repair', expect.objectContaining({
      attributes: expect.objectContaining({ 'helix.service': 'my-payment-svc' }),
    }));
  });
});

describe('Audit Log', () => {
  let gm: GeneMap;

  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('recordAudit stores entry', () => {
    gm.recordAudit({
      agentId: 'test-agent', errorMessage: 'nonce mismatch',
      failureCode: 'verification-failed', failureCategory: 'signature',
      strategy: 'refresh_nonce', immune: true, success: true,
      mode: 'auto', durationMs: 5,
    });

    const log = gm.getAuditLog(10);
    expect(log.length).toBe(1);
    expect(log[0].agentId).toBe('test-agent');
    expect(log[0].failureCode).toBe('verification-failed');
    expect(log[0].strategy).toBe('refresh_nonce');
    expect(log[0].immune).toBe(true);
    expect(log[0].success).toBe(true);
  });

  it('getAuditLog respects limit and orders by recent first', () => {
    for (let i = 0; i < 30; i++) {
      gm.recordAudit({
        agentId: 'agent', errorMessage: `error ${i}`,
        failureCode: 'test', failureCategory: 'test',
        strategy: 'retry', immune: false, success: true,
        mode: 'auto', durationMs: i,
      });
    }

    const log = gm.getAuditLog(5);
    expect(log.length).toBe(5);
  });

  it('exportAudit returns JSON', () => {
    gm.recordAudit({
      agentId: 'agent', errorMessage: 'test',
      failureCode: 'test', failureCategory: 'test',
      strategy: 'retry', immune: false, success: true,
      mode: 'auto', durationMs: 10,
      overrides: { nonce: 7 },
      chainSteps: ['refresh_nonce', 'speed_up'],
    });

    const json = gm.exportAudit();
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(1);
    expect(parsed[0].agent_id).toBe('agent');
  });

  it('exportAudit with since filter', () => {
    const now = Date.now();
    gm.recordAudit({
      agentId: 'old', errorMessage: 'old',
      failureCode: 'test', failureCategory: 'test',
      strategy: 'retry', immune: false, success: true,
      mode: 'auto', durationMs: 10,
    });

    const json = gm.exportAudit(now + 1000);
    expect(JSON.parse(json).length).toBe(0);
  });

  it('audit with chain steps and predictions', () => {
    gm.recordAudit({
      agentId: 'chain', errorMessage: 'compound',
      failureCode: 'nonce', failureCategory: 'sig',
      strategy: 'refresh_nonce+speed_up', immune: false, success: true,
      mode: 'auto', durationMs: 200,
      chainSteps: ['refresh_nonce', 'speed_up'],
      predictions: [{ code: 'gas', probability: 0.7 }],
    });

    const json = gm.exportAudit();
    const parsed = JSON.parse(json);
    expect(JSON.parse(parsed[0].chain_steps)).toEqual(['refresh_nonce', 'speed_up']);
    expect(JSON.parse(parsed[0].predictions)).toEqual([{ code: 'gas', probability: 0.7 }]);
  });
});

describe('PCEC audit integration', () => {
  it('repair() writes audit entry', async () => {
    const { PcecEngine } = await import('../src/engine/pcec.js');
    const gm = new GeneMap(':memory:');
    const engine = new PcecEngine(gm, 'audit-test', { mode: 'auto' } as any);

    const { defaultAdapters } = await import('../src/platforms/index.js');
    for (const a of defaultAdapters) engine.registerAdapter(a);

    await engine.repair(new Error('nonce mismatch'));

    const log = gm.getAuditLog(10);
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0].agentId).toBe('audit-test');

    gm.close();
  });
});
