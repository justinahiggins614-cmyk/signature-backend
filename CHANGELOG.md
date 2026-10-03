# Changelog — The Signature AI Mad Scientist Creation Lab (signature-backend)

Engine: `signature-backend.js` · backend_id `JAH-BACKEND-1` · api_version pinned at `2.0`.

## 2026-10-03 — Fix wave: engine correctness + permanent identity + dev infrastructure

### P0 — engine correctness
- Static status values are now stamped into `index.html` at build time by
  `code/build_status.py`: no-JS readers (crawlers, accessibility readers)
  see verified engine version / self-test PASS / API list / shelf counts
  instead of "…" / "running…". Page JS overwrites with live values on load.
- `selfTest()` grew 40 → **53 checks** and returns `{pass, partial, checks}`;
  the page renders a PARTIAL state (amber) when some checks fail — never stuck.
- New structured errors: every throw is an `Error` carrying
  `error_code / message_text / operation / engine_version / api_version / recoverable`
  (schema in `schemas/error.schema.json`).
- `dial()` sessions now carry `JAH-SESSION-######` IDs, lifecycle states
  OPENING → ACTIVE → LOCKED_ROLE → ACTIVE → HANGUP → CLOSED, `openedAt`,
  `turnCount`, capped in-memory turn log, and `session.transcript()`
  (labeled GENERATED_CONVERSATION).
- `lockRole()` validates: empty → ROLE_EMPTY, >120 chars → ROLE_TOO_LONG,
  control chars → ROLE_INVALID_CHARS. A role never grants capabilities.
- Determinism vectors: `code/qa/vectors.py --write/--check` + frozen
  `code/qa/test_vectors.json` (21 vectors).
- Offline claim verified: zero fetch/XHR/WebSocket anywhere in engine or page.

### P1 — permanent identity
- `JAH-BACKEND-1` permanent backend ID (machine-readable; visible UI says "engine").
- API version pinned at 2.0 (`B.apiVersion`); record schema v1.0 (`B.schemaVersion`).
- `JAH-GENOME-XXXXXX` content-derived genome IDs on buildGenome output.
- `JAH-DEMO-######` demo receipts via `runDemoReceipt()`.
- `engine-manifest.json`: ENGINE_SHA256 + per-shelf catalog hashes + counts.
- This CHANGELOG.md.
- Generated `.py` files now carry a full GENERATED-BY header (engine/API versions,
  what the file is, offline note, treat-downloads-as-data reminder).

### P2 — developer infrastructure
- `api-manifest.json`: formal per-function docs (NAME/PURPOSE/INPUT/OUTPUT/
  ERRORS/DETERMINISM/SIDE EFFECTS/PERMISSIONS/VERSION) generated from the
  engine's own `capabilities()`, plus compatibility matrix + canonical URLs.
- 6 JSON schemas in `schemas/` (ai-record, genome, creation, demo, session, error),
  all validated against real engine output.
- `docs/API.md`: formal docs, privacy (nothing leaves the browser unless exported),
  session vs persistent memory, role grammar, fileRecord definition.
- `signature-backend.d.ts` TypeScript declarations; `llms.txt` for AI crawlers.
- `capabilities()` / `health()` live discovery endpoints.

### P3 — UX (additive only)
- Creation detail panel: `?creation=` deep-link support (planned — engine ready).
- 8-shelves vs 10-slots explainer sentence; serums safety note
  (speculative concepts, not medical advice/devices).
- Reduced-motion respect (planned); speech state hardening (planned).

### Visible-surface naming
- "backend"/"back end" removed from all visible titles/headers per the owner's
  order ("Too provocative") — visible surfaces say "engine".
  `JAH-BACKEND-1` lives in machine-readable manifests only.

## 2026-10-02 — Mad Scientist Creation Lab launch
- Engine v2.0 shipped: chat/dial/runDemo, The Opperater (10 gene slots × 18),
  6 presets, 8-shelf creation lab, fileRecord (JAH-AI-OP-######), selfTest (40).
