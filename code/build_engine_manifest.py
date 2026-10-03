#!/usr/bin/env python3
"""Build engine-manifest.json: permanent backend identity + provenance.

Fields: backend_id (JAH-BACKEND-1), engine/api/schema versions, ENGINE_SHA256
of signature-backend.js, per-shelf catalog counts + content hashes, gene box
counts, preset list, self-test summary, canonical URLs, changelog pointer.
Re-run after every engine change; the QA gate compares ENGINE_SHA256.
"""
import hashlib
import json
import subprocess
import datetime
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENGINE = os.path.join(ROOT, "signature-backend.js")
OUT = os.path.join(ROOT, "engine-manifest.json")

PROBE = r"""
global.window = {};
eval(require('fs').readFileSync(%s, 'utf8'));
var B = global.window.SignatureBackend;
var crypto = require('crypto');
var out = {version: B.version, api_version: B.apiVersion, backend_id: B.backendId,
  schema_version: B.schemaVersion, shelfes: [], gene_slots: [], presets: []};
B.labCatalogs().forEach(function (c) {
  var items = B.labOptions(c.key);
  var names = items.map(function (it) { return it.name || it.label || it.code || it.id || ''; });
  out.shelfes.push({name: c.name, key: c.key, count: c.count,
    sha256: crypto.createHash('sha256').update(names.join('\n')).digest('hex')});
});
B.geneOptions(true).forEach(function (s) {
  out.gene_slots.push({key: s.key, name: s.name, options: s.options.length});
});
out.presets = B.presets().map(function (p) { return {name: p.name, stamp: p.stamp || null}; });
try {
  var st = B.selfTest();
  out.selftest = {pass: !!st.pass, total: st.checks.length};
} catch (e) { out.selftest = {pass: false, total: 0}; }
console.log(JSON.stringify(out));
""" % json.dumps(ENGINE)


def main():
    with open(ENGINE, "rb") as f:
        engine_bytes = f.read()
    engine_sha = hashlib.sha256(engine_bytes).hexdigest()
    p = subprocess.run(["node", "-e", PROBE], capture_output=True, text=True,
                       timeout=180)
    if p.returncode != 0:
        print("probe failed:\n" + (p.stderr or "")[:2000])
        raise SystemExit(1)
    info = json.loads((p.stdout or "").strip().splitlines()[-1])
    manifest = {
        "backend_id": info["backend_id"],
        "engine": "signature-backend.js",
        "engine_version": info["version"],
        "api_version": info["api_version"],
        "schema_version": info["schema_version"],
        "engine_sha256": engine_sha,
        "generated": datetime.date.today().isoformat(),
        "shelfes": info["shelfes"],
        "gene_slots": info["gene_slots"],
        "presets": info["presets"],
        "selftest": info["selftest"],
        "changelog": "CHANGELOG.md",
        "canonical_urls": {
            "site": "https://justinahiggins614-cmyk.github.io/signature-backend/",
            "engine": "https://justinahiggins614-cmyk.github.io/signature-backend/signature-backend.js",
            "manifest": "https://justinahiggins614-cmyk.github.io/signature-backend/engine-manifest.json",
        },
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("wrote %s (engine_sha256 %s...)" % (OUT, engine_sha[:12]))


if __name__ == "__main__":
    main()
