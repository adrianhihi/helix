/**
 * OpenTelemetry integration for Helix.
 *
 * Optional — only active when user provides tracer/meter.
 * @opentelemetry packages are NOT required dependencies.
 */

export interface OtelConfig {
  /** OpenTelemetry Tracer instance. If not provided, tracing is disabled. */
  tracer?: any;
  /** OpenTelemetry Meter instance. If not provided, metrics are disabled. */
  meter?: any;
  /** Service name for span attributes. Default: 'helix' */
  serviceName?: string;
}

interface SpanLike {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
}

interface CounterLike {
  add(value: number, attributes?: Record<string, string | number | boolean>): void;
}

interface HistogramLike {
  record(value: number, attributes?: Record<string, string | number | boolean>): void;
}

export class HelixOtel {
  private tracer: any;
  private meter: any;
  private serviceName: string;
  private repairCounter?: CounterLike;
  private immuneCounter?: CounterLike;
  private failureCounter?: CounterLike;
  private repairDuration?: HistogramLike;

  constructor(config?: OtelConfig) {
    this.tracer = config?.tracer;
    this.meter = config?.meter;
    this.serviceName = config?.serviceName ?? 'helix';

    if (this.meter) {
      this.repairCounter = this.meter.createCounter('helix.repair.count', { description: 'Total repairs attempted' });
      this.immuneCounter = this.meter.createCounter('helix.immune.count', { description: 'Total IMMUNE hits' });
      this.failureCounter = this.meter.createCounter('helix.failure.count', { description: 'Total unresolved failures' });
      this.repairDuration = this.meter.createHistogram('helix.repair.duration_ms', { description: 'Repair duration in ms', unit: 'ms' });
    }
  }

  startRepairSpan(errorMessage: string): SpanLike | null {
    if (!this.tracer) return null;
    return this.tracer.startSpan('helix.repair', {
      attributes: { 'helix.service': this.serviceName, 'helix.error.message': errorMessage.slice(0, 200) },
    });
  }

  addStageEvent(span: SpanLike | null, stage: string, attributes?: Record<string, string | number | boolean>): void {
    if (!span) return;
    span.addEvent(`helix.pcec.${stage}`, attributes);
  }

  endRepairSpan(span: SpanLike | null, result: { success: boolean; immune: boolean; strategy?: string; code?: string; category?: string; totalMs: number; qValue?: number }): void {
    if (!span) return;
    span.setAttribute('helix.result.success', result.success);
    span.setAttribute('helix.result.immune', result.immune);
    if (result.strategy) span.setAttribute('helix.result.strategy', result.strategy);
    if (result.code) span.setAttribute('helix.failure.code', result.code);
    if (result.category) span.setAttribute('helix.failure.category', result.category);
    span.setAttribute('helix.result.duration_ms', result.totalMs);
    if (result.qValue !== undefined) span.setAttribute('helix.gene.q_value', result.qValue);
    span.setStatus({ code: result.success ? 1 : 2, message: result.success ? `Repaired via ${result.strategy}` : `Failed: ${result.code}` });
    span.end();
  }

  recordRepair(attrs: { success: boolean; immune: boolean; strategy?: string; code?: string; durationMs: number }): void {
    const labels = { 'helix.failure.code': attrs.code ?? 'unknown', 'helix.strategy': attrs.strategy ?? 'none' };
    if (attrs.success) {
      if (attrs.immune) this.immuneCounter?.add(1, labels);
      this.repairCounter?.add(1, { ...labels, 'helix.result': 'success' });
    } else {
      this.failureCounter?.add(1, labels);
      this.repairCounter?.add(1, { ...labels, 'helix.result': 'failure' });
    }
    this.repairDuration?.record(attrs.durationMs, labels);
  }

  get tracingEnabled(): boolean { return !!this.tracer; }
  get metricsEnabled(): boolean { return !!this.meter; }
}

export const NOOP_OTEL = new HelixOtel();
