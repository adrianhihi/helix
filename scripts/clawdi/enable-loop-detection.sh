#!/bin/bash
# Enable OpenClaw's built-in loop detection
# Run this in Clawdi terminal once

python3 << 'EOF'
import json

with open('/root/.openclaw/openclaw.json') as f:
    config = json.load(f)

if 'tools' not in config:
    config['tools'] = {}

config['tools']['loopDetection'] = {
    'enabled': True,
    'warningThreshold': 3,
    'criticalThreshold': 6,
    'globalCircuitBreakerThreshold': 10,
    'historySize': 15,
    'detectors': {
        'genericRepeat': True,
        'knownPollNoProgress': True,
        'pingPong': True
    }
}

with open('/root/.openclaw/openclaw.json', 'w') as f:
    json.dump(config, f, indent=2)

print('✅ OpenClaw native loop detection enabled')
print('  warningThreshold: 3 turns')
print('  criticalThreshold: 6 turns')
EOF
