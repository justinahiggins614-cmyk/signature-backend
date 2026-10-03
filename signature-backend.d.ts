/* TypeScript declarations for the Signature Engine (signature-backend.js v2.0, API v2.0).
   Generated 2026-10-03 against the real engine. The engine exposes exactly the
   members of `SignatureBackend` below — no network, no dependencies. */

export interface EngineErrorShape extends Error {
  error_code: string;
  message_text: string;
  operation: string;
  engine_version: string;
  api_version: string;
  recoverable: boolean;
}

export interface AIRecord {
  id?: string;
  name: string;
  stamp?: string;
  kind?: string;
  rate?: number;
  pitch?: number;
  mentality?: string;
  abilities?: string[];
  params?: any[];
  rules?: string[][];
  fallback?: string[];
  greeting?: string;
  demoTitle?: string;
  demoKind?: string;
  demoHTML?: string;
  py?: string;
  filed?: boolean;
  filedStamp?: string;
  filedFrom?: string;
  filedAt?: string;
  [key: string]: any;
}

export interface GenomeRecord extends AIRecord {
  genome_id: string;
  generator_version: string;
  schema_version: string;
}

export interface CreationRecord {
  stamp: string;
  name: string;
  cls: string;
  description: string;
  abilities: string[];
  stats: Record<string, any>;
  baseName: string;
  pickCount: number;
  seed: string;
  svg: string;
  [key: string]: any;
}

export interface GeneSlot {
  key: string;
  name: string;
  mirror?: string;
  options: Array<{ code: string; layer: string; label: string; desc: string }>;
  advanced?: boolean;
}

export interface ShelfCatalog {
  key: string;
  name: string;
  count: number;
  blurb: string;
}

export interface DialSession {
  sessionId: string;
  state: 'OPENING' | 'ACTIVE' | 'LOCKED_ROLE' | 'HANGUP' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  turnCount: number;
  ai: AIRecord;
  history: Record<string, any>;
  turns: Array<{ n: number; at: string; input: string; reply: string; role: string | null }>;
  lineOpen: boolean;
  greeting: string;
  say(text: string): string;
  lockRole(roleName: string): string;
  unlockRole(): string;
  runDemo(inputs?: Record<string, any>): string;
  hangup(): string;
  transcript(): SessionTranscript;
}

export interface SessionTranscript {
  transcript_kind: 'GENERATED_CONVERSATION';
  session_id: string;
  ai_id: string;
  ai_name: string;
  opened_at: string | null;
  closed_at: string | null;
  turn_count: number;
  role_state: string;
  engine_version: string;
  api_version: string;
  turns: Array<{ n: number; at: string; input: string; reply: string; role: string | null }>;
}

export interface FiledRecord {
  record: AIRecord;
  downloadPy: string;
  downloadJson: string;
}

export interface DemoReceipt {
  demo_id: string;
  ai_id: string;
  demo_kind: string;
  inputs: Record<string, any>;
  output: string;
  engine_version: string;
  api_version: string;
  ran_at: string;
}

export interface SelfTestResult {
  pass: boolean;
  partial: boolean;
  checks: Array<[string, boolean]>;
}

export interface EngineHealth {
  backend_id: string;
  engine: string;
  version: string;
  api_version: string;
  schema_version: string;
  status: 'UP' | 'DEGRADED';
  quick_checks: Array<[string, boolean]>;
  offline: boolean;
  network_calls: string[];
  timestamp: string;
}

export interface CapabilityOperation {
  name: string;
  version: string;
  deterministic: boolean;
  side_effects: string;
  note: string;
}

export interface EngineCapabilities {
  backend_id: string;
  engine: string;
  engine_version: string;
  api_version: string;
  schema_version: string;
  operations: CapabilityOperation[];
  catalogs: {
    shelves: number;
    shelf_options: number;
    gene_slots: number;
    gene_boxes: number;
    advanced_boxes: number;
    presets: number;
  };
  offline: true;
  network_calls: string[];
  dependencies: string[];
}

export interface SignatureBackend {
  version: string;
  apiVersion: string;
  backendId: string;
  schemaVersion: string;
  chat(ai: AIRecord, text: string, session?: Record<string, any>): string;
  runDemo(ai: AIRecord, inputs?: Record<string, any>): string;
  runDemoReceipt(ai: AIRecord, inputs?: Record<string, any>): DemoReceipt;
  dial(aiRecord: AIRecord): DialSession;
  presets(): AIRecord[];
  loadPreset(name: string): AIRecord | null;
  geneOptions(advanced?: boolean): GeneSlot[];
  buildGenome(opts: { genes: Record<string, string>; name: string; kind?: string; advanced?: boolean }): GenomeRecord;
  genomeViable(drops: string[]): { ready: boolean; missing: string[] };
  fileRecord(rec: AIRecord): FiledRecord;
  tones(): Array<{ key: string; label: string; rate: number; pitch: number }>;
  labCatalogs(): ShelfCatalog[];
  labOptions(key: string): any[];
  animateCreation(spec: { base: string; picks: Record<string, string[]> }): CreationRecord;
  creationToAI(creation: CreationRecord): AIRecord;
  labDemo(creation: CreationRecord): string;
  recordHash(rec: Record<string, any>): string;
  capabilities(): EngineCapabilities;
  health(): EngineHealth;
  EngineError(code: string, message: string, operation: string, recoverable: boolean): EngineErrorShape;
  selfTest(): SelfTestResult;
}

declare global {
  interface Window {
    SignatureBackend: SignatureBackend;
  }
}

export {};
