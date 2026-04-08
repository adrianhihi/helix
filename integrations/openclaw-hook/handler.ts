/**
 * Vial Self-Healing Hook for OpenClaw
 * Gateway-layer loop detection and error interception.
 *
 * Events: agent:bootstrap, command:new, command:reset
 */

import { appendFileSync, existsSync, readFileSync } from 'fs';

const VIAL_LOG = '/tmp/vial.log';
const TELEMETRY_URL = 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event';

const sessionTracker = new Map<string, { textOnlyTurns: number; lastTurnAt: number }>();

function log(message: string) {
  const ts = Math.floor(Date.now() / 1000);
  const line = `${message}|${ts}`;
  try { appendFileSync(VIAL_LOG, line + '\n'); } catch {}
  console.log(`[Vial Hook] ${line}`);
}

async function telemetry(ec: string, p: number, ok: boolean) {
  try {
    await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ e: 'vial_repair', ec, p, ok, src: 'clawdi_hook' }),
    });
  } catch {}
}

export default {
  name: 'vial-self-healing',

  onSessionStart(ctx: any) {
    const key = ctx.sessionKey || ctx.session?.key || 'unknown';
    sessionTracker.set(key, { textOnlyTurns: 0, lastTurnAt: Date.now() });

    const recentLog = existsSync(VIAL_LOG)
      ? readFileSync(VIAL_LOG, 'utf8').split('\n').slice(-5).join('\n')
      : 'no repairs yet';

    log(`VIAL_HOOK_SESSION_START|session=${key}`);
    return { vialStatus: `Vial hook active. Recent: ${recentLog}` };
  },

  onBootstrap(ctx: any) {
    const key = ctx.sessionKey || 'unknown';
    log(`VIAL_HOOK_BOOTSTRAP|session=${key}`);
  },

  onTurnComplete(ctx: any) {
    const key = ctx.sessionKey || ctx.session?.key || 'unknown';
    const hasTools = (ctx.toolCalls || ctx.tools || []).length > 0;

    if (!sessionTracker.has(key)) {
      sessionTracker.set(key, { textOnlyTurns: 0, lastTurnAt: Date.now() });
    }
    const state = sessionTracker.get(key)!;
    state.lastTurnAt = Date.now();

    if (hasTools) {
      if (state.textOnlyTurns > 0) log(`VIAL_HOOK_LOOP_RESOLVED|session=${key}|after=${state.textOnlyTurns}turns`);
      state.textOnlyTurns = 0;
    } else {
      state.textOnlyTurns++;
      log(`VIAL_HOOK_TEXT_ONLY|session=${key}|count=${state.textOnlyTurns}`);

      if (state.textOnlyTurns >= 2) {
        log(`VIAL_1_LOOP|session=${key}|inject_interrupt`);
        telemetry('loop_detected', 1, true);
        state.textOnlyTurns = 0;
        return { interrupt: true, injectMessage: '[VIAL] Loop detected: 2+ text-only turns. Execute the task with tools NOW.' };
      }
    }
  },

  onToolError(ctx: any) {
    const { toolName, error } = ctx;
    const msg = String(error?.message || error || '');

    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
      log(`VIAL_3_RATE|tool=${toolName}`);
      telemetry('rate_limit', 3, false);
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('token expired')) {
      log(`VIAL_4_AUTH|tool=${toolName}`);
      telemetry('auth_error', 4, false);
    }
    if (msg.includes('timeout') || msg.includes('disconnected')) {
      log(`VIAL_5_SESSION|tool=${toolName}`);
      telemetry('session_error', 5, false);
    }
  },
};
