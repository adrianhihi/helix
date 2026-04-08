/**
 * Vial Self-Healing Hook v0.2
 *
 * Uses OpenClaw native hooks: after_tool_call, agent:turn:complete, agent:bootstrap
 * Injection via: openclaw agent --message (no Clawdi API needed)
 */

import { execSync } from 'child_process';
import { appendFileSync } from 'fs';

const TELEMETRY = 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event';
const VIAL_LOG = '/tmp/vial.log';

const sessions = new Map<string, { textOnlyTurns: number; lastActivity: number; sessionKey: string }>();

function vialLog(entry: string) {
  try { appendFileSync(VIAL_LOG, `${entry}|${Math.floor(Date.now() / 1000)}\n`); } catch {}
}

async function telem(ec: string, ok: boolean) {
  try { await fetch(TELEMETRY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ e: 'vial_repair', ec, ok, src: 'clawdi_hook' }) }); } catch {}
}

function injectMessage(agentId: string, message: string) {
  try {
    execSync(`openclaw agent --agent ${agentId} --message "${message.replace(/"/g, '\\"')}" --json 2>/dev/null`, { timeout: 5000, stdio: 'ignore' });
  } catch { vialLog(`VIAL_INJECT_FAILED|${agentId}`); }
}

export default {
  name: 'vial-self-healing',
  version: '0.2.0',

  register(api: any) {
    console.log('[Vial] Hook v0.2 registering...');

    // after_tool_call — detect auth/rate/timeout errors
    api.hooks?.on('after_tool_call', async (ctx: any) => {
      const sessionKey = ctx.sessionKey || 'unknown';
      const agentId = ctx.agentId || 'main';
      const toolName = ctx.toolName || 'unknown';
      const result = JSON.stringify(ctx.result || '').toLowerCase();

      const state = sessions.get(sessionKey);
      if (state) { state.textOnlyTurns = 0; state.lastActivity = Date.now(); }

      if (result.includes('401') || result.includes('unauthorized') || result.includes('token expired') || result.includes('403')) {
        vialLog(`VIAL_4_AUTH|${toolName}`);
        await telem('auth_401', false);
        injectMessage(agentId, `[VIAL Protocol 4] Auth error on ${toolName}. Classify as auth_401 and trigger re-auth via connector login flow.`);
      }
      if (result.includes('429') || result.includes('rate limit') || result.includes('quota exceeded')) {
        vialLog(`VIAL_3_RATE|${toolName}`);
        await telem('rate_429', false);
        injectMessage(agentId, `[VIAL Protocol 3] Rate limit on ${toolName}. Wait 30 seconds then retry once.`);
      }
      if (result.includes('timeout') || result.includes('econnreset') || result.includes('disconnected')) {
        vialLog(`VIAL_5_SESSION|${toolName}`);
        await telem('timeout', false);
        injectMessage(agentId, `[VIAL Protocol 5] Connection error on ${toolName}. Wait 5 seconds and retry once.`);
      }
    });

    // agent:turn:complete — loop detection
    api.hooks?.on('agent:turn:complete', async (ctx: any) => {
      const sessionKey = ctx.sessionKey || 'unknown';
      const agentId = ctx.agentId || 'main';
      const hadTools = (ctx.toolCalls || []).length > 0;

      if (!sessions.has(sessionKey)) sessions.set(sessionKey, { textOnlyTurns: 0, lastActivity: Date.now(), sessionKey });
      const state = sessions.get(sessionKey)!;
      state.lastActivity = Date.now();

      if (!hadTools) {
        state.textOnlyTurns++;
        if (state.textOnlyTurns >= 2) {
          vialLog(`VIAL_1_LOOP|session=${sessionKey}|turns=${state.textOnlyTurns}`);
          await telem('loop_detected', false);
          injectMessage(agentId, `[VIAL Protocol 1] Loop detected: ${state.textOnlyTurns} text-only turns. STOP explaining. Execute the pending task NOW.`);
          state.textOnlyTurns = 0;
        }
      } else {
        state.textOnlyTurns = 0;
      }
    });

    // agent:bootstrap — session init
    api.hooks?.on('agent:bootstrap', (ctx: any) => {
      const sessionKey = ctx.sessionKey || 'unknown';
      sessions.set(sessionKey, { textOnlyTurns: 0, lastActivity: Date.now(), sessionKey });
    });

    // Cleanup stale sessions every 30 min
    setInterval(() => {
      const cutoff = Date.now() - 2 * 3600000;
      for (const [key, state] of sessions.entries()) if (state.lastActivity < cutoff) sessions.delete(key);
    }, 30 * 60000);

    console.log('[Vial] Hook v0.2 ready — after_tool_call, agent:turn:complete, agent:bootstrap');
  },
};
