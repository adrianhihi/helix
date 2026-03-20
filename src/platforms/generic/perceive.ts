import type { FailureClassification } from '../../core/types.js';

export function genericPerceive(error: Error, _context?: Record<string, unknown>): FailureClassification | null {
  const msg = error.message;

  // 429 Rate Limited
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Too Many Requests'))
    return { code: 'rate-limited', category: 'auth', severity: 'medium', platform: 'generic', details: msg, timestamp: Date.now() };

  // 500/502/503 Server Error
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('Internal Server Error'))
    return { code: 'server-error', category: 'service', severity: 'high', platform: 'generic', details: msg, timestamp: Date.now() };

  // Timeout
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') || msg.includes('exceeded'))
    return { code: 'timeout', category: 'service', severity: 'medium', platform: 'generic', details: msg, timestamp: Date.now() };

  // JSON parse error (malformed response)
  if (msg.includes('JSON') || msg.includes('Unexpected token'))
    return { code: 'malformed-credential', category: 'service', severity: 'medium', platform: 'generic', details: msg, timestamp: Date.now() };

  // Connection refused
  if (msg.includes('ECONNREFUSED') || msg.includes('connect'))
    return { code: 'server-error', category: 'service', severity: 'high', platform: 'generic', details: msg, timestamp: Date.now() };

  return null;
}
