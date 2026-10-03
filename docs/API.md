# Signature Engine API — formal documentation

Engine: `signature-backend.js` v2.0 · API v2.0 (pinned) · schema v1.0 ·
backend_id `JAH-BACKEND-1`.
The engine loads as one file, no dependencies, no build step, no network calls
(verified: zero `fetch`/`XMLHttpRequest`/`WebSocket` anywhere).

Machine-readable versions of this doc: `api-manifest.json` (per-function
NAME/PURPOSE/INPUT/OUTPUT/ERRORS/DETERMINISM/SIDE EFFECTS/PERMISSIONS/VERSION),
`signature-backend.d.ts`, `schemas/`.

---

## 1. Identity

| Field | Value | Where |
|---|---|---|
| engine version | `2.0` | `SignatureBackend.version` |
| api version | `2.0` (pinned — breaking changes bump this) | `SignatureBackend.apiVersion` |
| backend ID | `JAH-BACKEND-1` | `SignatureBackend.backendId` (machine-readable; visible UI says "engine") |
| record schema | `1.0` | `SignatureBackend.schemaVersion` |

## 2. Operations

Full per-function formal docs live in `api-manifest.json`. Summary:

- **chat(ai, text, session)** — one reply. Replies are *intentionally varied*
  (whole-word intent matching; unknown input draws from fallback lines).
- **dial(aiRecord)** — opens a live session: greeting, `say()`, `runDemo()`,
  `lockRole()/unlockRole()`, `hangup()`, `transcript()`.
- **runDemo(ai, inputs)** / **runDemoReceipt(ai, inputs)** — run a working demo;
  the receipt variant stamps `JAH-DEMO-######`.
- **presets()** / **loadPreset(name)** — the 6 archetypes (one model of each kind);
  older names resolve via permanent aliases; unknown → `null`, never throws.
- **geneOptions(advanced)** — The Opperater's gene slots: 10 main slots × 18 boxes
  = 180; advanced unlocks 4 more slots (14 total).
- **buildGenome({genes, name, kind, advanced})** — forges a deterministic genome
  record: `genome_id` (`JAH-GENOME-XXXXXX`) and `stamp` (`JAH-AI-OPR-XXXX`) are
  content-derived; same inputs ⇒ same genome, byte-for-byte.
- **genomeViable(drops)** — coverage check over viability groups.
- **fileRecord(rec)** — stamps a genome/preset as a filed AI record.
- **labCatalogs() / labOptions(key)** — the 8 Creation Lab shelfes, 1,044 options.
- **animateCreation({base, picks})** — animates a creation; deterministic:
  same base + picks ⇒ same record and `JAH-LAB-XXXXXX` stamp.
- **creationToAI(creation)** / **labDemo(creation)** — dialable AI from a creation;
  scripted field-test narrative (not a measurement).
- **recordHash(rec)** — deterministic content hash (excludes volatile filing fields).
- **capabilities() / health() / selfTest()** — discovery, quick probe, full suite.

## 3. Determinism

Deterministic (same inputs ⇒ same output, byte-for-byte): buildGenome, runDemo,
animateCreation, recordHash, presets, loadPreset, geneOptions, genomeViable,
labCatalogs, labOptions, creationToAI, labDemo, tones, capabilities, health,
selfTest.

Non-deterministic by design (documented, not a bug): chat() replies
(intentionally varied), dial() sessions (live), JAH-AI-OP filing stamps and
filedAt (sequential counter + timestamp).

Determinism vectors: `code/qa/test_vectors.json` (+ `code/qa/vectors.py`
`--write`/`--check`); self-test asserts determinism live on every page load.

## 4. Sessions — SESSION MEMORY vs PERSISTENT MEMORY

- **SESSION MEMORY**: `dial()` opens a session with `JAH-SESSION-######`,
  lifecycle `OPENING → ACTIVE → LOCKED_ROLE → ACTIVE → HANGUP → CLOSED`.
  `say()` history and the turn log live in memory only, capped at 200 turns,
  and die at `hangup()`. They are never written anywhere.
- **PERSISTENT MEMORY**: the engine has none. Nothing is stored in
  localStorage, IndexedDB, cookies, or on any server. If you want a memory to
  survive, export it: `session.transcript()` (JSON download) or a filed
  record (`fileRecord()` download).
- Transcripts are labeled `GENERATED_CONVERSATION` — a generated chat log,
  never an official source document.

## 5. Role lock grammar

`session.lockRole(name)` opens a concise machine channel for the call.
Grammar, one line each, ≤220 chars per line, no newlines inside fields:

```
ROLE: <role>
ACK: <short restatement of the input>
OUT: <the reply>
END
```

Validation: empty name → `ROLE_EMPTY`; >120 chars → `ROLE_TOO_LONG`;
control characters → `ROLE_INVALID_CHARS`. All are recoverable structured
errors. **A role never grants capabilities: role ≠ permission.** Unlock with
`session.unlockRole()`.

## 6. Errors

Every throw is an `Error` carrying: `error_code`, `message_text`, `operation`,
`engine_version`, `api_version`, `recoverable`. Known codes:
`DIAL_BAD_RECORD`, `ROLE_EMPTY`, `ROLE_TOO_LONG`, `ROLE_INVALID_CHARS`,
`FILERECORD_BAD_RECORD`, `FILERECORD_NOT_SERIALIZABLE`, `GENOME_UNKNOWN_SLOT`,
`GENOME_UNKNOWN_CODE`, `GENOME_ADVANCED_LOCKED`.
Schema: `schemas/error.schema.json`.

## 7. fileRecord() — exactly what is written

Input: a `buildGenome`/`loadPreset` result with a `name`.
Output: `{record, downloadPy, downloadJson}` where `record` is a deep copy
with `filedStamp` (`JAH-AI-OP-######`, sequential in-memory counter),
`filed: true`, `filedFrom`, `filedAt` timestamp; `downloadJson` is the full
record JSON; `downloadPy` is a standalone `.py` carrying the record's
rules/fallbacks + a local `reply()` shim, topped with a GENERATED-BY header
(engine/API versions, what the file is, offline note, read-before-running).

**CREATE RECORD → EXPORT → PUBLISH are three distinct steps:**
buildGenome creates, the download buttons export (to your device only),
and *you* publish by placing the file in the phone book. The engine is
local-first: it never saves or publishes anything anywhere.

## 8. Privacy

What leaves the browser: **nothing**, unless you export a file yourself
(downloads, share, clipboard). The engine makes zero network calls and keeps
zero persistent state. Cross-site callers (the phone book) run the same local
engine file.

## 9. ID schemes (all permanent)

`JAH-SESSION-######` · `JAH-AI-OP-######` · `JAH-GENOME-XXXXXX` ·
`JAH-DEMO-######` · `JAH-LAB-XXXXXX` · `JAH-AI-OPR-XXXX` · `JAH-AI-PRE-###`.

## 10. Compatibility

`api_version` is pinned at 2.0. Additive functions never bump it; breaking
changes do. Preset aliases (`PRESET_ALIASES`) are permanent — removed names
keep resolving. ID formats are permanent. Generated `.py` files are
standalone and carry no engine dependency.

## 11. Health & self-test

`health()` — lightweight probe (`UP`/`DEGRADED`, quick checks, versions).
`selfTest()` — the full 53-check suite, run on every page load; returns
`{pass, partial, checks}`; the page shows PASS (green) / PARTIAL (amber) /
FAIL (red) — never stuck. `code/qa/run_all.sh` fails the build on any failure.
