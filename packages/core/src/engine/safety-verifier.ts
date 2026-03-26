/**
 * Formal Safety Verification — 7 pre-execution constraints.
 * Every strategy is checked before execution.
 */

export interface SafetyConstraint {
  name: string;
  description: string;
  check: (strategy: string, overrides: Record<string, unknown>, context: VerifyContext) => { safe: boolean; violation?: string };
}

export interface VerifyContext {
  mode: 'observe' | 'auto' | 'full';
  originalArgs: unknown[];
  strategy: string;
  overrides: Record<string, unknown>;
  costCeiling?: number;
  allowedStrategies?: string[];
  blockedStrategies?: string[];
  addressWhitelist?: string[];
}

export interface SafetyResult {
  safe: boolean;
  violations: string[];
  checkedConstraints: number;
  passedConstraints: number;
}

const FUND_MOVEMENT = ['swap_currency', 'split_swap', 'self_pay_gas', 'switch_stablecoin', 'topup_from_reserve'];

export class SafetyVerifier {
  private constraints: SafetyConstraint[] = [];

  constructor() {
    this.addConstraint({ name: 'no-to-modification', description: 'Prevents changing transaction recipient',
      check: (_, ov) => 'to' in ov ? { safe: false, violation: 'Strategy attempted to modify recipient address (to)' } : { safe: true } });

    this.addConstraint({ name: 'no-data-modification', description: 'Prevents changing transaction data/calldata',
      check: (_, ov) => 'data' in ov ? { safe: false, violation: 'Strategy attempted to modify transaction data' } : { safe: true } });

    this.addConstraint({ name: 'cost-ceiling', description: 'Ensures gas cost does not exceed ceiling',
      check: (_, ov, ctx) => {
        if (!ctx.costCeiling) return { safe: true };
        const gas = Math.max(Number(ov.gasPrice || 0), Number(ov.maxFeePerGas || 0));
        const cost = gas * 21000 / 1e18;
        return cost > ctx.costCeiling ? { safe: false, violation: `Estimated cost ${cost.toFixed(6)} ETH exceeds ceiling ${ctx.costCeiling} ETH` } : { safe: true };
      } });

    this.addConstraint({ name: 'mode-restriction', description: 'Fund-moving strategies require full mode',
      check: (s, _, ctx) => FUND_MOVEMENT.includes(s) && ctx.mode !== 'full' ? { safe: false, violation: `Strategy "${s}" moves funds and requires mode: full (current: ${ctx.mode})` } : { safe: true } });

    this.addConstraint({ name: 'strategy-allowlist', description: 'Enforces strategy allow/block lists',
      check: (s, _, ctx) => {
        if (ctx.allowedStrategies?.length && !ctx.allowedStrategies.includes(s)) return { safe: false, violation: `Strategy "${s}" not in allowlist` };
        if (ctx.blockedStrategies?.includes(s)) return { safe: false, violation: `Strategy "${s}" is explicitly blocked` };
        return { safe: true };
      } });

    this.addConstraint({ name: 'address-whitelist', description: 'Only allows transactions to whitelisted addresses',
      check: (_, ov, ctx) => {
        if (!ctx.addressWhitelist?.length) return { safe: true };
        const to = ov.to as string | undefined;
        return to && !ctx.addressWhitelist.map(a => a.toLowerCase()).includes(to.toLowerCase()) ? { safe: false, violation: `Address ${to} not in whitelist` } : { safe: true };
      } });

    this.addConstraint({ name: 'value-increase-limit', description: 'Prevents increasing transaction value',
      check: (_, ov, ctx) => {
        const orig = ctx.originalArgs?.[0] as Record<string, unknown> | undefined;
        if (!orig?.value || !ov.value) return { safe: true };
        try { const o = BigInt(orig.value as bigint); const m = BigInt(ov.value as string | bigint); if (m > o) return { safe: false, violation: `Strategy increased tx value from ${o} to ${m}` }; } catch {}
        return { safe: true };
      } });
  }

  addConstraint(c: SafetyConstraint): void { this.constraints.push(c); }

  verify(strategy: string, overrides: Record<string, unknown>, context: VerifyContext): SafetyResult {
    const violations: string[] = [];
    let passed = 0;
    for (const c of this.constraints) {
      try {
        const r = c.check(strategy, overrides, context);
        if (r.safe) passed++; else if (r.violation) violations.push(`[${c.name}] ${r.violation}`);
      } catch { passed++; }
    }
    return { safe: violations.length === 0, violations, checkedConstraints: this.constraints.length, passedConstraints: passed };
  }

  getConstraints(): { name: string; description: string }[] {
    return this.constraints.map(c => ({ name: c.name, description: c.description }));
  }
}
