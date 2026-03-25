# Changelog

## [1.7.0] - 2026-03-25

### Added
- **Failure Learning**: Records failed repairs in `failed_repairs` table. After 5 same-pattern failures, auto-distills a defensive Gene that blocks the ineffective strategy.
- **Multi-Dimensional Q-Scoring**: 6-dimension scoring (accuracy, costEfficiency, latency, safety, transferability, reliability) with weighted overall score. Stored as JSON in `scores` column.
- Schema v6: `failed_repairs` table + `scores` column on genes
- 314 tests across 35 files (from 299/33)

## [1.6.1] - 2026-03-25

### Added
- **REST API Server**: `npx helix serve` starts HTTP API for cross-language integration (Python, Go, Rust)
- POST /repair — send error, get diagnosis + strategy + repair result
- GET /health, /status, /genes — healthcheck, Gene Map stats, gene listing
- CORS enabled, zero external dependencies (node:http)
- 298 tests across 33 files (from 288/32)

## [1.5.0] - 2026-03-24

### Added
- **Error Embedding**: Token-based semantic error matching with 28 known signatures. Fuzzy matching when exact string match fails. `addSignature()` for custom patterns.
- **Strategy A/B Testing**: Controlled experiments for new repair strategies. 90/10 traffic split, auto-evaluation, variant promotion.
- **Gene Registry**: Push/pull shared repair knowledge across instances. Registry server with health/stats endpoints.
- 288 tests across 32 files (from 257/30)

## [1.4.0] - 2026-03-24

### Added
- **OpenTelemetry Integration**: Optional tracing spans + metrics (helix.repair.count, helix.immune.count, helix.repair.duration_ms). Zero overhead when not configured.
- **Audit Log**: repair_audit table records every repair attempt. npx helix audit, exportAudit() for SIEM/compliance.
- 247 tests across 29 files (from 235/28)

## [1.3.0] - 2026-03-24

### Added
- **Adaptive Learning Rate**: α dynamically adjusts based on observation count and recent variance
- **Bayesian Q-value**: Gene stores q ± σ (mean + uncertainty), Thompson Sampling for explore/exploit
- **Strategy Composition**: Multi-step repair chains [refresh_nonce → speed_up_transaction]
- **Context-Aware Gene Map**: Lookup adjusts Q-value based on gas price, time of day, chain ID similarity
- **Predictive Failure Graph**: Predicts next likely error, preloads Gene into L1 cache
- **Business-Level Verify**: User-provided verify() callback rejects technically-successful but logically-wrong repairs
- Schema v5 (from v3): q_variance, q_count, last_5_rewards, transition_probability, avg_delay_ms
- 235 tests across 28 files (from 174/23)

### Fixed
- Strategy chain overrides now propagate between steps (context spreading fix)
- avg_delay_ms incremental average calculation in gene_links

## [1.2.0] - 2026-03-23

### Added
- **LLM Perceive Fallback**: Unknown errors classified by Claude/GPT when string matching fails
- **LLM Construct Generator**: Suggests repair strategies for errors with no adapter candidates
- **Async Gene Reasoning**: LLM explains WHY strategies work (stored in Gene.reasoning)
- **Gene Telemetry**: Opt-in anonymous reporting of new error discoveries
- **Auto-detect**: `wrap()` recognizes viem-tx, fetch, generic-payment signatures automatically
- **Parameter injection**: Nonce/gas/value auto-corrected on retry (no `parameterModifier` needed)
- **Live Demo**: Multi-agent simulator + On-Call Dashboard (`npm run live`)
- **CLI `explain`**: `npx helix explain "error message"` shows diagnosis + reasoning
- **Structured Logger**: Custom logger support (pino/winston), JSON format, log levels
- **GitHub Actions CI**: Node 18/20/22 matrix
- **4 example projects**: basic-http, viem-transfer, express-api, agentkit
- 174 total tests across 23 files

### Changed
- LLM timeout increased from 2s to 8s for reliability
- Shared Gene Map across demo agents (IMMUNE works properly)
- Perceive patterns expanded for viem nonce error format
- Better error messages with actionable suggestions

### Fixed
- viem nonce error "Nonce provided for the transaction" now correctly classified
- "insufficient funds" pattern now matches (was only "insufficient balance")
- Demo dashboard SSE reconnection with relative URL

## [1.0.0] - 2026-03-22

### Added
- PCEC 6-stage engine (Perceive → Construct → Evaluate → Commit → Verify → Gene)
- Gene Map with Q-value RL scoring, L1 cache, schema versioning v3
- 26 repair strategies with real execution via viem
- 5 platform adapters (Tempo, Privy, Coinbase, Generic HTTP, Stripe)
- 31 failure scenarios, 12 seed genes
- Gene Combine, GC, reasoning, attribution, links
- Root cause hints (13 mappings), Zod validation
- simulate() testing framework, CLI, MCP server, MPP API
- 5 real tx hashes on Base Sepolia
- README, CONTRIBUTING.md, RUNBOOK, MIT license
