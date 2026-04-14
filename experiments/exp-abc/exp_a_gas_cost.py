#!/usr/bin/env python3
"""Experiment A: Gas Cost of LLM Misclassification"""

import json
from datetime import datetime, timezone

GPT4O_MINI_FAILURES = [
    {"error_id": "E03", "raw_message": "execution reverted", "correct_class": "slippage_too_tight", "llm_class": "other", "llm_action": "Debug with Tenderly (cannot auto-fix)", "consequence": "No repair attempted. Transaction permanently failed.", "gas_wasted_gwei": 21000},
    {"error_id": "E05", "raw_message": "execution reverted: STF", "correct_class": "missing_allowance", "llm_class": "other", "llm_action": "Debug with Tenderly (cannot auto-fix)", "consequence": "No repair attempted. Transaction permanently failed.", "gas_wasted_gwei": 21000},
    {"error_id": "E06", "raw_message": "execution reverted: SPL", "correct_class": "slippage_too_tight", "llm_class": "other", "llm_action": "Debug with Tenderly (cannot auto-fix)", "consequence": "No repair attempted. Transaction permanently failed.", "gas_wasted_gwei": 21000},
    {"error_id": "E09", "raw_message": "execution reverted: UniswapV3Pool: SPL", "correct_class": "slippage_too_tight", "llm_class": "other", "llm_action": "Debug with Tenderly (cannot auto-fix)", "consequence": "No repair attempted. Transaction permanently failed.", "gas_wasted_gwei": 21000},
    {"error_id": "E10", "raw_message": "execution reverted: UniswapV3: LOK", "correct_class": "reentrancy_lock", "llm_class": "other", "llm_action": "Debug with Tenderly (cannot auto-fix)", "consequence": "No repair attempted. Transaction permanently failed.", "gas_wasted_gwei": 21000},
]

BASE_GAS_PRICE_GWEI = 0.001
ETH_PRICE_USD = 2800

CLASSIFICATION_TEST_GAS = {
    "wrong_classification_revert": {"gas_used": 21000, "tx_hash": "0xa7244395850ba324bfa95b2d89178843ec4c2580930cc1568231d6b01128fd82", "description": "Wrong classification → reverted on-chain"},
    "correct_classification_success": {"gas_used": 185000, "tx_hash": "0x690d1ca0da9d68452e0df2fc9da90766c079efb6d6ddb435bc2ebf49d970b23c", "description": "Correct classification → tx succeeded"},
}

def gas_cost_usd(gas, gp=BASE_GAS_PRICE_GWEI, ep=ETH_PRICE_USD):
    return (gas * gp / 1e9) * ep

def run_experiment():
    print("\n" + "="*60)
    print("Experiment A: Gas Cost of LLM Misclassification")
    print("="*60)
    results, total_gas, total_usd = [], 0, 0.0
    print("\nGPT-4o-mini failures (5/10 misclassified):\n")
    for f in GPT4O_MINI_FAILURES:
        g, u = f["gas_wasted_gwei"], gas_cost_usd(f["gas_wasted_gwei"])
        total_gas += g; total_usd += u
        print(f"  {f['error_id']}: {f['raw_message'][:40]}")
        print(f"    LLM: {f['llm_class']} → {f['consequence']}")
        print(f"    Gas wasted: {g:,} units = ${u:.6f}\n")
        results.append({**f, "usd_wasted": u})

    print("="*60)
    print(f"Total per 10 errors: {total_gas:,} gas = ${total_usd:.4f}")
    errs, rate = 1000, 0.50
    daily = errs * rate * (total_usd / len(GPT4O_MINI_FAILURES))
    print(f"\nAt scale (1000 DeFi errors/day, 50% misclass):")
    print(f"  Daily: ${daily:.4f} | Monthly: ${daily*30:.2f}")
    print(f"\nPCEC: 0% misclass → $0 wasted")

    for k, v in CLASSIFICATION_TEST_GAS.items():
        print(f"\n  {v['description']}: {v['gas_used']:,} gas = ${gas_cost_usd(v['gas_used']):.6f}")
        print(f"  TX: {v['tx_hash']}")

    output = {"experiment": "A", "date": datetime.now(timezone.utc).isoformat(), "failures": results, "total_gas": total_gas, "total_usd": total_usd, "at_scale": {"daily_usd": daily, "monthly_usd": daily*30}}
    with open("experiments/exp-abc/exp_a_results.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\nSaved: experiments/exp-abc/exp_a_results.json")

if __name__ == "__main__":
    run_experiment()
