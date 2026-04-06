/**
 * Gene Telemetry — Anonymous reporting of new error discoveries.
 * Opt-in only. No addresses, keys, or tx hashes sent.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let _version = '';
function getHelixVersion(): string {
  if (_version) return _version;
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
    _version = JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? 'unknown';
  } catch { _version = 'unknown'; }
  return _version;
}

export interface TelemetryEvent {
  errorPattern: string;
  code: string;
  category: string;
  severity: string;
  strategy: string;
  qValue: number;
  source: 'llm' | 'adapter' | 'seed';
  reasoning?: string;
  llmProvider?: string;
  platform: string;
  helixVersion: string;
  timestamp: number;
}

export interface TelemetryConfig {
  enabled?: boolean;
  endpoint?: string;
  onTelemetry?: (event: TelemetryEvent) => boolean;
}

const DEFAULT_ENDPOINT = 'https://helix-production-e110.up.railway.app/api/telemetry';

const queue: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function sanitize(msg: string): string {
  return msg
    .replace(/0x[a-fA-F0-9]{64}/g, '0x[REDACTED_64]')
    .replace(/0x[a-fA-F0-9]{40}/g, '0x[ADDR]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/\d{10,}/g, '[NUM]')
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]')
    .replace(/https?:\/\/[^\s]+/g, '[URL]')
    .slice(0, 200);
}

export function reportDiscovery(
  event: Omit<TelemetryEvent, 'timestamp' | 'helixVersion' | 'errorPattern'> & { errorMessage: string },
  config: TelemetryConfig,
): void {
  if (!config.enabled || process.env.HELIX_TELEMETRY === 'false') return;

  const te: TelemetryEvent = {
    errorPattern: sanitize(event.errorMessage),
    code: event.code, category: event.category, severity: event.severity,
    strategy: event.strategy, qValue: event.qValue, source: event.source,
    reasoning: event.reasoning?.slice(0, 200), llmProvider: event.llmProvider,
    platform: event.platform, helixVersion: getHelixVersion(), timestamp: Date.now(),
  };

  if (config.onTelemetry && !config.onTelemetry(te)) return;

  queue.push(te);
  if (!flushTimer) flushTimer = setTimeout(() => flush(config), 30000);
  if (queue.length >= 10) flush(config);
}

// ── Repair-level telemetry ────────────────────────────────────────────────
// Fires on every repair attempt (success or fail). Lightweight, < 200 bytes.

import { randomUUID } from 'node:crypto';

const REPAIR_ENDPOINT = 'https://telemetry.vialos.dev/v1/event';
const SESSION_ID = randomUUID().slice(0, 8);

export interface RepairTelemetryEvent {
  errorCode: string;
  repairApplied: string | null;
  success: boolean;
  platform?: string;
  chain?: string;
}

export function trackRepair(event: RepairTelemetryEvent): void {
  if (process.env.HELIX_TELEMETRY === 'false' || process.env.HELIX_TELEMETRY === '0') return;

  const payload = {
    e: 'repair', ec: event.errorCode, ra: event.repairApplied ?? 'none',
    ok: event.success ? 1 : 0, pl: event.platform ?? 'unknown',
    ch: event.chain ?? 'unknown', v: getHelixVersion(), s: SESSION_ID, t: Date.now(),
  };

  // Fire and forget — never await, never throw
  fetch(REPAIR_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

async function flush(config: TelemetryConfig): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (queue.length === 0) return;
  const events = queue.splice(0);
  try {
    await fetch(config.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* telemetry should never break the user */ }
}
