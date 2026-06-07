/**
 * WeClaw Hub — Shared Hono App
 *
 * This module contains the Hono app with all routes and helper functions.
 * It is shared between:
 *   - src/index.ts (Cloudflare Workers entry)
 *   - src/local/server.ts (local Bun/Docker entry)
 *
 * The app uses `Bindings: Env` for type-safe c.env access.
 * At request time, callers pass the actual env via `app.fetch(req, env)`.
 */

import { Hono } from "hono";
import type { Env } from "./env.ts";
import { publicRoutes } from "./routes/public.ts";
import { authMiddleware } from "./routes/auth.ts";
import { bindRoutes } from "./routes/bind.ts";
import { botRoutes } from "./routes/bots.ts";
import { providerRoutes } from "./routes/providers.ts";
import { modelRoutes } from "./routes/models.ts";
import { toolRoutes } from "./routes/tools.ts";
import { secureCompare } from "./utils.ts";
import { json } from "./utils.ts";
import { invitePublicRoutes, inviteApiRoutes } from "./routes/invites.ts";
import { adminPage, type BotSummary } from "./pages/admin.tsx";
import { botDetailPage } from "./pages/bot-detail.tsx";
import { guidePage } from "./pages/guide.tsx";
import { landingPage } from "./pages/landing.tsx";
import { invitePage } from "./pages/invites.tsx";
import { BUILTIN_TOOLS } from "./tools.ts";
import { listInvites } from "./invites.ts";
import type { Backend, CustomModel, LlmProvider, ScheduledTask } from "./types.ts";

// ── Hono App ───────────────────────────────────────────────────────────────

export const app = new Hono<{ Bindings: Env }>();

// --- Public routes (no authentication) ---

app.route("/", publicRoutes);

app.get("/auth", (c) => {
  const redirect = c.req.query("redirect") || "/admin";
  return authFormPage(redirect);
});

app.post("/auth", async (c) => {
  const body = await c.req.parseBody();
  const token = String(body.token || "").trim();
  const redirect = String(body.redirect || "/admin");
  const authToken = c.env.AUTH_TOKEN?.trim() || "";

  if (!authToken || !secureCompare(token, authToken)) {
    return authFormPage(redirect, true);
  }

  const safeRedirect = redirect.startsWith("/") ? redirect : "/admin";
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeRedirect,
      "Set-Cookie": `auth_token=${encodeURIComponent(token)}; Path=/; SameSite=Strict`,
    },
  });
});

app.get("/", () => landingPage());
app.get("/guide", () => guidePage());
app.route("/", invitePublicRoutes);

// --- Authentication middleware (applies to all subsequent routes) ---

app.use("*", authMiddleware);

// --- Authenticated routes ---

app.route("/", bindRoutes);
app.route("/", botRoutes);
app.route("/", providerRoutes);
app.route("/", modelRoutes);
app.route("/", toolRoutes);
app.route("/", inviteApiRoutes);

// Backend routes
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

// Webhook API routes
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
    template: body.template?.trim() || undefined,
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

// Image generation config
app.patch("/api/image-config", async (c) => {
  const body = await c.req.json() as { image_provider_id?: string | null; image_model?: string | null };
  if (body.image_provider_id !== undefined) {
    const id = (body.image_provider_id ?? "").trim();
    if (id) {
      const providers = await loadProviders(c.env);
      if (!providers.some((p) => p.id === id)) {
        return c.json({ error: `provider "${id}" not found` }, 400);
      }
      await c.env.BACKENDS.put("llm:image_provider_id", id);
    } else {
      await c.env.BACKENDS.delete("llm:image_provider_id");
    }
  }
  if (body.image_model !== undefined) {
    const model = (body.image_model ?? "").trim();
    if (model) {
      await c.env.BACKENDS.put("llm:image_model", model);
    } else {
      await c.env.BACKENDS.delete("llm:image_model");
    }
  }
  return c.json({ ok: true });
});

// Admin pages
app.get("/admin", async (c) => {
  const [bots, providers, models, webhooks, imageProviderId, imageModel] = await Promise.all([
    loadBots(c.env),
    loadProviders(c.env),
    loadModels(c.env),
    loadWebhooks(c.env),
    c.env.BACKENDS.get("llm:image_provider_id"),
    c.env.BACKENDS.get("llm:image_model"),
  ]);
  const origin = new URL(c.req.url).origin;
  return adminPage({ bots, providers, models, webhooks, imageProviderId, imageModel, origin, version: c.env.WECLAW_HUB_VERSION ?? "0.4.0" });
});

app.get("/admin/invites", async (c) => {
  const invites = await listInvites(c.env);
  const origin = new URL(c.req.url).origin;
  return invitePage({ invites, origin });
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

app.post("/bot/:id/unbind", async (c) => {
  const botId = decodeURIComponent(c.req.param("id"));
  const stub = c.env.BOT_SESSION.get(c.env.BOT_SESSION.idFromName(botId));
  const resp = await stub.fetch(new Request("http://do/unbind", { method: "POST" }));
  const body = await resp.json() as { ok?: boolean; error?: string };
  return c.json(body, resp.status as 200 | 400);
});

// ── Helper Functions ───────────────────────────────────────────────────────

export async function loadBots(env: Env): Promise<BotSummary[]> {
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

export async function loadProviders(env: Env): Promise<LlmProvider[]> {
  return (await env.BACKENDS.get("llm:providers", "json") as LlmProvider[] | null) ?? [];
}

export async function loadModels(env: Env): Promise<CustomModel[]> {
  return (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
}

export async function loadWebhooks(env: Env): Promise<Array<Record<string, unknown>>> {
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

export async function fetchBotJson<T>(stub: { fetch: (req: Request) => Promise<Response> }, path: string, fallback: T): Promise<T> {
  try {
    const response = await stub.fetch(new Request(`http://do${path}`));
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

export function authFormPage(redirect: string, failed = false): Response {
  const safeRedirect = redirect.startsWith("/") ? redirect : "/admin";
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>访问验证 · WeClaw Hub</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI","PingFang SC",sans-serif;background:#f4efe6;min-height:100vh;display:grid;place-items:center}
.card{background:#fffaf2;border:1px solid rgba(74,57,44,0.12);border-radius:24px;padding:32px 36px;width:min(400px,calc(100% - 32px));box-shadow:0 24px 60px rgba(61,39,22,0.12)}
h1{margin:0 0 6px;font-size:24px}
p{color:#6f6258;margin:0 0 24px;font-size:14px}
label{display:block;font-size:13px;color:#6f6258;margin-bottom:6px}
input{width:100%;border:1px solid rgba(74,57,44,0.12);border-radius:12px;padding:11px 14px;font:inherit;background:#fff}
button{margin-top:16px;width:100%;padding:13px;border-radius:999px;border:none;background:linear-gradient(135deg,#b6542d,#7f3014);color:#fff;font:inherit;cursor:pointer}
.err{color:#b6542d;font-size:13px;margin-top:12px}
</style>
</head>
<body>
<div class="card">
  <h1>WeClaw Hub</h1>
  <p>请输入访问令牌以继续。</p>
  <form method="POST" action="/auth">
    <input type="hidden" name="redirect" value="${safeRedirect.replace(/"/g, "&quot;")}" />
    <label>访问令牌</label>
    <input type="password" name="token" autofocus autocomplete="current-password" required />
    <button type="submit">确认</button>
    ${failed ? '<p class="err">令牌不正确，请重试。</p>' : ""}
  </form>
</div>
</body>
</html>`;
  return new Response(html, {
    status: failed ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function sanitizeKeySegment(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s || s.length > 64 || !/^[a-z0-9_-]+$/.test(s)) return null;
  return s;
}

export function generateWebhookPath(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
}