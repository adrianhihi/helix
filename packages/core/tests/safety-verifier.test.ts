import { describe, it, expect } from 'vitest';
import { SafetyVerifier } from '../src/engine/safety-verifier.js';
import type { VerifyContext } from '../src/engine/safety-verifier.js';

const ctx = (o: Partial<VerifyContext> = {}): VerifyContext => ({ mode: 'auto', originalArgs: [], strategy: 'retry', overrides: {}, ...o });
const v = new SafetyVerifier();

describe('Formal Safety Verification', () => {
  it('blocks recipient modification', () => {
    const r = v.verify('fix_params', { to: '0xevil' }, ctx());
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.includes('recipient'))).toBe(true);
  });

  it('blocks data modification', () => {
    const r = v.verify('fix_params', { data: '0xbad' }, ctx());
    expect(r.safe).toBe(false);
    expect(r.violations.some(v => v.includes('data'))).toBe(true);
  });

  it('blocks gas exceeding ceiling', () => {
    const r = v.verify('speed_up', { gasPrice: 1e15 }, ctx({ costCeiling: 0.001 }));
    expect(r.safe).toBe(false);
  });

  it('allows gas under ceiling', () => {
    const r = v.verify('speed_up', { gasPrice: 1e9 }, ctx({ costCeiling: 1.0 }));
    expect(r.violations.filter(x => x.includes('ceiling')).length).toBe(0);
  });

  it('skips cost check without ceiling', () => {
    const r = v.verify('speed_up', { gasPrice: 1e15 }, ctx());
    expect(r.violations.filter(x => x.includes('ceiling')).length).toBe(0);
  });

  it('blocks fund-moving in auto mode', () => {
    const r = v.verify('swap_currency', {}, ctx({ mode: 'auto' }));
    expect(r.safe).toBe(false);
    expect(r.violations.some(x => x.includes('full'))).toBe(true);
  });

  it('allows fund-moving in full mode', () => {
    const r = v.verify('swap_currency', {}, ctx({ mode: 'full' }));
    expect(r.violations.filter(x => x.includes('full')).length).toBe(0);
  });

  it('blocks strategy not in allowlist', () => {
    const r = v.verify('speed_up', {}, ctx({ allowedStrategies: ['retry'] }));
    expect(r.safe).toBe(false);
  });

  it('allows strategy in allowlist', () => {
    const r = v.verify('retry', {}, ctx({ allowedStrategies: ['retry'] }));
    expect(r.violations.filter(x => x.includes('allowlist')).length).toBe(0);
  });

  it('blocks explicitly blocked strategy', () => {
    const r = v.verify('speed_up', {}, ctx({ blockedStrategies: ['speed_up'] }));
    expect(r.safe).toBe(false);
  });

  it('blocks address not in whitelist', () => {
    const r = v.verify('fix_params', { to: '0xunk' }, ctx({ addressWhitelist: ['0xsafe'] }));
    expect(r.safe).toBe(false);
  });

  it('skips address check without whitelist', () => {
    const r = v.verify('retry', {}, ctx());
    expect(r.violations.filter(x => x.includes('whitelist')).length).toBe(0);
  });

  it('blocks value increase', () => {
    const r = v.verify('fix_params', { value: 2000n }, ctx({ originalArgs: [{ to: '0x1', value: 1000n }] }));
    expect(r.safe).toBe(false);
    expect(r.violations.some(x => x.includes('increased'))).toBe(true);
  });

  it('allows value decrease', () => {
    const r = v.verify('reduce_request', { value: 500n }, ctx({ originalArgs: [{ to: '0x1', value: 1000n }] }));
    expect(r.violations.filter(x => x.includes('increased')).length).toBe(0);
  });

  it('safe strategy passes all checks', () => {
    const r = v.verify('refresh_nonce', {}, ctx());
    expect(r.safe).toBe(true);
    expect(r.passedConstraints).toBe(r.checkedConstraints);
  });

  it('reports multiple violations', () => {
    const r = v.verify('swap_currency', { to: '0x', data: '0x' }, ctx({ mode: 'auto' }));
    expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('custom constraint works', () => {
    const c = new SafetyVerifier();
    c.addConstraint({ name: 'custom', description: 'test', check: (s) => s === 'bad' ? { safe: false, violation: 'blocked' } : { safe: true } });
    expect(c.verify('bad', {}, ctx()).safe).toBe(false);
    expect(c.verify('good', {}, ctx()).safe).toBe(true);
  });

  it('has 7 built-in constraints', () => {
    expect(v.getConstraints().length).toBe(7);
  });
});
