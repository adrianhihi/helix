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
