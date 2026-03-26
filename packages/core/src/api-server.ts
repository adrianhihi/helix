/**
 * Helix REST API Server
 *
 * Exposes PCEC repair engine over HTTP for cross-language integration.
 * Start: npx helix serve [--port 7842] [--mode observe|auto|full]
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PcecEngine } from './engine/pcec.js';
import { GeneMap } from './engine/gene-map.js';
import { defaultAdapters } from './platforms/index.js';
import type { HelixMode } from './engine/types.js';
import { GeneDream } from './engine/dream.js';
import { getSchemaVersion, needsMigration, CURRENT_SCHEMA_VERSION } from './engine/migrations.js';

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
  const engine = new PcecEngine(geneMap, 'api-server', { mode, llm: { provider: 'anthropic', enabled: !!(process.env.ANTHROPIC_API_KEY || process.env.HELIX_LLM_API_KEY) } } as any);
  for (const a of defaultAdapters) engine.registerAdapter(a);

  const dream = new GeneDream(geneMap, {
    onDream: (e) => { if (e.stage === 'complete') console.log(`[helix] Dream: ${JSON.stringify(e.stats)}`); },
  });

  // Gene Collector database (shares the same SQLite file)
  const collectorDb = geneMap.database;
  collectorDb.exec(`CREATE TABLE IF NOT EXISTS gene_discoveries (id INTEGER PRIMARY KEY AUTOINCREMENT, error_pattern TEXT NOT NULL, code TEXT NOT NULL, category TEXT NOT NULL, severity TEXT, strategy TEXT NOT NULL, q_value REAL, source TEXT, reasoning TEXT, llm_provider TEXT, platform TEXT, helix_version TEXT, reported_at INTEGER, reviewed INTEGER DEFAULT 0, approved INTEGER DEFAULT 0, report_count INTEGER DEFAULT 1, avg_q REAL, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))`);
  collectorDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_discoveries_unique ON gene_discoveries(code, category, strategy, platform)`);
  collectorDb.exec(`CREATE INDEX IF NOT EXISTS idx_discoveries_reviewed ON gene_discoveries(reviewed)`);

  // TTL cleanup: remove old rejected/unreviewed entries every hour
  setInterval(() => {
    try {
      const cutoff = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
      collectorDb.prepare('DELETE FROM gene_discoveries WHERE reviewed = 1 AND approved = 0 AND created_at < ?').run(cutoff);
      collectorDb.prepare('DELETE FROM gene_discoveries WHERE reviewed = 0 AND created_at < ?').run(cutoff);
    } catch { /* ignore */ }
  }, 60 * 60 * 1000);

  function requireAdmin(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const adminKey = process.env.HELIX_ADMIN_KEY;
    if (!adminKey) return true;
    if (req.headers['authorization'] !== `Bearer ${adminKey}`) {
      json(res, { error: 'Unauthorized' }, 401);
      return false;
    }
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // GET / — welcome
    if (path === '/' && req.method === 'GET') {
      const health = geneMap.health();
      return json(res, {
        name: 'helix',
        description: 'Self-healing infrastructure for AI agent payments',
        version: '1.7.1',
        geneCount: health.totalGenes,
        platforms: health.platforms,
        endpoints: {
          'POST /repair': 'Send error for diagnosis + repair strategy',
          'GET /health': 'Healthcheck',
          'GET /status': 'Gene Map stats',
          'GET /genes': 'List all genes',
          'POST /api/telemetry': 'Report anonymous discoveries',
        },
        docs: 'https://github.com/adrianhihi/helix',
        npm: 'npm install @helix-agent/core',
        python: 'pip install helix-agent-sdk',
      });
    }

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
      return json(res, { status: 'ok', version: '1.9.0', schemaVersion: getSchemaVersion(geneMap.database), targetSchemaVersion: CURRENT_SCHEMA_VERSION, uptime: process.uptime() });
    }

    // GET /schema
    if (path === '/schema' && req.method === 'GET') {
      return json(res, needsMigration(geneMap.database));
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

    // POST /dream — trigger Gene Dream
    if (path === '/dream' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const stats = await dream.dream(body.force ?? true);
        return json(res, { success: true, stats });
      } catch (e: any) {
        return json(res, { error: e.message }, 400);
      }
    }

    // GET /dream/status
    if (path === '/dream/status' && req.method === 'GET') {
      const check = dream.shouldDream();
      return json(res, { ...check, lastDream: dream.lastDreamStats() });
    }

    // GET /dashboard — interactive HTML dashboard
    if (path === '/dashboard' && req.method === 'GET') {
      try {
        const __dir = dirname(fileURLToPath(import.meta.url));
        const paths = [join(__dir, '../static/dashboard.html'), join(__dir, '../../static/dashboard.html')];
        let html = '';
        for (const p of paths) { try { html = readFileSync(p, 'utf-8'); break; } catch { /* next */ } }
        if (!html) throw new Error('not found');
        res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
        return res.end(html);
      } catch {
        return json(res, { error: 'Dashboard not found' }, 404);
      }
    }

    // GET /api/gene-scores — all genes with 6D scores
    if (path === '/api/gene-scores' && req.method === 'GET') {
      const db = geneMap.database;
      const genes = db.prepare('SELECT * FROM genes ORDER BY q_value DESC').all() as any[];
      const scored = genes.map((g: any) => {
        const sc = g.success_count ?? 0;
        const fc = g.consecutive_failures ?? 0;
        const platforms: string[] = (() => { try { return JSON.parse(g.platforms || '[]'); } catch { return []; } })();
        const ms = g.avg_repair_ms ?? 0;
        const scores = {
          accuracy: Math.min(1, sc / Math.max(1, sc + fc) * 1.1),
          cost: ms < 10 ? 0.95 : ms < 100 ? 0.7 : 0.4,
          latency: ms < 5 ? 1.0 : ms < 50 ? 0.8 : ms < 500 ? 0.5 : 0.2,
          safety: fc === 0 ? 1.0 : fc < 3 ? 0.7 : 0.3,
          transferability: Math.min(1, platforms.length / 4),
          reliability: Math.min(1, sc / 10),
        };
        const composite = Math.round((scores.accuracy * 0.25 + scores.cost * 0.15 + scores.latency * 0.15 + scores.safety * 0.25 + scores.transferability * 0.1 + scores.reliability * 0.1) * 100) / 100;
        return { id: g.id, failureCode: g.failure_code, category: g.category, strategy: g.strategy, qValue: g.q_value, successCount: sc, consecutiveFailures: fc, avgRepairMs: ms, platforms, scores, composite };
      });
      const avg = scored.length > 0 ? Math.round(scored.reduce((s: number, g: any) => s + g.composite, 0) / scored.length * 100) / 100 : 0;
      return json(res, { total: scored.length, avgComposite: avg, genes: scored });
    }

    // GET /api/adversarial-stats
    if (path === '/api/adversarial-stats' && req.method === 'GET') {
      const { AdversarialDefense } = await import('./engine/adversarial.js');
      return json(res, new AdversarialDefense(geneMap.database).getStats());
    }

    // GET /api/reputation/:agentId
    if (path.startsWith('/api/reputation/') && req.method === 'GET') {
      const { AdversarialDefense } = await import('./engine/adversarial.js');
      return json(res, new AdversarialDefense(geneMap.database).getReputation(decodeURIComponent(path.split('/')[3])));
    }

    // GET /api/meta-patterns
    if (path === '/api/meta-patterns' && req.method === 'GET') {
      const { MetaLearner } = await import('./engine/meta-learner.js');
      return json(res, { patterns: new MetaLearner(geneMap.database).getPatterns() });
    }

    // POST /api/meta-learn
    if (path === '/api/meta-learn' && req.method === 'POST') {
      const { MetaLearner } = await import('./engine/meta-learner.js');
      return json(res, { newPatterns: new MetaLearner(geneMap.database).learnFromGeneMap() });
    }

    // GET /api/causal-graph
    if (path === '/api/causal-graph' && req.method === 'GET') {
      const { CausalGraph } = await import('./engine/causal-graph.js');
      return json(res, new CausalGraph(geneMap.database).getFullGraph());
    }

    // GET /api/anti-patterns
    if (path === '/api/anti-patterns' && req.method === 'GET') {
      const { NegativeKnowledge } = await import('./engine/negative-knowledge.js');
      const nk = new NegativeKnowledge(geneMap.database);
      return json(res, { antiPatterns: nk.getAll(), total: nk.count() });
    }

    // ── Gene Collector Endpoints ──

    // POST /api/telemetry — receive anonymous discoveries
    if (path === '/api/telemetry' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const events = body.events;
        if (!Array.isArray(events) || events.length === 0) {
          return json(res, { error: 'events array required' }, 400);
        }
        const batch = events.slice(0, 100);
        const ins = collectorDb.prepare(`INSERT INTO gene_discoveries (error_pattern, code, category, severity, strategy, q_value, source, reasoning, llm_provider, platform, helix_version, reported_at, avg_q) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code, category, strategy, platform) DO UPDATE SET report_count = report_count + 1, avg_q = (avg_q * report_count + excluded.q_value) / (report_count + 1), updated_at = unixepoch(), reasoning = COALESCE(excluded.reasoning, reasoning), helix_version = excluded.helix_version`);
        collectorDb.transaction(() => {
          for (const e of batch) {
            ins.run(e.errorPattern, e.code, e.category, e.severity ?? 'medium', e.strategy, e.qValue ?? 0.5, e.source ?? 'unknown', e.reasoning, e.llmProvider, e.platform ?? 'generic', e.helixVersion, e.timestamp ?? Date.now(), e.qValue ?? 0.5);
          }
        })();
        return json(res, { received: batch.length });
      } catch (e) {
        return json(res, { error: String(e) }, 500);
      }
    }

    // GET /api/discoveries — list discoveries for review
    if (path === '/api/discoveries' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const approved = url.searchParams.get('approved') === 'true';
      const rows = approved
        ? collectorDb.prepare('SELECT * FROM gene_discoveries WHERE approved = 1 ORDER BY created_at DESC').all()
        : collectorDb.prepare('SELECT * FROM gene_discoveries WHERE reviewed = 0 ORDER BY created_at DESC LIMIT 100').all();
      return json(res, rows);
    }

    // POST /api/discoveries/:id/approve
    if (path.startsWith('/api/discoveries/') && path.endsWith('/approve') && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const id = path.split('/')[3];
      collectorDb.prepare('UPDATE gene_discoveries SET reviewed = 1, approved = 1 WHERE id = ?').run(id);
      return json(res, { approved: true });
    }

    // POST /api/discoveries/:id/reject
    if (path.startsWith('/api/discoveries/') && path.endsWith('/reject') && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const id = path.split('/')[3];
      collectorDb.prepare('UPDATE gene_discoveries SET reviewed = 1, approved = 0 WHERE id = ?').run(id);
      return json(res, { rejected: true });
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
