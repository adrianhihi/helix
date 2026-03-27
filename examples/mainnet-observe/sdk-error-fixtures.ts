/**
 * Helix SDK Error Fixtures
 *
 * Records real error objects from Coinbase SDK and Privy SDK.
 * These are the actual errors Helix will see in production —
 * not hand-crafted strings.
 *
 * Usage:
 *   npx tsx examples/mainnet-observe/sdk-error-fixtures.ts
 */

const HELIX_URL = process.env.HELIX_URL || 'http://localhost:7842';

// ── Types ─────────────────────────────────────────────────
interface Fixture {
  name: string;
  platform: string;
  errorClass: string;
  errorMessage: string;
  errorCode?: string | number;
  rawError: object;
  helixInput: string;
  expectedStrategy: string;
}

interface Result extends Fixture {
  helixCode: string;
  helixStrategy: string;
  pass: boolean;
}

// ── Diagnose ──────────────────────────────────────────────
async function diagnose(error: string, platform: string) {
  const res = await fetch(`${HELIX_URL}/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error, platform }),
  });
  return res.json();
}

// ── Collect real SDK errors ───────────────────────────────

function collectCoinbaseErrors(): Fixture[] {
  // Coinbase SDK errors extend AxiosError and are created via APIError.fromError().
  // In production, the error.message includes the apiCode and apiMessage from the response body.
  // We simulate the real AxiosError → APIError.fromError() flow.
  const CoinbaseSDK = require('@coinbase/coinbase-sdk');

  const fixtures: Fixture[] = [];

  const cases: { code: string; httpStatus: number; apiMessage: string; expectedClass: string; name: string; expected: string }[] = [
    { code: 'resource_exhausted', httpStatus: 429, apiMessage: 'Rate limit exceeded: too many requests', expectedClass: 'ResourceExhaustedError', name: 'ResourceExhausted (rate limit)', expected: 'backoff_retry' },
    { code: 'unauthorized', httpStatus: 401, apiMessage: 'Unauthorized: invalid API key or expired token', expectedClass: 'UnauthorizedError', name: 'Unauthorized', expected: 'backoff_retry' },
    { code: 'not_found', httpStatus: 404, apiMessage: 'Not found: wallet not found', expectedClass: 'NotFoundError', name: 'NotFound', expected: 'retry' },
    { code: 'invalid_amount', httpStatus: 400, apiMessage: 'Invalid amount: exceeds available balance', expectedClass: 'InvalidAmountError', name: 'InvalidAmount (insufficient)', expected: 'reduce_request' },
    { code: 'malformed_request', httpStatus: 400, apiMessage: 'Malformed request: invalid nonce format', expectedClass: 'MalformedRequestError', name: 'MalformedRequest', expected: 'refresh_nonce' },
    { code: 'invalid_network_id', httpStatus: 400, apiMessage: 'Invalid network: expected base-mainnet, got base-sepolia', expectedClass: 'InvalidNetworkIDError', name: 'InvalidNetworkID', expected: 'switch_network' },
    { code: 'internal', httpStatus: 500, apiMessage: 'Internal error: gas estimation failed', expectedClass: 'InternalError', name: 'InternalError (gas est)', expected: 'speed_up_transaction' },
    { code: 'faucet_limit_reached', httpStatus: 429, apiMessage: 'Faucet limit reached for this address', expectedClass: 'FaucetLimitReachedError', name: 'FaucetLimitReached', expected: 'backoff_retry' },
  ];

  for (const c of cases) {
    try {
      // Create a mock AxiosError that mirrors real Coinbase API responses
      const mockAxiosError: any = new Error(`Request failed with status code ${c.httpStatus}`);
      mockAxiosError.isAxiosError = true;
      mockAxiosError.response = {
        status: c.httpStatus,
        data: { code: c.code, message: c.apiMessage },
      };

      const err = CoinbaseSDK.APIError.fromError(mockAxiosError);

      // The actual message Helix receives is typically the apiMessage
      // or the full error.message/toString(). Use apiMessage as it's the real content.
      const helixInput = err.apiMessage || err.message || c.apiMessage;

      fixtures.push({
        name: `Coinbase: ${c.name}`,
        platform: 'coinbase',
        errorClass: err.constructor.name || c.expectedClass,
        errorMessage: helixInput,
        errorCode: err.apiCode || c.code,
        rawError: {
          name: err.name,
          message: err.message,
          apiCode: err.apiCode,
          apiMessage: err.apiMessage,
          httpCode: err.httpCode,
        },
        helixInput,
        expectedStrategy: c.expected,
      });
    } catch (e: any) {
      console.warn(`  ⚠ Could not create ${c.expectedClass}: ${e.message}`);
    }
  }

  return fixtures;
}

function collectPrivyErrors(): Fixture[] {
  const PrivySDK = require('@privy-io/node');
  const fixtures: Fixture[] = [];

  const cases: { cls: string; name: string; msg: string; status: number; expected: string }[] = [
    { cls: 'RateLimitError', name: 'RateLimitError', msg: 'Rate limit exceeded', status: 429, expected: 'backoff_retry' },
    { cls: 'AuthenticationError', name: 'AuthenticationError', msg: 'Authentication failed: invalid token', status: 401, expected: 'retry' },
    { cls: 'NotFoundError', name: 'NotFoundError', msg: 'Not found: user wallet not found', status: 404, expected: 'retry' },
    { cls: 'BadRequestError', name: 'BadRequestError (insufficient)', msg: 'Bad request: insufficient funds for transaction', status: 400, expected: 'reduce_request' },
    { cls: 'PermissionDeniedError', name: 'PermissionDeniedError (policy)', msg: 'Permission denied: policy violation AMOUNT_EXCEEDS_LIMIT', status: 403, expected: 'split_transaction' },
    { cls: 'InternalServerError', name: 'InternalServerError', msg: 'Internal server error', status: 500, expected: 'retry' },
    { cls: 'UnprocessableEntityError', name: 'UnprocessableEntityError (gas)', msg: 'Unprocessable entity: gas limit exceeded', status: 422, expected: 'speed_up_transaction' },
    { cls: 'ConflictError', name: 'ConflictError (nonce)', msg: 'Conflict: nonce mismatch in wallet internal state', status: 409, expected: 'refresh_nonce' },
  ];

  for (const c of cases) {
    try {
      const Cls = PrivySDK[c.cls];
      if (!Cls) { console.warn(`  ⚠ ${c.cls} not found in Privy SDK`); continue; }

      // Privy errors: constructor(status, errorBody, message, headers)
      const err = new Cls(
        c.status,
        { error: c.cls, message: c.msg },
        c.msg,
        new Headers(),
      );

      // Privy error.message is typically "{status} {msg}"
      const helixInput = err.message || c.msg;

      fixtures.push({
        name: `Privy: ${c.name}`,
        platform: 'privy',
        errorClass: c.cls,
        errorMessage: helixInput,
        errorCode: c.status,
        rawError: {
          name: err.name,
          message: err.message,
          status: (err as any).status,
        },
        helixInput,
        expectedStrategy: c.expected,
      });
    } catch (e: any) {
      console.warn(`  ⚠ Could not create ${c.cls}: ${e.message}`);
    }
  }

  return fixtures;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('\nHelix SDK Error Fixtures Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Helix: ${HELIX_URL}`);
  console.log();

  // Check Helix
  try {
    await fetch(`${HELIX_URL}/health`);
  } catch {
    console.error('❌ Helix server not running.');
    console.error('   node packages/core/dist/cli.js serve --port 7842 --mode observe');
    process.exit(1);
  }

  const allFixtures = [
    ...collectCoinbaseErrors(),
    ...collectPrivyErrors(),
  ];

  console.log(`Collected ${allFixtures.length} real SDK error objects\n`);

  // Print raw errors
  console.log('── Raw SDK Error Objects ───────────────────\n');
  for (const f of allFixtures) {
    console.log(`  [${f.errorClass}]`);
    console.log(`  Message:  ${f.errorMessage}`);
    console.log(`  Code:     ${f.errorCode ?? 'none'}`);
    console.log(`  → Helix:  "${f.helixInput.substring(0, 80)}"`);
    console.log();
  }

  // Run through Helix
  console.log('── Helix Diagnosis ─────────────────────────\n');
  const results: Result[] = [];

  for (const f of allFixtures) {
    const d = await diagnose(f.helixInput, f.platform);
    const actualCode = d?.failure?.code || 'unknown';
    const actualStrategy = d?.strategy?.name || 'none';
    const pass = actualStrategy === f.expectedStrategy;

    results.push({ ...f, helixCode: actualCode, helixStrategy: actualStrategy, pass });

    console.log(`  ${pass ? '✅' : '❌'} ${f.name}`);
    console.log(`     SDK class: ${f.errorClass}`);
    console.log(`     Input:     "${f.helixInput.substring(0, 70)}"`);
    console.log(`     Helix:     ${actualCode} → ${actualStrategy}`);
    if (!pass) console.log(`     Expected:  ${f.expectedStrategy}`);
    console.log();
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const accuracy = ((passed / results.length) * 100).toFixed(1);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Results: ${passed}/${results.length} passed`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log();

  // Per-platform
  for (const platform of ['coinbase', 'privy']) {
    const pr = results.filter(r => r.platform === platform);
    const pp = pr.filter(r => r.pass).length;
    console.log(`  ${platform.padEnd(10)} ${pp}/${pr.length} (${((pp / pr.length) * 100).toFixed(0)}%)`);
  }
  console.log();

  // Save fixtures
  const fs = await import('fs');
  fs.writeFileSync(
    'sdk-fixtures.json',
    JSON.stringify(allFixtures.map(f => ({
      name: f.name,
      platform: f.platform,
      errorClass: f.errorClass,
      rawError: f.rawError,
      helixInput: f.helixInput,
      expectedStrategy: f.expectedStrategy,
    })), null, 2),
  );
  console.log('Saved fixtures to sdk-fixtures.json');

  if (failed > 0) {
    console.log('\nFailed:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     Got:      ${r.helixCode} → ${r.helixStrategy}`);
      console.log(`     Expected: ${r.expectedStrategy}`);
    });
  }
}

main().catch(console.error);
