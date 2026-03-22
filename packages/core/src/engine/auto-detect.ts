/**
 * Auto-Detect — Identifies function signatures and applies repair overrides automatically.
 * Removes the need for users to write parameterModifier.
 */

export interface DetectedSignature {
  type: 'viem-tx' | 'fetch' | 'generic-payment' | 'unknown';
  paramIndex: number;
}

export function detectSignature(args: unknown[]): DetectedSignature {
  if (!args || args.length === 0) return { type: 'unknown', paramIndex: -1 };
  const first = args[0] as Record<string, unknown>;

  // Viem transaction: has 'to' + at least one other tx field
  if (typeof first === 'object' && first !== null && 'to' in first) {
    const txFields = ['to', 'value', 'nonce', 'gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'data', 'chainId'];
    if (txFields.filter(f => f in first).length >= 2) return { type: 'viem-tx', paramIndex: 0 };
  }

  // Fetch-like: first arg is URL string
  if (typeof first === 'string' && (first as string).startsWith('http')) return { type: 'fetch', paramIndex: 0 };

  // Generic payment object
  if (typeof first === 'object' && first !== null && ('amount' in first || 'value' in first)) return { type: 'generic-payment', paramIndex: 0 };

  return { type: 'unknown', paramIndex: -1 };
}

export function applyOverrides(args: unknown[], overrides: Record<string, unknown>, strategy: string, sig: DetectedSignature): unknown[] | null {
  if (sig.type === 'unknown') return null;
  // Allow strategies that modify params even without explicit overrides
  const alwaysApply = ['reduce_request', 'speed_up_transaction', 'refresh_nonce'];
  if (Object.keys(overrides).length === 0 && !alwaysApply.includes(strategy)) return null;
  const newArgs = [...args];

  if (sig.type === 'viem-tx') {
    const tx = { ...(newArgs[0] as Record<string, unknown>) };
    switch (strategy) {
      case 'refresh_nonce':
        if (overrides.nonce !== undefined) tx.nonce = overrides.nonce;
        else delete tx.nonce; // remove wrong nonce, let viem auto-assign
        break;
      case 'reduce_request':
        if (overrides.amount !== undefined) tx.value = BigInt(overrides.amount as string);
        else if (tx.value) tx.value = BigInt(tx.value as bigint) / 2n;
        break;
      case 'speed_up_transaction':
        if (overrides.gasPrice !== undefined) tx.gasPrice = BigInt(overrides.gasPrice as string);
        else if (tx.gasPrice) tx.gasPrice = (BigInt(tx.gasPrice as bigint) * 130n) / 100n;
        else if (tx.maxFeePerGas) tx.maxFeePerGas = (BigInt(tx.maxFeePerGas as bigint) * 130n) / 100n;
        break;
      case 'switch_network':
        if (overrides.chainId !== undefined) tx.chainId = overrides.chainId;
        break;
      case 'fix_params':
        Object.assign(tx, overrides);
        break;
      default:
        for (const [k, v] of Object.entries(overrides)) { if (k in tx) tx[k] = v; }
    }
    newArgs[0] = tx;
    return newArgs;
  }

  if (sig.type === 'fetch') {
    if (strategy === 'switch_endpoint' && overrides.url) newArgs[0] = overrides.url;
    return newArgs;
  }

  if (sig.type === 'generic-payment') {
    const p = { ...(newArgs[0] as Record<string, unknown>) };
    if (strategy === 'reduce_request') {
      if (overrides.amount !== undefined) p.amount = overrides.amount;
      else if (p.amount) p.amount = (p.amount as number) * 0.5;
    } else {
      for (const [k, v] of Object.entries(overrides)) { if (k in p) p[k] = v; }
    }
    newArgs[0] = p;
    return newArgs;
  }

  return null;
}
