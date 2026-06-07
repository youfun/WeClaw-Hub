/**
 * Local WeClaw-Hub Server — Bun entry point.
 *
 * Runs the same Hono app as Cloudflare Workers, but with local adapters
 * replacing Durable Objects, KV, and other CF-specific infrastructure.
 *
 * Usage:
 *   bun run src/local/server.ts
 *   DATA_DIR=./data AUTH_TOKEN=my-token bun run src/local/server.ts
 */

import { mkdirSync } from "node:fs";
import { Database } from "bun:sqlite";
import type { Env } from "../env";
import { app } from "../app";
import { createBotNamespace } from "./adapters/bot-manager";
import { createKvStore } from "./adapters/kv-store";

// ── Build local env ────────────────────────────────────────────────────────

function buildEnv(db: Database): Env {
  const kvBackends = createKvStore(db, "backends");
  const kvContacts = createKvStore(db, "contacts");
  const botNamespace = createBotNamespace(db);

  return {
    BOT_SESSION: botNamespace,
    BACKENDS: kvBackends,
    CONTACTS: kvContacts,
    AUTH_TOKEN: process.env.AUTH_TOKEN ?? "local-dev-token",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT ?? "你是一个有用的AI助手。",
    WECLAW_HUB_VERSION: process.env.WECLAW_HUB_VERSION ?? "0.4.0-local",
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    TEST_ONLY_ENABLE_SEED_CHAT: "1",
  };
}

// ── Start server ──────────────────────────────────────────────────────────

export function start(
  opts: { dataDir?: string; envOverrides?: Record<string, string | undefined> } = {},
): {
  app: typeof app;
  env: Env;
  db: Database;
  stop: () => void;
} {
  const dataDir = opts.dataDir || process.env.DATA_DIR || "./data";
  const dbPath = `${dataDir}/weclaw.db`;

  // Ensure data directory exists
  try { mkdirSync(dataDir, { recursive: true }); } catch { /* dir exists */ }

  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA busy_timeout=5000");

  const env = buildEnv(db);

  return {
    app,
    env,
    db,
    stop: () => db.close(),
  };
}

// ── CLI entry ──────────────────────────────────────────────────────────────

if (import.meta.main) {
  const { app, env } = start();
  const port = parseInt(process.env.PORT || "8787", 10);

  import("@hono/node-server").then(({ serve }) => {
    serve({
      fetch: (req) => app.fetch(req, env),
      port,
    });
    console.log(`[WeClaw-Hub] Local server listening on http://localhost:${port}`);
    console.log(`[WeClaw-Hub] Data dir: ${process.env.DATA_DIR || "./data"}`);
  });
}