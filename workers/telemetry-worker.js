/**
 * Cloudflare Worker: Helix Telemetry Endpoint
 * POST https://telemetry.vialos.dev/v1/event
 *
 * Stores to KV: repair:YYYY-MM-DD:errorCode:repair:success → count
 * Drops IP before storage (never logs request IP)
 */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    try {
      const body = await request.json();
      if (!body.ec || typeof body.ok !== 'number') return new Response('Invalid payload', { status: 400 });

      const date = new Date().toISOString().slice(0, 10);
      const key = `repair:${date}:${body.ec}:${body.ra}:${body.ok}`;
      const existing = await env.HELIX_TELEMETRY.get(key);
      await env.HELIX_TELEMETRY.put(key, String((parseInt(existing || '0')) + 1), { expirationTtl: 60 * 60 * 24 * 90 });

      const sessionKey = `session:${date}:${body.s}`;
      await env.HELIX_TELEMETRY.put(sessionKey, '1', { expirationTtl: 60 * 60 * 24 * 2 });

      return new Response('ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch { return new Response('Error', { status: 500 }); }
  },
};
