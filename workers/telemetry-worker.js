/**
 * Cloudflare Worker: Helix Telemetry + Gene Map API
 *
 * POST /v1/event  — record repair events
 * GET  /v1/repair — lookup best repair strategy from Gene Map
 */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' };

const BASELINE = {
  'auth_401':        { strategy: 'token_refresh',    confidence: 0.75, description: 'Refresh OAuth token via connector login flow' },
  'auth_403':        { strategy: 'scope_missing',    confidence: 0.80, description: 'Inform user to re-grant required permissions' },
  'auth_expired':    { strategy: 'token_refresh',    confidence: 0.90, description: 'Token expired — trigger re-auth immediately' },
  'rate_429':        { strategy: 'retry_after_30s',  confidence: 0.85, description: 'Wait 30s and retry the exact same request' },
  'rate_quota':      { strategy: 'retry_after_60s',  confidence: 0.70, description: 'Quota exceeded — wait 60s before retry' },
  'rate_limit':      { strategy: 'retry_after_30s',  confidence: 0.85, description: 'Rate limited — wait 30s and retry' },
  'loop_detected':   { strategy: 'force_execute',    confidence: 0.95, description: 'Stop text responses — call a tool immediately' },
  'timeout':         { strategy: 'retry_after_5s',   confidence: 0.80, description: 'Wait 5s and retry once silently' },
  'session_error':   { strategy: 'retry_after_5s',   confidence: 0.75, description: 'Session dropped — retry after brief pause' },
  'session_lost':    { strategy: 'retry_after_5s',   confidence: 0.75, description: 'Session dropped — retry after brief pause' },
  'silent_failure':  { strategy: 'verify_and_retry', confidence: 0.85, description: 'Verify outcome then retry if unconfirmed' },
  'task_chain':      { strategy: 'auto_proceed',     confidence: 0.80, description: 'Proceed to next step without confirmation' },
  'task_incomplete': { strategy: 'auto_proceed',     confidence: 0.80, description: 'Proceed to next step without confirmation' },
  'auth_error':      { strategy: 'token_refresh',    confidence: 0.80, description: 'Classify auth error and attempt re-auth' },
  'role_drift':      { strategy: 'delegate_to_specialist', confidence: 0.90, description: 'Orchestrator executing directly — delegate via sessions_spawn' },
  'behavioral_7a':   { strategy: 'execute_immediately',    confidence: 0.85, description: 'Silent abandonment — stop describing, execute now' },
  'behavioral_7b':   { strategy: 'spawn_verification',     confidence: 0.88, description: 'Unverified completion — spawn verification sub-agent' },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ── GET /v1/repair — Gene Map strategy lookup ──
    if (url.pathname === '/v1/repair' && request.method === 'GET') {
      const ec = url.searchParams.get('ec') || 'unknown';
      const platform = url.searchParams.get('platform') || 'unknown';

      // Try aggregated data from KV
      const kvKey = `genemap:${platform}:${ec}`;
      let geneData = null;
      try {
        const stored = await env.HELIX_TELEMETRY.get(kvKey, 'json');
        if (stored && stored.total > 3) geneData = stored;
      } catch {}

      const baseline = BASELINE[ec] || { strategy: 'log_and_inform', confidence: 0.50, description: 'Log the error and inform user with details' };

      let response;
      if (geneData) {
        const successRate = geneData.success / geneData.total;
        response = { strategy: geneData.best_strategy, confidence: parseFloat(successRate.toFixed(2)), based_on: geneData.total, description: geneData.description || baseline.description, source: 'gene_map', platform, ec };
      } else {
        response = { strategy: baseline.strategy, confidence: baseline.confidence, based_on: 0, description: baseline.description, source: 'baseline', platform, ec };
      }

      return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...CORS } });
    }

    // ── GET /v1/event?ec=&p=&ok=&src= — simple query param version ──
    if (url.pathname === '/v1/event' && request.method === 'GET') {
      try {
        const ec = url.searchParams.get('ec') || 'unknown';
        const ok = url.searchParams.get('ok') !== 'false';
        const src = url.searchParams.get('src') || 'unknown';
        const p = parseInt(url.searchParams.get('p') || '0');
        const ra = url.searchParams.get('ra') || 'none';
        const date = new Date().toISOString().slice(0, 10);

        const key = `vial_repair:${date}:${ec}:${ra}:${ok}`;
        const existing = await env.HELIX_TELEMETRY.get(key);
        await env.HELIX_TELEMETRY.put(key, String((parseInt(existing || '0')) + 1), { expirationTtl: 86400 * 90 });

        const platform = src.includes('clawdi') ? 'clawdi' : src;
        const gmKey = `genemap:${platform}:${ec}`;
        const gm = await env.HELIX_TELEMETRY.get(gmKey, 'json') || { total: 0, success: 0, best_strategy: ra, description: '' };
        gm.total += 1;
        if (ok) gm.success += 1;
        if (ra !== 'none') gm.best_strategy = ra;
        await env.HELIX_TELEMETRY.put(gmKey, JSON.stringify(gm));

        return new Response('ok', { status: 200, headers: CORS });
      } catch { return new Response('error', { status: 500, headers: CORS }); }
    }

    // ── POST /v1/event — record repair event ──
    if (url.pathname === '/v1/event' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.e || !body.ec) return new Response('Invalid payload: e and ec required', { status: 400 });

        const date = new Date().toISOString().slice(0, 10);
        const ra = body.ra ?? 'none';
        const ok = body.ok !== undefined ? body.ok : 'unknown';

        // Store daily counter
        const key = `${body.e}:${date}:${body.ec}:${ra}:${ok}`;
        const existing = await env.HELIX_TELEMETRY.get(key);
        await env.HELIX_TELEMETRY.put(key, String((parseInt(existing || '0')) + 1), { expirationTtl: 60 * 60 * 24 * 90 });

        // Store session activity
        if (body.s) {
          await env.HELIX_TELEMETRY.put(`session:${date}:${body.s}`, '1', { expirationTtl: 60 * 60 * 24 * 2 });
        }

        // Aggregate into Gene Map (for /v1/repair lookups)
        if (body.e === 'vial_repair' || body.e === 'repair') {
          const platform = body.src || body.pl || 'unknown';
          const gmKey = `genemap:${platform}:${body.ec}`;
          try {
            const gm = await env.HELIX_TELEMETRY.get(gmKey, 'json') || { total: 0, success: 0, best_strategy: ra, description: '' };
            gm.total += 1;
            if (body.ok === true || body.ok === 1) gm.success += 1;
            if (ra !== 'none') gm.best_strategy = ra;
            await env.HELIX_TELEMETRY.put(gmKey, JSON.stringify(gm));
          } catch {}
        }

        return new Response('ok', { status: 200, headers: CORS });
      } catch { return new Response('Error', { status: 500 }); }
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
