import type { FailureClassification, RepairCandidate } from '../../core/types.js';

export function genericConstruct(failure: FailureClassification): RepairCandidate[] {
  if (failure.category === 'auth') {
    return [
      { id: 'backoff_retry', strategy: 'backoff_retry', description: 'Exponential backoff and retry', estimatedCostUsd: 0, estimatedSpeedMs: 2000, requirements: [], score: 0, successProbability: 0.85, platform: 'generic' },
      { id: 'switch_endpoint', strategy: 'switch_endpoint', description: 'Switch to backup API endpoint', estimatedCostUsd: 0, estimatedSpeedMs: 100, requirements: ['alt_endpoint'], score: 0, successProbability: 0.80, platform: 'generic' },
    ];
  }
  if (failure.category === 'service') {
    return [
      { id: 'retry', strategy: 'retry', description: 'Simple retry after delay', estimatedCostUsd: 0, estimatedSpeedMs: 1000, requirements: [], score: 0, successProbability: 0.70, platform: 'generic' },
      { id: 'switch_provider', strategy: 'switch_provider', description: 'Switch to backup service provider', estimatedCostUsd: 0, estimatedSpeedMs: 200, requirements: ['alt_provider'], score: 0, successProbability: 0.85, platform: 'generic' },
    ];
  }
  return [];
}
