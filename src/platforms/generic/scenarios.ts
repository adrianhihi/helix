import type { DemoScenario } from '../tempo/scenarios.js';

// 3 generic demo scenarios

export const genericScenarios: DemoScenario[] = [
  {
    id: 18,
    name: '429 Rate Limited',
    errorCode: 'rate-limited',
    errorMessage: '429 Too Many Requests: Rate limit exceeded. Retry-After: 5s',
    tag: 'live',
  },
  {
    id: 19,
    name: '500 Server Error',
    errorCode: 'server-error',
    errorMessage: 'HTTP 500 Internal Server Error: The server had an error processing your request',
    tag: 'live',
  },
  {
    id: 20,
    name: 'Request Timeout',
    errorCode: 'timeout',
    errorMessage: 'ETIMEDOUT: Request to api.service.com exceeded 10000ms timeout',
    tag: 'live',
  },
];
