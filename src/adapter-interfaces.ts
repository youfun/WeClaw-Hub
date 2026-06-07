/**
 * Adapter interfaces — decouple BotSession from Cloudflare-specific types.
 *
 * Both the Cloudflare runtime (DurableObjectState, KVNamespace, DurableObjectNamespace)
 * and local Bun SQLite adapters structurally satisfy these interfaces.
 *
 * BotSession uses these interfaces instead of importing from "@cloudflare/workers-types",
 * enabling a single codebase to run on both Cloudflare Workers and a local Bun server.
 */

// ── SQL Storage ────────────────────────────────────────────────────────────

export interface ISqlResult {
  toArray(): Record<string, unknown>[];
}

export interface ISqlStorage {
  exec(query: string, ...params: unknown[]): ISqlResult;
}

// ── Bot Storage (DurableObjectStorage subset) ──────────────────────────────

export interface IBotStorage {
  readonly sql: ISqlStorage;
  setAlarm(scheduledTime: number): Promise<void>;
  getAlarm(): Promise<number | null>;
  deleteAlarm(): Promise<void>;
  transactionSync<T>(callback: () => T): T;
}

// ── Bot State (DurableObjectState subset) ──────────────────────────────────

export interface IBotState {
  readonly storage: IBotStorage;
  waitUntil(promise: Promise<void>): void;
}

// ── KV Store ───────────────────────────────────────────────────────────────

export interface IKvStore {
  get(key: string, type?: "text" | "json"): Promise<string | object | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
}

// ── Bot Namespace (DurableObjectNamespace subset) ──────────────────────────

export interface IBotId {
  toString(): string;
}

export interface IBotStub {
  fetch(request: Request): Promise<Response>;
}

export interface IBotNamespace {
  idFromName(name: string): IBotId;
  get(id: IBotId): IBotStub;
}

// ── Local env interface (matches src/env.ts Env but with adapter types) ────

export interface ILocalEnv {
  BOT_SESSION: IBotNamespace;
  BACKENDS: IKvStore;
  CONTACTS: IKvStore;
  AUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  SYSTEM_PROMPT?: string;
  WECLAW_HUB_VERSION?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;
  TEST_ONLY_ENABLE_SEED_CHAT?: string;
}