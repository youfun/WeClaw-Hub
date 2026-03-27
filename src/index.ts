// WeClaw Hub — Cloudflare Workers entry point
// Reference: ref/knockknock/index.mjs (routing pattern)
// Reference: ref/weclaw/api/server.go (Send API)

export { BotSession } from "./BotSession.ts";

import { Hono } from "hono";
import type { Env } from "./env.ts";
import { publicRoutes } from "./routes/public.ts";
import { authMiddleware } from "./routes/auth.ts";
import { loginRoutes } from "./routes/login.ts";
import { botRoutes } from "./routes/bots.ts";
import { providerRoutes } from "./routes/providers.ts";
import { modelRoutes } from "./routes/models.ts";
import { toolRoutes } from "./routes/tools.ts";
import { adminPage } from "./pages/admin.tsx";
import { botDetailPage } from "./pages/bot-detail.tsx";
import { BUILTIN_TOOLS } from "./tools.ts";
import type { Backend, CustomModel, LlmProvider, ScheduledTask } from "./types.ts";

// Create Hono app instance
const app = new Hono<{ Bindings: Env }>();

// Register public routes (no authentication)
app.route("/", publicRoutes);

// Apply authentication middleware to all subsequent routes
app.use("*", authMiddleware);

// Register login routes (with authentication)
app.route("/", loginRoutes);

// Register bot routes (with authentication)
app.route("/", botRoutes);

// Register v2 provider/model routes (with authentication)
app.route("/", providerRoutes);
app.route("/", modelRoutes);
app.route("/", toolRoutes);

// Backend routes (authenticated)
app.get("/api/backends", async (c) => {
  const listResult = await c.env.BACKENDS.list({ prefix: "backend:" });
  const backends: Backend[] = [];
  for (const key of listResult.keys) {
    const b = (await c.env.BACKENDS.get(key.name, "json")) as Backend | null;
    if (b) backends.push(b);
  }
  return c.json(backends);
});

app.post("/api/backends", async (c) => {
  const body = (await c.req.json()) as Partial<Backend>;
  if (!body.id || !body.webhook_url) {
    return c.json({ error: "missing id or webhook_url" }, 400);
  }
  const safeId = sanitizeKeySegment(body.id);
  if (!safeId) return c.json({ error: "id must be 1-64 lowercase alphanumeric, dash, or underscore" }, 400);
  const backend: Backend = {
    id: safeId,
    name: body.name ?? body.id,
    webhook_url: body.webhook_url,
    auth_token: body.auth_token ?? "",
    routing_rules: body.routing_rules ?? [{ type: "all" }],
    priority: body.priority ?? 0,
    fan_out: body.fan_out ?? false,
  };
  await c.env.BACKENDS.put(`backend:${safeId}`, JSON.stringify(backend));
  return c.json({ ok: true, backend });
});

app.delete("/api/backends/:id", async (c) => {
  const rawId = decodeURIComponent(c.req.param("id"));
  const safeId = sanitizeKeySegment(rawId);
  if (!safeId) return c.json({ error: "invalid id" }, 400);
  await c.env.BACKENDS.delete(`backend:${safeId}`);
  return c.json({ ok: true });
});

// Webhook API routes (authenticated)
app.get("/api/webhooks", async (c) => {
  const listResult = await c.env.BACKENDS.list({ prefix: "webhook:" });
  const configs: Array<Omit<any, "secret">> = [];
  for (const key of listResult.keys) {
    const raw = (await c.env.BACKENDS.get(key.name, "json")) as any;
    if (raw && raw.bot_ids?.length) {
      const { secret: _secret, ...safe } = raw;
      configs.push(safe);
    }
  }
  return c.json(configs);
});

app.post("/api/webhooks", async (c) => {
  const body = (await c.req.json()) as any;
  const botIds: string[] = body.bot_ids?.length
    ? body.bot_ids
    : body.bot_id
      ? [body.bot_id]
      : [];
  if (!botIds.length) {
    return c.json({ error: "missing bot_ids" }, 400);
  }
  const rawPath = body.path?.trim();
  let path: string;
  if (rawPath) {
    const safe = sanitizeKeySegment(rawPath);
    if (!safe) return c.json({ error: "path must be 1-64 lowercase alphanumeric, dash, or underscore" }, 400);
    path = safe;
  } else {
    path = generateWebhookPath();
  }
  const config: any = {
    path,
    name: body.name?.trim() || path,
    source: body.source?.trim() || "generic",
    secret: body.secret?.trim() || generateSecret(),
    verify: body.verify ?? "bearer",
    bot_ids: botIds,
    header_field: body.header_field,
    enabled: body.enabled ?? true,
  };
  await c.env.BACKENDS.put(`webhook:${path}`, JSON.stringify(config));
  return c.json({ ok: true, config });
});

app.post("/api/webhooks/:path/reset-secret", async (c) => {
  const whPath = sanitizeKeySegment(decodeURIComponent(c.req.param("path")));
  if (!whPath) return c.json({ error: "invalid path" }, 400);
  const existing = (await c.env.BACKENDS.get(`webhook:${whPath}`, "json")) as any;
  if (!existing) return c.json({ error: "not found" }, 404);
  const newSecret = generateSecret();
  await c.env.BACKENDS.put(`webhook:${whPath}`, JSON.stringify({ ...existing, secret: newSecret }));
  return c.json({ ok: true, secret: newSecret });
});

app.patch("/api/webhooks/:path", async (c) => {
  const whPath = sanitizeKeySegment(decodeURIComponent(c.req.param("path")));
  if (!whPath) return c.json({ error: "invalid path" }, 400);
  const existing = (await c.env.BACKENDS.get(`webhook:${whPath}`, "json")) as any;
  if (!existing) return c.json({ error: "not found" }, 404);
  const update = (await c.req.json()) as any;
  const updated: any = { ...existing, ...update, path: whPath };
  await c.env.BACKENDS.put(`webhook:${whPath}`, JSON.stringify(updated));
  return c.json({ ok: true, config: updated });
});

app.delete("/api/webhooks/:path", async (c) => {
  const whPath = sanitizeKeySegment(decodeURIComponent(c.req.param("path")));
  if (!whPath) return c.json({ error: "invalid path" }, 400);
  await c.env.BACKENDS.delete(`webhook:${whPath}`);
  return c.json({ ok: true });
});

app.get("/admin", async (c) => {
  const [bots, providers, models, webhooks] = await Promise.all([
    loadBots(c.env),
    loadProviders(c.env),
    loadModels(c.env),
    loadWebhooks(c.env),
  ]);
  return adminPage({ bots, providers, models, webhooks });
});

app.get("/admin/bot/:id", async (c) => {
  const botId = decodeURIComponent(c.req.param("id"));
  const stub = c.env.BOT_SESSION.get(c.env.BOT_SESSION.idFromName(botId));
  const [settings, tasks, memory, models] = await Promise.all([
    fetchBotJson<Record<string, unknown>>(stub, "/settings", {}),
    fetchBotJson<{ tasks?: ScheduledTask[] }>(stub, "/tasks", { tasks: [] }),
    fetchBotJson<{ notes?: Array<{ id: string; content: string; hitCount?: number; lastHitAt?: number | null }> }>(stub, "/memory", { notes: [] }),
    loadModels(c.env),
  ]);

  return botDetailPage({
    botId,
    settings: {
      remark: String(settings.remark ?? ""),
      keepalive: Boolean(settings.keepalive),
      accept_webhook: settings.accept_webhook !== false,
      agent_mode: settings.agent_mode === "manual" ? "manual" : "family",
      active_model: typeof settings.active_model === "string" ? settings.active_model : undefined,
    },
    tasks: tasks.tasks ?? [],
    notes: memory.notes ?? [],
    tools: BUILTIN_TOOLS,
    models,
  });
});

// Helper functions
async function loadBots(env: Env): Promise<Array<Record<string, unknown>>> {
  const raw = await env.BACKENDS.get("bots");
  const botIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];

  return Promise.all(botIds.map(async (botId) => {
    try {
      const stub = env.BOT_SESSION.get(env.BOT_SESSION.idFromName(botId));
      const response = await stub.fetch(new Request("http://do/status"));
      return response.ok ? { bot_id: botId, ...await response.json() as Record<string, unknown> } : { bot_id: botId };
    } catch {
      return { bot_id: botId, error: "unreachable" };
    }
  }));
}

async function loadProviders(env: Env): Promise<LlmProvider[]> {
  return (await env.BACKENDS.get("llm:providers", "json") as LlmProvider[] | null) ?? [];
}

async function loadModels(env: Env): Promise<CustomModel[]> {
  return (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
}

async function loadWebhooks(env: Env): Promise<Array<Record<string, unknown>>> {
  const listResult = await env.BACKENDS.list({ prefix: "webhook:" });
  const webhooks: Array<Record<string, unknown>> = [];
  for (const key of listResult.keys) {
    const raw = (await env.BACKENDS.get(key.name, "json")) as Record<string, unknown> | null;
    if (!raw) continue;
    const { secret: _secret, ...safe } = raw;
    webhooks.push(safe);
  }
  return webhooks;
}

async function fetchBotJson<T>(stub: DurableObjectStub, path: string, fallback: T): Promise<T> {
  try {
    const response = await stub.fetch(new Request(`http://do${path}`));
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

function sanitizeKeySegment(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s || s.length > 64 || !/^[a-z0-9_-]+$/.test(s)) return null;
  return s;
}

function generateWebhookPath(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await app.fetch(request, env);
    } catch (err) {
      if (err instanceof Error && err.message === "invalid_json") {
        return json({ error: "invalid_json" }, 400);
      }

      console.error("[worker] unhandled error", err);
      return json({ error: "internal_error" }, 500);
    }
  },
};
