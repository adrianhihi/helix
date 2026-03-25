/**
 * Helix REST API Server
 *
 * Exposes PCEC repair engine over HTTP for cross-language integration.
 * Start: npx helix serve [--port 7842] [--mode observe|auto|full]
 */
import http from 'node:http';
import { PcecEngine } from './engine/pcec.js';
import { GeneMap } from './engine/gene-map.js';
import { defaultAdapters } from './platforms/index.js';
import type { HelixMode } from './engine/types.js';

function mapStrategyToAction(strategy: string): string {
  const m: Record<string, string> = {
    backoff_retry: 'wait_and_retry', renew_session: 'refresh_session',
    refresh_nonce: 'refresh_state', reduce_request: 'reduce_amount',
    speed_up_transaction: 'increase_gas', retry_with_receipt: 'wait_and_retry',
    switch_endpoint: 'switch_endpoint', self_pay_gas: 'fund_gas',
    swap_currency: 'swap_token', retry: 'wait_and_retry',
    hold_and_notify: 'escalate', refund_waterfall: 'escalate',
  };
  return m[strategy] || 'retry';
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString(); });
    req.on('end', () => resolve(body));
  });
}

export interface ApiServerOptions {
  port?: number;
  mode?: HelixMode;
  geneMapPath?: string;
}

export function createApiServer(opts: ApiServerOptions = {}) {
  const port = opts.port ?? 7842;
  const mode = opts.mode ?? 'observe';
  const geneMapPath = opts.geneMapPath ?? './helix-genes.db';

  const geneMap = new GeneMap(geneMapPath);
  const engine = new PcecEngine(geneMap, 'api-server', { mode } as any);
  for (const a of defaultAdapters) engine.registerAdapter(a);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      return res.end();
    }

    // GET /health
    if (path === '/health' && req.method === 'GET') {
      return json(res, { status: 'ok', version: '1.5.0', uptime: process.uptime() });
    }

    // GET /status
    if (path === '/status' && req.method === 'GET') {
      const stats = engine.getStats();
      const health = geneMap.health();
      return json(res, {
        status: 'running',
        mode,
        geneCount: health.totalGenes,
        avgQValue: health.avgQValue,
        totalRepairs: stats.repairs,
        immuneHits: stats.immuneHits,
        savedRevenue: stats.savedRevenue,
        platforms: health.platforms,
        uptime: process.uptime(),
      });
    }

    // GET /genes
    if (path === '/genes' && req.method === 'GET') {
      const genes = geneMap.list();
      const summary = genes.map(g => ({
        failureCode: g.failureCode, category: g.category,
        strategy: g.strategy, qValue: g.qValue,
        qVariance: g.qVariance, successCount: g.successCount,
        platforms: g.platforms, reasoning: g.reasoning, scores: g.scores || {},
      }));
      return json(res, { genes: summary, total: summary.length });
    }

    // POST /repair
    if (path === '/repair' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { error: errorMsg, errorType, agentId, platform, context } = body;

        if (!errorMsg) {
          return json(res, { success: false, error: 'error field is required' }, 400);
        }

        const err = new Error(errorMsg);
        if (errorType) err.name = errorType;

        const startMs = Date.now();
        const result = await engine.repair(err, {
          agentId: agentId || 'rest-api',
          platform: platform || 'generic',
          ...context,
        });
        const repairMs = Date.now() - startMs;

        const strategy = result.winner?.strategy ?? result.gene?.strategy;
        return json(res, {
          success: true,
          failure: {
            code: result.failure.code,
            category: result.failure.category,
            severity: result.failure.severity,
            platform: result.failure.platform,
            rootCause: result.failure.rootCauseHint,
          },
          strategy: strategy ? {
            name: strategy,
            action: mapStrategyToAction(strategy),
            params: result.commitOverrides ?? {},
          } : null,
          repairMs,
          immune: result.immune, scores: (result as any).scores || {},
          candidates: result.candidates.slice(0, 5).map(c => ({
            strategy: c.strategy, score: c.score, source: c.source,
          })),
          predictions: result.predictions,
        });
      } catch (e) {
        return json(res, { success: false, error: String(e) }, 500);
      }
    }

    // POST /dream (placeholder)
    if (path === '/dream' && req.method === 'POST') {
      return json(res, { status: 'not_implemented', message: 'Gene Dream cycle coming in next release' });
    }

    json(res, { error: 'Not found' }, 404);
  });

  return {
    start: () => new Promise<void>((resolve) => {
      server.listen(port, () => {
        console.log(`\n  \x1b[36m╔═══════════════════════════════════════╗\x1b[0m`);
        console.log(`  \x1b[36m║\x1b[0m  \x1b[1mHELIX API SERVER\x1b[0m                      \x1b[36m║\x1b[0m`);
        console.log(`  \x1b[36m╚═══════════════════════════════════════╝\x1b[0m`);
        console.log(`  http://localhost:${port}`);
        console.log(`  Mode: ${mode} | Genes: ${geneMap.health().totalGenes}`);
        console.log(`\n  POST /repair  — diagnose + repair`);
        console.log(`  GET  /health  — healthcheck`);
        console.log(`  GET  /status  — Gene Map stats`);
        console.log(`  GET  /genes   — list all genes\n`);
        resolve();
      });
    }),
    stop: () => new Promise<void>((resolve) => {
      geneMap.close();
      server.close(() => resolve());
    }),
    server,
    engine,
    geneMap,
  };
}
