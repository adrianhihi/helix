#!/usr/bin/env node
import express from 'express';
import { router } from './routes.js';
import { mppPaymentRequired } from './mpp-middleware.js';
import type { MppConfig } from './mpp-middleware.js';

const app = express();
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, PAYMENT-SIGNATURE, X-Payment, X-Payment-Receipt, X-Agent-Id');
  if (_req.method === 'OPTIONS') { res.sendStatus(200); return; }
  next();
});

const MPP_CONFIG: MppConfig = {
  price: '0.001',
  currency: 'USDC',
  network: process.env.HELIX_NETWORK || 'eip155:84532',
  recipient: process.env.HELIX_WALLET || '0x0000000000000000000000000000000000000000',
  description: 'Helix — AI Payment Repair Intelligence',
  facilitatorUrl: process.env.HELIX_FACILITATOR || 'https://www.x402.org/facilitator',
};

// Free endpoints — mount router at root, it handles all paths
app.get('/health', (req, res, next) => { router(req, res, next); });
app.get('/v1/status', (req, res, next) => { router(req, res, next); });
app.get('/v1/platforms', (req, res, next) => { router(req, res, next); });
app.get('/v1/check/:code/:category', (req, res, next) => { router(req, res, next); });

// Paid endpoints (402 without payment)
app.post('/v1/diagnose', mppPaymentRequired(MPP_CONFIG), (req, res, next) => { router(req, res, next); });
app.post('/v1/repair', mppPaymentRequired(MPP_CONFIG), (req, res, next) => { router(req, res, next); });

// MPP discovery metadata (for mppscan listing)
app.get('/.well-known/mpp', (_req, res) => {
  res.json({
    name: 'Helix',
    description: 'AI Payment Repair Intelligence — diagnose and auto-repair payment failures across Tempo, Privy, Coinbase, and any HTTP service.',
    version: '0.1.0',
    pricing: {
      diagnose: { price: '0.001', currency: 'USDC', description: 'Diagnose a payment error' },
      repair: { price: '0.001', currency: 'USDC', description: 'Diagnose + execute repair' },
    },
    endpoints: [
      { method: 'POST', path: '/v1/diagnose', paid: true },
      { method: 'POST', path: '/v1/repair', paid: true },
      { method: 'GET', path: '/v1/check/:code/:category', paid: false },
      { method: 'GET', path: '/v1/status', paid: false },
      { method: 'GET', path: '/v1/platforms', paid: false },
      { method: 'GET', path: '/health', paid: false },
    ],
    platforms: ['tempo', 'privy', 'coinbase', 'generic'],
    scenarios: 31,
    strategies: 25,
    links: {
      github: 'https://github.com/adrianhihi/helix',
      npm: 'https://www.npmjs.com/package/@helix-agent/core',
    },
  });
});

// Root path — returns 402 with MPP discovery (required for mppscan)
app.get("/", (_req, res) => {
  const paymentRequired = {
    x402Version: 2,
    error: "Payment required",
    accepts: [{
      scheme: "exact",
      network: MPP_CONFIG.network,
      amount: MPP_CONFIG.price,
      asset: MPP_CONFIG.currency,
      payTo: MPP_CONFIG.recipient,
      maxTimeoutSeconds: 300,
      extra: { name: "Helix", description: MPP_CONFIG.description },
    }],
  };
  res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(paymentRequired)).toString("base64"));
  res.status(402).json(paymentRequired);
});

// OpenAPI discovery (for mppscan)
app.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'Helix',
      version: '0.1.0',
      description: 'AI Payment Repair Intelligence — diagnose and auto-repair payment failures for AI agents across Tempo, Privy, Coinbase, and any HTTP service. 31 scenarios, 25 strategies, cross-platform Gene immunity.',
      guidance: 'Use POST /v1/diagnose to classify a payment error and get a repair recommendation. Send JSON body with "error" (string) and optional "context" (object). Use POST /v1/repair for diagnosis + execution. Free endpoints: GET /v1/status, GET /v1/platforms, GET /v1/check/:code/:category, GET /health.',
    },
    paths: {
      '/v1/diagnose': {
        post: {
          operationId: 'diagnose',
          summary: 'Diagnose a payment error and recommend repair strategy',
          tags: ['Repair'],
          'x-payment-info': { pricingMode: 'fixed', price: '0.001000', protocols: ['mpp', 'x402'] },
          'x-bazaar': { schema: { properties: { input: { type: 'object', properties: { error: { type: 'string', description: 'Error message from failed payment' }, context: { type: 'object', description: 'Optional context' } }, required: ['error'] }, output: { type: 'object', properties: { success: { type: 'boolean' }, diagnosis: { type: 'object' }, recommendation: { type: 'object' }, immune: { type: 'boolean' }, explanation: { type: 'string' } } } } } },
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string', minLength: 1, description: 'The error message from the failed payment' }, context: { type: 'object', description: 'Optional context: agentId, walletAddress, chainId, etc.' } }, required: ['error'] } } } },
          responses: { '200': { description: 'Diagnosis result with recommended strategy', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, diagnosis: { type: 'object' }, recommendation: { type: 'object' }, immune: { type: 'boolean' }, explanation: { type: 'string' } } } } } }, '402': { description: 'Payment Required' } },
        },
      },
      '/v1/repair': {
        post: {
          operationId: 'repair',
          summary: 'Diagnose and execute a payment repair',
          tags: ['Repair'],
          'x-payment-info': { pricingMode: 'fixed', price: '0.001000', protocols: ['mpp', 'x402'] },
          'x-bazaar': { schema: { properties: { input: { type: 'object', properties: { error: { type: 'string', description: 'Error message from failed payment' }, context: { type: 'object', description: 'Optional context' } }, required: ['error'] }, output: { type: 'object', properties: { success: { type: 'boolean' }, repaired: { type: 'boolean' }, strategy: { type: 'string' }, verified: { type: 'boolean' }, explanation: { type: 'string' } } } } } },
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string', minLength: 1, description: 'The error message from the failed payment' }, context: { type: 'object', description: 'Optional context' } }, required: ['error'] } } } },
          responses: { '200': { description: 'Repair result', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, repaired: { type: 'boolean' }, strategy: { type: 'string' }, verified: { type: 'boolean' }, explanation: { type: 'string' } } } } } }, '402': { description: 'Payment Required' } },
        },
      },
      '/v1/status': { get: { operationId: 'status', summary: 'Gene Map health status', tags: ['Info'], 'x-auth-mode': 'none', responses: { '200': { description: 'Gene Map statistics', content: { 'application/json': { schema: { type: 'object' } } } } } } },
      '/v1/platforms': { get: { operationId: 'platforms', summary: 'List supported platforms and scenario counts', tags: ['Info'], 'x-auth-mode': 'none', responses: { '200': { description: 'Platform list', content: { 'application/json': { schema: { type: 'object' } } } } } } },
      '/health': { get: { operationId: 'health', summary: 'Health check', tags: ['Info'], 'x-auth-mode': 'none', responses: { '200': { description: 'Service health', content: { 'application/json': { schema: { type: 'object' } } } } } } },
    },
  });
});

// x402 well-known discovery
app.get('/.well-known/x402', (_req, res) => {
  res.json({
    protocols: ['mpp', 'x402'],
    endpoints: ['/v1/diagnose', '/v1/repair'],
    network: MPP_CONFIG.network,
    payTo: MPP_CONFIG.recipient,
  });
});

const PORT = parseInt(process.env.PORT || '3402', 10);

app.listen(PORT, () => {
  console.log(`
\x1b[36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m
\x1b[36m║\x1b[0m  \x1b[1mHELIX API\x1b[0m — MPP-Compatible Payment Repair Service            \x1b[36m║\x1b[0m
\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m
\x1b[36m║\x1b[0m                                                               \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  POST /v1/diagnose    💰 Diagnose error ($0.001)              \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  POST /v1/repair      💰 Diagnose + repair ($0.001)           \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  GET  /v1/check/:c/:c 🆓 Check Gene immunity                 \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  GET  /v1/status      🆓 Gene Map health                     \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  GET  /v1/platforms   🆓 Supported platforms                 \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  GET  /health         🆓 Health check                        \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  GET  /.well-known/mpp  MPP discovery metadata               \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m                                                               \x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  Network: ${MPP_CONFIG.network.padEnd(49)}\x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  Port: ${String(PORT).padEnd(52)}\x1b[36m║\x1b[0m
\x1b[36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m
  `);
});

export { app };
