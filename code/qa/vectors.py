#!/usr/bin/env python3
"""Determinism test vectors for the Signature engine.

  vectors.py --write   run the engine in node and record the vectors file
  vectors.py --check   re-run and diff against the recorded file

A vector is a fixed call with a fixed expected result. Deterministic
functions (buildGenome, runDemo, labCatalogs, animateCreation, recordHash,
presets, geneOptions, fileRecord error shape) must return byte-identical
results; non-deterministic ones (chat replies, dial sessions, JAH-AI-OP
stamps) get shape assertions only — chat() replies are intentionally
varied by design, and that is documented, not a bug.
"""
import json
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
VECTORS = os.path.join(HERE, "test_vectors.json")

PROBE = r"""
global.window = {};
eval(require('fs').readFileSync(%s, 'utf8'));
var B = global.window.SignatureBackend;
var V = {};
var genes = {INPUT:'F-IFU',REASON:'F-RAE',OUTPUT:'F-OAO',MEMORY:'F-KMMU',
  ETHICS:'F-EGCU',REPAIR:'F-SDR',RESOURCE:'F-RM',LEARN:'F-ALAOU',
  INTERFACE:'F-AUIX',COMMS:'F-ECU'};
var g = B.buildGenome({genes: genes, name: 'Vector', kind: 'domain'});
V.genome = {genome_id: g.genome_id, stamp: g.stamp, name: g.name,
  generator_version: g.generator_version, schema_version: g.schema_version};
V.genome_again = B.buildGenome({genes: genes, name: 'Vector', kind: 'domain'}).genome_id;
V.demo_extinction = B.runDemo({name:'x',kind:'domain',demoKind:'extinction-calculus'},
  {population:8, tech:10});
V.demo_checklist = B.runDemo({name:'x',kind:'domain',demoKind:'checklist'}, {items:[1,0,1]});
V.demo_guided = B.runDemo({name:'x',kind:'domain'}, {});
V.presets = B.presets().map(function (p) { return p.name + '|' + (p.stamp||''); });
V.gene_slots = B.geneOptions(false).map(function (s) { return s.key; });
V.gene_counts = B.geneOptions(false).map(function (s) { return s.options.length; });
V.gene_counts_adv = B.geneOptions(true).map(function (s) { return s.options.length; });
var cats = B.labCatalogs();
V.shelves = cats.map(function (c) { return c.name + ':' + c.count; });
V.shelf_total = cats.reduce(function (n, c) { return n + c.count; }, 0);
var c = B.animateCreation({base:'paragon', picks:{parts:['BP00-00'],brains:['BR-00'],power:['PW-00']}});
V.creation = {stamp: c.stamp, name: c.name};
var c2 = B.animateCreation({base:'paragon', picks:{power:['PW-00'],brains:['BR-00'],parts:['BP00-00']}});
V.creation_reordered_stamp = c2.stamp;
V.record_hash = B.recordHash({a:1,b:[2,3]});
V.viable = B.genomeViable(Object.keys(genes).map(function (k) { return genes[k]; })).ready;
var s = B.dial({name:'v', kind:'domain', fallback:['z']});
V.dial_say = typeof s.say('hello');
V.dial_greeting = typeof s.greeting;
s.hangup();
V.chat_type = typeof B.chat({name:'v',kind:'domain',fallback:['z']}, 'hello', {});
V.error_shape = (function () { try { B.buildGenome({genes:{BOGUS:'F-IFU'}}); return null; }
  catch (e) { return {error_code: e.error_code, engine_version: e.engine_version,
    api_version: e.api_version, recoverable: e.recoverable, is_error: (e instanceof Error)}; } })();
V.caps = (function () { var c = B.capabilities();
  return {ops: c.operations.length, shelves: c.catalogs.shelves, slots: c.catalogs.gene_slots,
    offline: c.offline, net: c.network_calls.length}; })();
V.versions = {version: B.version, apiVersion: B.apiVersion, backendId: B.backendId,
  schemaVersion: B.schemaVersion};
console.log(JSON.stringify(V));
""" % json.dumps(os.path.join(ROOT, "signature-backend.js"))


def run_engine():
    p = subprocess.run(["node", "-e", PROBE], capture_output=True, text=True,
                       timeout=120)
    if p.returncode != 0:
        print("node probe failed:\n" + (p.stderr or "")[:2000], file=sys.stderr)
        sys.exit(1)
    try:
        return json.loads((p.stdout or "").strip().splitlines()[-1])
    except Exception:
        print("no JSON from probe:\n" + (p.stdout or "")[:2000], file=sys.stderr)
        sys.exit(1)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    actual = run_engine()
    if mode == "--write":
        doc = {"engine": "signature-backend.js",
               "note": "Fixed calls with fixed expected results. "
                       "chat()/dial() replies and JAH-AI-OP stamps are intentionally "
                       "non-deterministic (documented); they get shape assertions only.",
               "vectors": actual}
        with open(VECTORS, "w") as f:
            json.dump(doc, f, indent=2)
        print("wrote %s (%d vectors)" % (VECTORS, len(actual)))
        return
    with open(VECTORS) as f:
        expected = json.load(f)["vectors"]
    bad = []
    for k, exp in expected.items():
        got = actual.get(k, "<missing>")
        if got != exp:
            bad.append((k, exp, got))
    if bad:
        print("DETERMINISM FAILURE: %d/%d vectors differ" % (len(bad), len(expected)))
        for k, exp, got in bad[:10]:
            print("  " + k)
            print("    expected: " + json.dumps(exp)[:220])
            print("    actual:   " + json.dumps(got)[:220])
        sys.exit(1)
    print("determinism vectors: %d/%d match" % (len(expected), len(expected)))


if __name__ == "__main__":
    main()
