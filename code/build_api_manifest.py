#!/usr/bin/env python3
"""Build api-manifest.json from the engine's own capabilities().

The operation NAME/PURPOSE/INPUT/OUTPUT/ERRORS/DETERMINISM/SIDE EFFECTS/
PERMISSIONS/VERSION table is the formal API doc required by the fix list.
capabilities() supplies name/version/determinism/side_effects/notes; this
builder adds the static formal fields (purpose, input, output, errors,
permissions) and the compatibility/version metadata.
"""
import json
import subprocess
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "api-manifest.json")

FORMAL = {
    "chat": {
        "purpose": "Generate one reply from an AI record to user text, with call-duration memory.",
        "input": "ai (record), text (string), session (object, optional memory)",
        "output": "string reply. Varied by design; never substring-matched.",
        "errors": ["none thrown; unknown input falls back to fallback lines"],
        "permissions": "none — pure local computation",
    },
    "dial": {
        "purpose": "Open a live dial-up session with an AI (greeting, say/runDemo/lockRole/hangup, transcript).",
        "input": "aiRecord (object with name or greeting)",
        "output": "session object (sessionId JAH-SESSION-######)",
        "errors": ["DIAL_BAD_RECORD (recoverable) — aiRecord missing/invalid"],
        "permissions": "none — in-memory session only; nothing persisted, nothing sent",
    },
    "runDemo": {
        "purpose": "Run an AI's working demo script with given inputs; returns the result string.",
        "input": "ai (record), inputs (object)",
        "output": "string result; deterministic per demo kind",
        "errors": ["none thrown; guided demos narrate the input list"],
        "permissions": "none",
    },
    "runDemoReceipt": {
        "purpose": "runDemo plus a permanent demo receipt (JAH-DEMO-######).",
        "input": "ai (record), inputs (object)",
        "output": "receipt object {demo_id, ai_id, demo_kind, inputs, output, versions, ran_at}",
        "errors": ["same as runDemo"],
        "permissions": "none — in-memory counter only",
    },
    "presets": {
        "purpose": "List the 6 built-in archetype presets (one model of each kind).",
        "input": "none",
        "output": "array of preset records",
        "errors": [],
        "permissions": "none",
    },
    "loadPreset": {
        "purpose": "Load one preset by name (older names resolve via permanent aliases); returns a fresh copy.",
        "input": "name (string)",
        "output": "preset record, or null if unknown",
        "errors": ["returns null — never throws"],
        "permissions": "none",
    },
    "geneOptions": {
        "purpose": "List The Opperater's gene slots and boxes (10 slots x 18 = 180; advanced unlocks more).",
        "input": "advanced (boolean, default false)",
        "output": "array of slot objects {key, name, mirror, options[]}",
        "errors": [],
        "permissions": "none",
    },
    "genomeViable": {
        "purpose": "Check whether a set of gene codes covers all viability groups.",
        "input": "drops (array of gene codes)",
        "output": "{ready: boolean, missing: [descriptions]}",
        "errors": [],
        "permissions": "none",
    },
    "buildGenome": {
        "purpose": "Forge an AI genome record from chosen gene codes (deterministic).",
        "input": "{genes: {SLOT: code}, name, kind, advanced?} — full or partial slot map",
        "output": "AI record {id, name, stamp JAH-AI-OPR-XXXX, genome_id JAH-GENOME-XXXXXX, ...}",
        "errors": ["GENOME_UNKNOWN_SLOT", "GENOME_UNKNOWN_CODE", "GENOME_ADVANCED_LOCKED (all recoverable)"],
        "permissions": "none",
    },
    "fileRecord": {
        "purpose": "Stamp a genome/preset as a filed AI record (JAH-AI-OP-######) with downloadable .py/.json. Local-first: nothing saved or published.",
        "input": "rec (buildGenome/loadPreset result with a name)",
        "output": "{record, downloadPy, downloadJson}",
        "errors": ["FILERECORD_BAD_RECORD", "FILERECORD_NOT_SERIALIZABLE (both recoverable)"],
        "permissions": "none — in-memory stamp counter only",
    },
    "tones": {
        "purpose": "List the available speech tone presets.",
        "input": "none",
        "output": "array of {key, label, rate, pitch}",
        "errors": [],
        "permissions": "none",
    },
    "labCatalogs": {
        "purpose": "List the 8 Creation Lab shelfes (separate from the 10 Opperater gene slots).",
        "input": "none",
        "output": "array of {name, count}",
        "errors": [],
        "permissions": "none",
    },
    "labOptions": {
        "purpose": "Options for one shelf (paginated).",
        "input": "shelfName (string), page (number, default 0)",
        "output": "{total, items[]}",
        "errors": [],
        "permissions": "none",
    },
    "animateCreation": {
        "purpose": "Animate a creation from a base archetype + shelf picks (deterministic: same picks => same record).",
        "input": "{base, picks: {shelf: [codes]}}",
        "output": "creation record {stamp JAH-LAB-XXXXXX, name, description, svg, abilities, ...}",
        "errors": ["unknown base falls back to a blank slab — never throws"],
        "permissions": "none",
    },
    "creationToAI": {
        "purpose": "Turn a creation record into a dialable AI record.",
        "input": "creation (animateCreation result)",
        "output": "AI record",
        "errors": [],
        "permissions": "none",
    },
    "labDemo": {
        "purpose": "Scripted field-test simulation for a creation (narrative, not a measurement).",
        "input": "creation (animateCreation result)",
        "output": "string narrative",
        "errors": [],
        "permissions": "none",
    },
    "recordHash": {
        "purpose": "Deterministic content hash of a record (excludes volatile filing fields).",
        "input": "rec (object)",
        "output": "8-char uppercase hex string",
        "errors": [],
        "permissions": "none",
    },
    "capabilities": {
        "purpose": "Machine-readable capability discovery: operations, catalog counts, offline claim.",
        "input": "none",
        "output": "capability object",
        "errors": [],
        "permissions": "none",
    },
    "health": {
        "purpose": "Lightweight status probe (full suite is selfTest).",
        "input": "none",
        "output": "{status UP|DEGRADED, quick_checks, version, offline, timestamp}",
        "errors": [],
        "permissions": "none",
    },
    "selfTest": {
        "purpose": "Run the full engine self-test suite (PASS / PARTIAL / FAIL, per-item results).",
        "input": "none",
        "output": "{pass, partial, checks: [[name, bool]]}",
        "errors": [],
        "permissions": "none — bumps the in-memory file-stamp counter as a side effect of testing fileRecord",
    },
    "EngineError": {
        "purpose": "Structured error factory: every throw is an Error carrying a machine-readable code.",
        "input": "code (string), message (string), operation (string), recoverable (boolean)",
        "output": "Error with error_code/message_text/operation/engine_version/api_version/recoverable",
        "errors": ["known codes documented in schemas/error.schema.json"],
        "permissions": "none",
    },
}


def main():
    probe = ("global.window = {};\n"
             "eval(require('fs').readFileSync(%s, 'utf8'));\n"
             "console.log(JSON.stringify(global.window.SignatureBackend.capabilities()));"
             ) % json.dumps(os.path.join(ROOT, "signature-backend.js"))
    p = subprocess.run(["node", "-e", probe], capture_output=True, text=True,
                       timeout=120)
    if p.returncode != 0:
        print("capabilities probe failed:\n" + (p.stderr or "")[:2000])
        raise SystemExit(1)
    caps = json.loads((p.stdout or "").strip().splitlines()[-1])

    operations = []
    for op in caps["operations"]:
        formal = FORMAL.get(op["name"], {})
        operations.append({
            "name": op["name"],
            "purpose": formal.get("purpose", op.get("note", "")),
            "input": formal.get("input", ""),
            "output": formal.get("output", ""),
            "errors": formal.get("errors", []),
            "determinism": "deterministic" if op.get("deterministic") else "non-deterministic by design",
            "side_effects": op.get("side_effects", "none"),
            "permissions": formal.get("permissions", "none"),
            "version": op.get("version", caps["api_version"]),
            "note": op.get("note", ""),
        })

    manifest = {
        "api": "Signature Engine API",
        "backend_id": caps["backend_id"],
        "engine": caps["engine"],
        "engine_version": caps["engine_version"],
        "api_version": caps["api_version"],
        "schema_version": caps["schema_version"],
        "operations": operations,
        "catalogs": caps["catalogs"],
        "offline": caps["offline"],
        "network_calls": caps["network_calls"],
        "dependencies": caps["dependencies"],
        "compatibility": {
            "api_versioning": "api_version is pinned at 2.0. Breaking changes bump it; "
                              "additive functions never do.",
            "callers": ["phone book (dial/chat/runDemo per AI)", "index.html status panel",
                        "generated .py files (standalone, no engine dependency)"],
            "presets": "Older preset names resolve via permanent PRESET_ALIASES; removed names keep aliases.",
            "records": "JAH-LAB-###### / JAH-AI-OP-###### / JAH-GENOME-###### / JAH-DEMO-###### / "
                       "JAH-SESSION-###### formats are permanent.",
        },
        "canonical_urls": {
            "site": "https://justinahiggins614-cmyk.github.io/signature-backend/",
            "engine": "https://justinahiggins614-cmyk.github.io/signature-backend/signature-backend.js",
            "manifest": "https://justinahiggins614-cmyk.github.io/signature-backend/api-manifest.json",
        },
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("wrote %s (%d operations)" % (OUT, len(operations)))


if __name__ == "__main__":
    main()
