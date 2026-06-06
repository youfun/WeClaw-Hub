/**
 * Local Bot Manager — replaces Cloudflare DurableObjectNamespace.
 *
 * Manages all bot sessions in a single process using a Map<botId, BotSession>.
 * Each bot gets its own BotSession instance backed by the shared SQLite database.
 *
 * This replaces the distributed DO model with an in-process equivalent.
 */

import type { Database } from "bun:sqlite";
import type { IBotNamespace, IBotId, IBotStub } from "../../adapter-interfaces";
import type { Env } from "../../env";
import { BotSession } from "../../BotSession";
import { createBotState } from "./sqlite-storage";
import { createKvStore } from "./kv-store";

export function createBotNamespace(
  db: Database,
  envOverrides: Record<string, string | undefined> = {},
): IBotNamespace {
  const bots = new Map<string, BotSession>();
  const kvBackends = createKvStore(db, "backends");
  const kvContacts = createKvStore(db, "contacts");

  // Build env from process.env + overrides
  function buildEnv(): Env {
    return {
      BOT_SESSION: undefined as unknown as Env["BOT_SESSION"], // replaced below
      BACKENDS: kvBackends,
      CONTACTS: kvContacts,
      AUTH_TOKEN: envOverrides.AUTH_TOKEN ?? process.env.AUTH_TOKEN ?? "",
      ANTHROPIC_API_KEY:
        envOverrides.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL:
        envOverrides.ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL,
      SYSTEM_PROMPT:
        envOverrides.SYSTEM_PROMPT ??
        process.env.SYSTEM_PROMPT ??
        "你是一个有用的AI助手。",
      WECLAW_HUB_VERSION:
        envOverrides.WECLAW_HUB_VERSION ?? process.env.WECLAW_HUB_VERSION,
      LLM_BASE_URL: envOverrides.LLM_BASE_URL ?? process.env.LLM_BASE_URL,
      LLM_MODEL: envOverrides.LLM_MODEL ?? process.env.LLM_MODEL,
      LLM_API_KEY: envOverrides.LLM_API_KEY ?? process.env.LLM_API_KEY,
      TEST_ONLY_ENABLE_SEED_CHAT:
        envOverrides.TEST_ONLY_ENABLE_SEED_CHAT ??
        process.env.TEST_ONLY_ENABLE_SEED_CHAT ??
        "1",
    };
  }

  // We need a self-reference for BOT_SESSION in env
  const namespace: IBotNamespace = {
    idFromName(name: string): IBotId {
      return { toString: () => name };
    },

    get(id: IBotId): IBotStub {
      const botId = id.toString();
      if (!bots.has(botId)) {
        const env = buildEnv();
        env.BOT_SESSION = namespace; // self-reference
        const state = createBotState(db);
        const bot = new BotSession(state, env);
        bots.set(botId, bot);
      }
      const bot = bots.get(botId)!;
      return {
        fetch: (req: Request) => bot.fetch(req),
      };
    },
  };

  return namespace;
}