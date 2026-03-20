import type { DemoScenario } from '../tempo/scenarios.js';

// 4 Privy-unique demo scenarios

export const privyScenarios: DemoScenario[] = [
  {
    id: 14,
    name: 'Policy Spending Limit',
    errorCode: 'policy-violation',
    errorMessage: 'Privy policy engine rejected transaction: AMOUNT_EXCEEDS_LIMIT. Policy "max_transfer_500" limits single transfer to 500 USDC. Requested: 2500 USDC',
    tag: 'live',
  },
  {
    id: 15,
    name: 'Privy Nonce Desync',
    errorCode: 'verification-failed',
    errorMessage: 'Transaction nonce mismatch: wallet internal nonce=47 but chain nonce=45. Two pending transactions may be stuck in mempool',
    tag: 'live',
  },
  {
    id: 16,
    name: 'Privy Gas Sponsor Exhausted',
    errorCode: 'payment-insufficient',
    errorMessage: 'Privy automated gas sponsorship balance depleted. Sponsor wallet 0x1234...5678 has 0 USDC. Cannot pay gas for agent transaction',
    tag: 'mock',
  },
  {
    id: 17,
    name: 'Privy Cross-Chain Mismatch',
    errorCode: 'token-uninitialized',
    errorMessage: 'Privy wallet wlt_stu901 is provisioned on Ethereum mainnet but transaction targets Tempo chain (chainId: 42069). Cannot sign for mismatched chain',
    tag: 'mock',
  },
];
