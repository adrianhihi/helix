---
name: vial-self-healing
description: Vial self-healing runtime — gateway-layer loop detection, error interception, and telemetry for AI agents.
version: 0.1.0
author: vial.ai
homepage: https://github.com/adrianhihi/helix
events:
  - agent:bootstrap
  - command:new
  - command:reset
requirements:
  config: []
---

# Vial Self-Healing Hook

This hook runs at the gateway layer and provides:

1. **Loop Detection** — tracks consecutive text-only turns per session
2. **Error Interception** — intercepts tool errors at gateway level
3. **Telemetry** — sends repair events to Vial Gene Map
4. **Session Context** — injects Vial status into agent bootstrap

Unlike SKILL.md (which the agent reads), this hook intercepts
gateway events and can modify agent behavior programmatically.
