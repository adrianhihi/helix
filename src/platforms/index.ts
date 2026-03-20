import type { PlatformAdapter } from '../core/types.js';
import { tempoPerceive } from './tempo/perceive.js';
import { tempoConstruct } from './tempo/strategies.js';
import { privyPerceive } from './privy/perceive.js';
import { privyConstruct } from './privy/strategies.js';
import { genericPerceive } from './generic/perceive.js';
import { genericConstruct } from './generic/strategies.js';
import { stripePerceive } from './stripe/perceive.js';
import { stripeConstruct } from './stripe/strategies.js';

export const tempoAdapter: PlatformAdapter = {
  name: 'tempo',
  perceive: tempoPerceive,
  construct: tempoConstruct,
};

export const privyAdapter: PlatformAdapter = {
  name: 'privy',
  perceive: privyPerceive,
  construct: privyConstruct,
};

export const genericAdapter: PlatformAdapter = {
  name: 'generic',
  perceive: genericPerceive,
  construct: genericConstruct,
};

export const stripeAdapter: PlatformAdapter = {
  name: 'stripe',
  perceive: stripePerceive,
  construct: stripeConstruct,
};

// Default adapter chain: Tempo → Privy → Stripe → Generic (fallback)
export const defaultAdapters: PlatformAdapter[] = [
  tempoAdapter,
  privyAdapter,
  stripeAdapter,
  genericAdapter, // always last — catches everything
];
