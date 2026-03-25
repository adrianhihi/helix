"""
Coinbase-specific demo — 17 Coinbase/CDP failure modes across 5 categories.
Usage: python examples/demos/run.py coinbase
"""
from lib.helpers import *
import json as jsonlib


def run():
    header("Helix x Coinbase — Self-Healing Agent Payments", "ADR: Agent Detection & Response for CDP")
    ensure_helix()
    pause()

    # Show pre-demo stats
    status = get_status()
    genes = get_genes()
    print(f"  \u250c\u2500 Pre-Demo Status \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
    print(f"  \u2502  Gene Map:     {status.get('geneCount', '?')} genes loaded")
    print(f"  \u2502  Platforms:    {', '.join(status.get('platforms', []))}")
    print(f"  \u2502  Total repairs: {status.get('totalRepairs', '?')}")
    print(f"  \u2502  Mode:         {status.get('mode', '?')}")
    print(f"  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
    print()
    pause()

    categories = [
        ("CDP API / Server  [3 patterns]", [
            ("CDP API rate limit (429)",
             "CDP API rate_limit_exceeded (429)",
             "High-frequency agents hit CDP rate limits.",
             "backoff_retry with exponential delay + jitter"),
            ("Transfer quote expired",
             "transfer_quote_expired: quote has expired, please request a new one",
             "Stale quotes from slow agent execution.",
             "renew_session \u2192 request fresh quote \u2192 retry"),
            ("Internal server error (500)",
             "internal_server_error: CDP 500 internal server error",
             "CDP backend instability.",
             "retry_with_receipt \u2192 verify idempotency \u2192 backoff"),
        ]),
        ("ERC-4337 / Smart Wallet  [7 patterns]", [
            ("AA25 Nonce desync",
             "AA25 invalid account nonce: expected 12, got 8",
             "Concurrent agent wallets desync nonces.",
             "refresh_nonce \u2192 query on-chain nonce \u2192 resubmit"),
            ("AA21 Prefund failure",
             "AA21 didn't pay prefund: insufficient deposit",
             "Smart account can't cover execution gas.",
             "reduce_request \u2192 lower gas limit or top-up EntryPoint deposit"),
            ("AA13 initCode failed",
             "AA13 initCode failed or OOG: wallet deployment reverted",
             "First-time smart wallet deployment fails.",
             "reduce_request \u2192 increase gas for deployment \u2192 retry"),
            ("UserOp execution reverted",
             "EXECUTION_REVERTED (-32521): UserOperation execution reverted",
             "Smart account call reverts on-chain.",
             "remove_and_resubmit \u2192 analyze revert data \u2192 adjust calldata"),
            ("Paymaster signature failed",
             "paymaster signature verification failed",
             "Invalid paymaster sponsorship signature.",
             "refresh_nonce \u2192 re-request paymaster sponsorship \u2192 fresh sig"),
            ("Gas estimation error",
             "GAS_ESTIMATION_ERROR (-32004): Gas estimation failed for userOp",
             "Bundler can't estimate gas for this UserOp.",
             "reduce_request \u2192 simplify calldata or increase gas buffer"),
            ("Paymaster internal error",
             "INTERNAL_ERROR: paymaster service temporarily unavailable",
             "Coinbase paymaster backend down.",
             "retry_with_receipt \u2192 backoff \u2192 fallback to self-pay gas"),
        ]),
        ("Policy / Spending Limits  [3 patterns]", [
            ("Per-UserOp spend limit",
             "max per user op spend limit exceeded",
             "Single operation exceeds policy cap.",
             "split_transaction \u2192 break into smaller operations under limit"),
            ("Monthly org spend limit",
             "max monthly org spend limit exceeded for this organization",
             "Organization hit monthly spending ceiling.",
             "split_transaction \u2192 queue for next billing cycle or escalate"),
            ("Per-address tx count limit",
             "maximum per address transaction count exceeded",
             "Too many txs from one address in time window.",
             "split_transaction \u2192 rotate to secondary address or batch"),
        ]),
        ("x402 Payment Protocol  [2 patterns]", [
            ("Insufficient USDC for 402",
             "insufficient USDC token balance for 402 payment. Required: 500",
             "Agent wallet can't cover x402 payment.",
             "reduce_request \u2192 lower payment amount or alert for top-up"),
            ("Wrong network",
             "wrong network: payment requires Base but wallet is on Ethereum",
             "Agent wallet on wrong chain for this payment.",
             "switch_service \u2192 detect correct chain \u2192 bridge or switch RPC"),
        ]),
        ("Network / Timeout  [2 patterns]", [
            ("Cross-chain bridge timeout",
             "cross-chain bridge timeout: no confirmation after 300s",
             "Bridge transfer stuck without confirmation.",
             "backoff_retry \u2192 monitor bridge status \u2192 extended timeout"),
            ("Gateway timeout (504)",
             "504 gateway timed_out: upstream service did not respond",
             "CDP gateway timeout under load.",
             "backoff_retry \u2192 switch to backup endpoint if available"),
        ]),
    ]

    total = sum(len(errors) for _, errors in categories)
    succeeded = 0
    total_ms = 0
    strategies_used = set()

    for cat_name, errors in categories:
        print(f"\n  \u250c\u2500 {cat_name} {'\u2500' * (50 - len(cat_name))}")
        for name, error, explanation, repair_detail in errors:
            section(f"{name}")
            print(f"  Error:    {error}")
            print(f"  Impact:   {explanation}")
            print(f"  Strategy: {repair_detail}")
            r = repair(error, platform="coinbase", agent_id="cdp-agent")

            failure = r.get("failure", {})
            strategy = r.get("strategy", {})
            immune = r.get("immune", False)
            ms = r.get("repairMs", 0)
            scores = r.get("scores", {})

            strat_name = strategy.get("name", "none") if strategy else "none"
            icon = "\u26a1 IMMUNE" if immune else "\u2705 REPAIRED"

            print(f"  Result:   {icon} via {strat_name} ({ms}ms)")
            print(f"  Class:    {failure.get('code', '?')} / {failure.get('category', '?')} / severity:{failure.get('severity', '?')}")

            if scores:
                score_parts = [f"{k}={v:.2f}" if isinstance(v, float) else f"{k}={v}" for k, v in scores.items()]
                print(f"  Scores:   {' | '.join(score_parts)}")

            if failure.get("code") != "unknown":
                succeeded += 1
            total_ms += ms
            if strat_name != "none":
                strategies_used.add(strat_name)

            pause(0.5)
        print()

    # Cross-platform gene transfer demo
    print(f"  \u250c\u2500 Cross-Platform Gene Transfer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
    print(f"  \u2502")
    print(f"  \u2502  Coinbase nonce repair gene also protects:")

    r_tempo = repair("nonce mismatch: expected 0, got 50", platform="tempo", agent_id="tempo-agent")
    tempo_ms = r_tempo.get("repairMs", 0)
    t_strat = r_tempo.get("strategy", {})
    print(f"  \u2502  \u2192 Tempo agents:  {r_tempo['failure']['code']} \u2192 {t_strat.get('name', '?') if t_strat else '?'} ({tempo_ms}ms)")

    r_privy = repair("privy embedded wallet: nonce desynchronization detected", platform="privy", agent_id="privy-agent")
    privy_ms = r_privy.get("repairMs", 0)
    p_strat = r_privy.get("strategy", {})
    print(f"  \u2502  \u2192 Privy agents:  {r_privy['failure']['code']} \u2192 {p_strat.get('name', '?') if p_strat else '?'} ({privy_ms}ms)")

    print(f"  \u2502")
    print(f"  \u2502  One agent's failure \u2192 entire network's immunity.")
    print(f"  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
    print()

    # Summary stats
    avg_ms = total_ms / total if total > 0 else 0

    result_box([
        f"\u2705 {succeeded}/{total} Coinbase failure modes diagnosed",
        f"\u26a1 Average repair: {avg_ms:.1f}ms | Immune repeat: <1ms",
        f"\U0001f9ec {len(strategies_used)} unique strategies: {', '.join(sorted(strategies_used))}",
        f"\U0001f504 Cross-platform: Coinbase genes protect Tempo + Privy",
        "",
        "Architecture:",
        f"  Perceive:   4-layer classification (adapter \u2192 embedding \u2192 LLM \u2192 unknown)",
        f"  Construct:  {genes.get('total', '?')} genes \u00d7 Bayesian Q-value ranking",
        f"  Evaluate:   Thompson Sampling + multi-dimensional scoring",
        f"  Commit:     Execute \u2192 verify \u2192 learn \u2192 Gene Map update",
        "",
        "npm install @helix-agent/core",
        "Zero changes to Coinbase CDP SDK. Runtime wrapper only.",
    ])
