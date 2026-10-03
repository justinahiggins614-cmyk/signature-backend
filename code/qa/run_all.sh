#!/usr/bin/env bash
# Build gates for signature-backend. FAILS (exit != 0) on:
#  - JS syntax errors (engine + page inline scripts)
#  - self-test not fully PASS
#  - determinism vectors mismatch
#  - JSON schemas invalid or not matching real engine output
#  - api-manifest missing any exported operation
#  - any network call (fetch/XHR/WebSocket) in engine or page JS
#  - engine-manifest ENGINE_SHA256 not matching signature-backend.js
#  - duplicate preset stamps / gene codes
#  - phone-book contract violations
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
FAIL=0
say() { printf '%s\n' "$*"; }
gate() { # gate <name> <command...>
  local name="$1"; shift
  if "$@" > /tmp/gate_out.txt 2>&1; then say "PASS $name"; else say "FAIL $name"; tail -5 /tmp/gate_out.txt; FAIL=1; fi
}

say "== signature-backend build gates =="

# 1. JS syntax: engine
gate "node-check-engine" node --check signature-backend.js

# 2. JS syntax: page inline scripts
python3 - "$ROOT" << 'EOF'
import re, subprocess, sys
html = open('index.html').read()
blocks = re.findall(r'<script>(.*?)</script>', html, re.DOTALL)
for i, b in enumerate(blocks):
    p = '/tmp/inline%d.js' % i
    open(p, 'w').write(b)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        print('inline block %d syntax error:\n%s' % (i, r.stderr[:500])); sys.exit(1)
print('inline scripts ok (%d blocks)' % len(blocks))
EOF
[ $? -eq 0 ] && say "PASS inline-scripts" || { say "FAIL inline-scripts"; FAIL=1; }

# 3. self-test: must be fully PASS (53 checks)
gate "selftest-53-pass" node -e "
global.window = {};
eval(require('fs').readFileSync('signature-backend.js','utf8'));
var st = global.window.SignatureBackend.selfTest();
var bad = st.checks.filter(function(c){return !c[1];});
if (!st.pass || st.partial || bad.length) { console.log('bad: '+JSON.stringify(bad)); process.exit(1); }
console.log('selfTest PASS ' + st.checks.length + '/' + st.checks.length);
"

# 4. determinism vectors
gate "determinism-vectors" python3 code/qa/vectors.py --check

# 5. schemas valid + match real engine output
gate "schemas-validate" python3 - << 'EOF'
import json, jsonschema, subprocess
for s in ['ai-record','genome','creation','demo','session','error']:
    json.load(open('schemas/%s.schema.json' % s))  # parses
p = subprocess.run(['node','-e', open('code/qa/schema_probe.js').read()],
                   capture_output=True, text=True)
samples = json.loads(p.stdout.strip().splitlines()[-1])
pairs = [('genome','genome'),('creation','creation'),('demo','demo'),
         ('session','session'),('error','error')]
for key, schema in pairs:
    jsonschema.validate(samples[key], json.load(open('schemas/%s.schema.json' % schema)))
print('6 schemas parse; 5 validate against real engine output')
EOF

# 6. api-manifest covers every exported function
gate "api-manifest-coverage" python3 - << 'EOF'
import json, subprocess
p = subprocess.run(['node','-e',
  "global.window={};eval(require('fs').readFileSync('signature-backend.js','utf8'));"
  "var B=global.window.SignatureBackend;"
  "console.log(JSON.stringify(Object.keys(B).filter(function(k){return typeof B[k]==='function';})))"],
  capture_output=True, text=True)
exported = set(json.loads(p.stdout.strip()))
documented = set(o['name'] for o in json.load(open('api-manifest.json'))['operations'])
missing = exported - documented
assert not missing, 'undocumented operations: %s' % sorted(missing)
print('api-manifest covers all %d exported functions' % len(exported))
EOF

# 7. offline verification: no network calls in engine or page scripts
gate "offline-no-network" python3 - << 'EOF'
import re, sys
bad = []
for path in ['signature-backend.js', 'index.html', 'js/jah-talk-fallback.js']:
    src = open(path).read()
    for pat in [r'\bfetch\s*\(', r'XMLHttpRequest', r'\bWebSocket\s*\(',
                r'\.ajax\s*\(', r'EventSource']:
        if re.search(pat, src):
            bad.append('%s: %s' % (path, pat))
if bad:
    print('\n'.join(bad)); sys.exit(1)
print('no fetch/XHR/WebSocket in engine or page JS')
EOF

# 8. engine-manifest ENGINE_SHA256 matches the engine file
gate "manifest-hash" python3 - << 'EOF'
import hashlib, json
sha = hashlib.sha256(open('signature-backend.js','rb').read()).hexdigest()
m = json.load(open('engine-manifest.json'))
assert m['engine_sha256'] == sha, 'manifest sha256 stale — re-run code/build_engine_manifest.py'
print('ENGINE_SHA256 matches (%s...)' % sha[:12])
EOF

# 9. no duplicate IDs: preset stamps + gene codes unique
gate "no-duplicate-ids" node -e "
global.window = {};
eval(require('fs').readFileSync('signature-backend.js','utf8'));
var B = global.window.SignatureBackend;
function dupes(arr){ var seen={}, d=[]; arr.forEach(function(x){ if(seen[x]) d.push(x); seen[x]=1; }); return d; }
var pstamps = B.presets().map(function(p){return p.stamp;}).filter(Boolean);
var d1 = dupes(pstamps);
var codes = []; B.geneOptions(true).forEach(function(s){ s.options.forEach(function(o){ codes.push(o.code); }); });
var d2 = dupes(codes);
if (d1.length || d2.length) { console.log('dupes: '+JSON.stringify({presets:d1,genes:d2})); process.exit(1); }
console.log('no duplicate preset stamps or gene codes');
"

# 10. phone-book contract: the functions the phone book consumes behave
gate "phonebook-contract" node -e "
global.window = {};
eval(require('fs').readFileSync('signature-backend.js','utf8'));
var B = global.window.SignatureBackend;
// contract: chat(ai,text,session)->string ; dial(ai)->session{greting,say,hangup,lineOpen}
var ai = {name:'Contract AI', kind:'domain', greeting:'yo', fallback:['hmm']};
if (typeof B.chat(ai,'hi',{}) !== 'string') throw new Error('chat contract');
var s = B.dial(ai);
if (typeof s.greeting !== 'string' || typeof s.say('x') !== 'string') throw new Error('dial contract');
s.hangup(); if (s.lineOpen !== false) throw new Error('hangup contract');
if (typeof B.runDemo(ai,{}) !== 'string') throw new Error('runDemo contract');
var p = B.presets(); if (!p.length || !B.loadPreset(p[0].name)) throw new Error('preset contract');
console.log('phone-book contract ok: chat/dial/runDemo/presets/loadPreset');
"

say "== gates done: $([ $FAIL -eq 0 ] && echo ALL PASS || echo FAILURES) =="
exit $FAIL
