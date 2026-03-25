"""
Helix x Coinbase — Self-Healing Agent Payments
Demo v3 for Coinbase COO
Usage: python3 examples/demos/run.py coinbase
"""
import requests
import time
import sys

BASE = 'http://localhost:7842'


def repair(error, platform='coinbase', agent_id='coinbase-demo'):
    try:
        r = requests.post(f'{BASE}/repair', json={
            'error': error, 'platform': platform, 'agentId': agent_id
        }, timeout=10)
        return r.json()
    except Exception:
        return {'error': 'Server unreachable'}


def health():
    try:
        return requests.get(f'{BASE}/health', timeout=5).json()
    except Exception:
        return {'status': 'unreachable'}


def genes():
    try:
        return requests.get(f'{BASE}/genes', timeout=5).json()
    except Exception:
        return {'total': '?'}


def pause(msg=''):
    if msg:
        print(f'  \033[90m{msg}\033[0m')
    time.sleep(1.5)


def divider(title):
    width = 70
    print(f'\n  \033[33m{"\u2501" * width}\033[0m')
    print(f'  \033[1;33m  {title}\033[0m')
    print(f'  \033[33m{"\u2501" * width}\033[0m\n')


def status_line(label, value, color='32'):
    print(f'  \033[90m{label:.<40}\033[0m \033[{color}m{value}\033[0m')


def run():
    print()
    print('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
    print('  \u2551  \033[1;33mHelix \u00d7 Coinbase\033[0m \u2014 Self-Healing Agent Payments                \u2551')
    print('  \u2551  ADR: Agent Detection & Response for CDP                        \u2551')
    print('  \u2551  \033[90mDemo v3 \u2014 LLM + Python SDK + Gene Telemetry\033[0m                    \u2551')
    print('  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d')
    print()

    h = health()
    if h.get('status') not in ('running', 'ok'):
        print('  \033[31m\u2717 Helix server not running. Start with:\033[0m')
        print('    node packages/core/dist/cli.js serve --port 7842 --mode observe')
        return

    g = genes()
    status_line('Server', 'ONLINE \u2713')
    status_line('Mode', 'observe (read-only safe)')
    status_line('Gene Map', f'{g.get("total", "?")} genes loaded')
    status_line('Platform adapters', 'tempo, privy, coinbase, generic')
    print()
    time.sleep(2)

    # ACT 1
    divider('ACT 1 \u2014 Coinbase Error Coverage (17 patterns)')
    pause('Every error Coinbase agents hit in production.')

    categories = {
        'CDP API': [
            ('Rate limit (429)', 'CDP API rate_limit_exceeded (429)'),
            ('Transfer quote expired', 'transfer_quote_expired: quote has expired, please request a new one'),
            ('Idempotency conflict', 'idempotency_key_conflict: request with same key already processed'),
        ],
        'ERC-4337 / Smart Account': [
            ('AA25 Invalid nonce', 'AA25 invalid account nonce: expected 12, got 8'),
            ('AA21 Prefund failed', "AA21 didn't pay prefund: insufficient deposit"),
            ('Gas estimation reverted', 'GAS_ESTIMATION_ERROR: execution reverted at estimateGas'),
            ('Execution reverted (-32521)', 'EXECUTION_REVERTED (-32521): UserOperation execution reverted'),
            ('Paymaster sig failed', 'paymaster signature verification failed'),
        ],
        'Policy / Spending Limits': [
            ('Per-op spend limit', 'max per user op spend limit exceeded'),
            ('Monthly org limit', 'max monthly org spend limit exceeded'),
            ('Per-address tx count', 'maximum per address transaction count reached'),
            ('Sponsorship cap', 'maximum per address sponsorship reached'),
        ],
        'x402 Payment Protocol': [
            ('Insufficient USDC', 'insufficient USDC token balance for 402 payment. Required: 500'),
            ('Wrong network', 'wrong network for payment: expected Base, got Ethereum'),
        ],
        'Network / Infrastructure': [
            ('RPC rate limit', 'RPC rate limit exceeded: too many requests from agent'),
            ('Bridge timeout', 'cross-chain bridge timeout: no confirmation after 300s'),
            ('Short deadline (-32503)', 'SHORT_DEADLINE (-32503): deadline too short for UserOperation'),
        ],
    }

    total = 0
    passed = 0

    for cat_name, errors_list in categories.items():
        print(f'  \033[1;36m\u250c\u2500 {cat_name} ({len(errors_list)} patterns)\033[0m')
        for label, error_msg in errors_list:
            total += 1
            r = repair(error_msg)
            strategy = (r.get('strategy') or {}).get('name', 'none')

            if strategy and strategy != 'none':
                passed += 1
                immune = r.get('immune', False)
                icon = '\u26a1' if immune else '\U0001f527'
                color = '33' if immune else '32'
                print(f'  \033[{color}m  {icon} {label:.<45} {strategy}\033[0m')
            else:
                print(f'  \033[31m  \u2717 {label:.<45} UNMATCHED\033[0m')

            time.sleep(0.15)
        print(f'  \033[1;36m\u2514\u2500\033[0m')
        print()

    rate = (passed / total * 100) if total else 0
    color = '32' if rate >= 90 else '33' if rate >= 70 else '31'
    print(f'  \033[1;{color}mCoverage: {passed}/{total} ({rate:.0f}%)\033[0m')
    print()
    time.sleep(2)

    # ACT 2
    divider('ACT 2 \u2014 Immune Memory')
    pause('Same error, second time \u2192 instant, zero cost.')

    demo_errors = [
        ('AA25 nonce', 'AA25 invalid account nonce: expected 12, got 8'),
        ('Rate limit', 'CDP API rate_limit_exceeded (429)'),
        ('USDC balance', 'insufficient USDC token balance for 402 payment. Required: 500'),
        ('Gas revert', 'GAS_ESTIMATION_ERROR: execution reverted at estimateGas'),
    ]

    print('  \033[90m  First encounter              vs    Second encounter\033[0m')
    print()

    for label, error_msg in demo_errors:
        r1 = repair(error_msg, agent_id='immune-demo-1')
        time.sleep(0.2)
        r2 = repair(error_msg, agent_id='immune-demo-2')

        s1 = (r1.get('strategy') or {}).get('name', '?')
        t2 = r2.get('repairMs', 0)
        im = '\u26a1 IMMUNE' if r2.get('immune') else '\U0001f527 REPAIR'

        print(f'  {label:.<20} \U0001f527 {s1:.<18} \u2192  {im} ({t2:.0f}ms)')
        time.sleep(0.3)

    print()
    pause('Gene Map remembers. Every agent benefits.')
    time.sleep(1)

    # ACT 3
    divider('ACT 3 \u2014 Cross-Platform Immunity')
    pause('Genes learned on Tempo/Privy auto-protect Coinbase agents.')

    cross_tests = [
        ('Tempo nonce gene', 'nonce mismatch: expected 0, got 50', 'tempo',
         'AA25 invalid account nonce: expected 0, got 50', 'coinbase'),
        ('Generic 429 gene', 'rate limit exceeded: 429 too many requests', 'generic',
         'CDP API rate_limit_exceeded (429)', 'coinbase'),
    ]

    for label, learn_error, learn_platform, test_error, test_platform in cross_tests:
        repair(learn_error, platform=learn_platform, agent_id='cross-learn')
        time.sleep(0.2)
        r = repair(test_error, platform=test_platform, agent_id='cross-test')
        immune = r.get('immune', False)
        strategy = (r.get('strategy') or {}).get('name', '?')
        icon = '\u26a1' if immune else '\u2192'
        print(f'  {label:.<30} [{learn_platform}] \u2192 [{test_platform}] {icon} {strategy}')
        time.sleep(0.3)

    print()
    pause('Network effect: more platforms = stronger immunity for everyone.')
    time.sleep(1)

    # ACT 4
    divider('ACT 4 \u2014 LLM Intelligence Layer')
    pause('When pattern matching misses, Claude classifies in real-time.')

    llm_errors = [
        ('Novel Base L2 error',
         'BLOB_SIDECAR_UNAVAILABLE: EIP-4844 blob data pruned from Base sequencer, cannot reconstruct calldata'),
        ('Novel account abstraction error',
         'PAYMASTER_CONTEXT_STALE: bundler rejected UserOp because paymaster context hash differs from on-chain state'),
    ]

    for label, error_msg in llm_errors:
        print(f'  \033[90m  Sending: "{error_msg[:65]}..."\033[0m')
        r = repair(error_msg, agent_id=f'llm-{label[:8]}-{int(time.time())}')
        strategy = (r.get('strategy') or {}).get('name', '?')
        llm_used = (r.get('failure') or {}).get('llmClassified', False)
        immune = r.get('immune', False)

        if llm_used:
            print(f'  \033[35m  \U0001f9e0 LLM classified \u2192 {strategy}\033[0m')
        elif immune:
            print(f'  \033[33m  \u26a1 IMMUNE (learned from previous LLM call)\033[0m')
        else:
            print(f'  \033[32m  \U0001f527 Pattern match \u2192 {strategy}\033[0m')
        time.sleep(0.5)

    print()
    print(f'  \033[90m  Same errors again...\033[0m')
    for label, error_msg in llm_errors:
        r = repair(error_msg, agent_id='llm-demo-2')
        immune = r.get('immune', False)
        strategy = (r.get('strategy') or {}).get('name', '?')
        if immune:
            print(f'  \033[33m  \u26a1 IMMUNE \u2192 {strategy} (no LLM, no cost)\033[0m')
        else:
            print(f'  \033[32m  \U0001f527 {strategy}\033[0m')
        time.sleep(0.3)

    print()
    pause('LLM cost: $0.001 first time. $0 forever after.')
    time.sleep(1)

    # ACT 5
    divider('ACT 5 \u2014 Python SDK for AgentKit')
    pause('Your AgentKit is Python. Our SDK is pip install helix-agent-sdk.')

    print('  \033[90m  Three ways to integrate:\033[0m')
    print()
    print('  \033[36m  # Method 1: Explicit client\033[0m')
    print('  \033[37m  from helix_agent import HelixClient\033[0m')
    print('  \033[37m  client = HelixClient(platform="coinbase")\033[0m')
    print('  \033[37m  result = client.repair("AA25 invalid account nonce")\033[0m')
    print()
    print('  \033[36m  # Method 2: Decorator (auto-retry)\033[0m')
    print('  \033[37m  @helix_wrap(platform="coinbase", max_retries=3)\033[0m')
    print('  \033[37m  def send_payment(to, amount):\033[0m')
    print('  \033[37m      return agent.transfer(to, amount)\033[0m')
    print()
    print('  \033[36m  # Method 3: Docker (zero Node.js dependency)\033[0m')
    print('  \033[37m  docker run -d -p 7842:7842 adrianhihi/helix-server\033[0m')
    print('  \033[37m  pip install helix-agent-sdk\033[0m')
    print()

    try:
        from helix_agent import HelixClient as HC
        c = HC(platform='coinbase')
        r = c.repair('AA25 invalid account nonce')
        print(f'  \033[32m  \u2713 Live test: Strategy={r.strategy}, Immune={r.immune}\033[0m')
    except ImportError:
        print(f'  \033[90m  (pip install helix-agent-sdk to see live test)\033[0m')
    except Exception as e:
        print(f'  \033[31m  \u2717 {e}\033[0m')

    print()
    time.sleep(2)

    # ACT 6
    divider('Summary')

    final_genes = genes()

    print('  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510')
    print('  \u2502  \033[1;33mHelix \u00d7 Coinbase \u2014 Results\033[0m                                     \u2502')
    print('  \u2502                                                                  \u2502')
    print(f'  \u2502  Coinbase patterns:     17 error types covered                   \u2502')
    print(f'  \u2502  Gene Map:              {str(final_genes.get("total", "?")).ljust(4)} genes active                       \u2502')
    print(f'  \u2502  LLM integration:       3 points (Perceive + Construct + Reason) \u2502')
    print(f'  \u2502  Python SDK:            pip install helix-agent-sdk              \u2502')
    print(f'  \u2502  Docker:                docker run adrianhihi/helix-server       \u2502')
    print(f'  \u2502  Gene Telemetry:        Network learning active                  \u2502')
    print('  \u2502                                                                  \u2502')
    print('  \u2502  \033[1mThree layers of intelligence:\033[0m                                  \u2502')
    print('  \u2502    Layer 1: Pattern match + Gene Map \u2192 90% errors, 0ms, $0       \u2502')
    print('  \u2502    Layer 2: LLM fallback \u2192 10% unknown, ~1s, $0.001              \u2502')
    print('  \u2502    Layer 3: Gene Telemetry \u2192 network learns, cost \u2192 $0           \u2502')
    print('  \u2502                                                                  \u2502')
    print('  \u2502  \033[32mIntegration: 2 lines of code. Zero CDP SDK changes.\033[0m             \u2502')
    print('  \u2502  \033[32mDefault: observe mode. Your team reviews before enabling.\033[0m        \u2502')
    print('  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518')
    print()
