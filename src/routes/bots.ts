// Bot routes module
// Reference: .kiro/specs/hono-refactor-phase1/design.md

import { Hono } from "hono";
import type { Env } from "../env.ts";

export const botRoutes = new Hono<{ Bindings: Env }>();

// GET /api/bots - List all bots with their status
botRoutes.get("/api/bots", async (c) => {
  const raw = await c.env.BACKENDS.get("bots");
  const botIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];

  const statuses = await Promise.all(
    botIds.map(async (botId) => {
      try {
        const doId = c.env.BOT_SESSION.idFromName(botId);
        const stub = c.env.BOT_SESSION.get(doId);
        const resp = await stub.fetch(new Request("http://do/status"));
        const status = (await resp.json()) as Record<string, unknown>;
        return { bot_id: botId, ...status };
      } catch {
        return { bot_id: botId, error: "unreachable" };
      }
    }),
  );

  return c.json(statuses);
});

// POST /api/send - Send message to a bot
botRoutes.post("/api/send", async (c) => {
  const body = (await c.req.json()) as {
    bot_id?: string;
    text?: string;
    context_token?: string;
  };

  if (!body.bot_id || !body.text) {
    return c.json({ error: "missing bot_id or text" }, 400);
  }

  const doId = c.env.BOT_SESSION.idFromName(body.bot_id);
  const stub = c.env.BOT_SESSION.get(doId);
  return stub.fetch(new Request("http://do/send", {
    method: "POST",
    body: JSON.stringify({ text: body.text, context_token: body.context_token }),
  }));
});

// GET /api/bridge/connect - WebSocket connection for bridge
botRoutes.get("/api/bridge/connect", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "websocket upgrade required" }, 426);
  }
  const botId = c.req.query("bot_id");
  if (!botId) return c.json({ error: "missing bot_id" }, 400);

  const doId = c.env.BOT_SESSION.idFromName(botId);
  const stub = c.env.BOT_SESSION.get(doId);
  return stub.fetch(new Request("http://do/bridge", {
    method: "GET",
    headers: c.req.raw.headers,
  }));
});

// ALL /bot/:id/* - Proxy all requests to the bot's Durable Object
botRoutes.all("/bot/:id/*", async (c) => {
  const botId = decodeURIComponent(c.req.param("id"));
  const subPath = c.req.path.replace(`/bot/${c.req.param("id")}`, "") || "/status";
  const doId = c.env.BOT_SESSION.idFromName(botId);
  const stub = c.env.BOT_SESSION.get(doId);

  return stub.fetch(new Request(`http://do${subPath}`, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  }));
});
