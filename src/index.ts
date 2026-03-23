// WeClaw Hub — Cloudflare Workers entry point
// Reference: ref/knockknock/index.mjs (routing pattern)
// Reference: ref/weclaw/api/server.go (Send API)

export { BotSession } from "./BotSession.ts";

import { fetchQRCode, pollQRStatus } from "./ilink.ts";
import { loginPage } from "./loginPage.ts";
import { renderQrSvg } from "./qr.ts";
import type { WebhookConfig, WebhookVerifyMode, Backend, CustomModel } from "./types.ts";
import { parseWebhookMessage } from "./webhooks/index.ts";

export interface Env {
  BOT_SESSION: DurableObjectNamespace;
  BACKENDS: KVNamespace;
  CONTACTS: KVNamespace;
  AUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  SYSTEM_PROMPT?: string;
  /** OpenAI-compatible base URL (e.g. https://openrouter.ai/api/v1). When set, OpenAI format is used. */
  LLM_BASE_URL?: string;
  /** Model override. Defaults to claude-3-5-sonnet-20241022 (Anthropic) or gpt-4o (OpenAI-compat). */
  LLM_MODEL?: string;
  /** API key for OpenAI-compatible providers. Falls back to ANTHROPIC_API_KEY. */
  LLM_API_KEY?: string;
}

const LOGIN_ROUTE_LIMITS: Record<string, number> = {
  "/login": 20,
  "/login/qr": 20,
  "/login/status": 120,
};

const LOGIN_WINDOW_MS = 60_000;
const RATE_LIMIT_DO_NAME = "__weclaw_hub_login_rate_limit__";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      if (err instanceof Error && err.message === "invalid_json") {
        return json({ error: "invalid_json" }, 400);
      }

      console.error("[worker] unhandled error", err);
      return json({ error: "internal_error" }, 500);
    }
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  if (pathname === "/health") {
    return new Response("ok");
  }

  const webhookMatch = pathname.match(/^\/webhooks\/([^/]+)$/);
  if (webhookMatch && method === "POST") {
    return handleWebhook(request, env, webhookMatch[1] ?? "");
  }

  const authToken = env.AUTH_TOKEN?.trim() || "";
  if (isManagementRoute(pathname)) {
    if (!authToken) {
      return json({ error: "not configured" }, 503);
    }

    if (pathname === "/login") {
      if (!secureCompare((url.searchParams.get("token") ?? "").trim(), authToken)) {
        return json({ error: "unauthorized" }, 401);
      }
    } else if (!secureCompare(getBearerToken(request).trim(), authToken)) {
      return json({ error: "unauthorized" }, 401);
    }

    const rateLimited = await enforceLoginRateLimit(request, env, pathname);
    if (rateLimited) return rateLimited;
  }

  if (pathname === "/login" && method === "GET") {
    return loginPage(authToken, new URL(request.url).origin);
  }

  if (pathname === "/login/qr" && method === "GET") {
    try {
      const qr = await fetchQRCode();
      return json({
        ...qr,
        qrcode_svg: renderQrSvg(qr.qrcode_img_content),
      });
    } catch (err) {
      console.error("[login/qr] fetch failed", err);
      return json({ error: "upstream_error" }, 502);
    }
  }

  if (pathname === "/login/status" && method === "GET") {
    const qrcode = url.searchParams.get("qrcode");
    if (!qrcode) return json({ error: "missing qrcode param" }, 400);

    try {
      const status = await pollQRStatus(qrcode);

      if (status.status === "confirmed" && status.bot_token && status.ilink_bot_id) {
        const botId = env.BOT_SESSION.idFromName(status.ilink_bot_id);
        const stub = env.BOT_SESSION.get(botId);
        const response = await stub.fetch(new Request("http://do/login", {
          method: "POST",
          body: JSON.stringify({
            bot_token: status.bot_token,
            ilink_bot_id: status.ilink_bot_id,
            baseurl: status.baseurl ?? "",
            ilink_user_id: status.ilink_user_id ?? "",
          }),
        }));

        if (!response.ok) {
          console.error("[login/status] failed to persist credentials", response.status);
          return json({ error: "login_persist_failed" }, 502);
        }
      }

      return json(status);
    } catch (err) {
      console.error("[login/status] poll failed", err);
      return json({ error: "upstream_error" }, 502);
    }
  }

  const botMatch = pathname.match(/^\/bot\/([^/]+)(\/.*)?$/);
  if (botMatch) {
    const botId = decodeURIComponent(botMatch[1]!);
    const subPath = botMatch[2] || "/status";
    const doId = env.BOT_SESSION.idFromName(botId);
    const stub = env.BOT_SESSION.get(doId);

    return stub.fetch(new Request(`http://do${subPath}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }));
  }

  if (pathname === "/api/send" && method === "POST") {
    const body = (await readJson(request)) as {
      bot_id?: string;
      text?: string;
      context_token?: string;
    };

    if (!body.bot_id || !body.text) {
      return json({ error: "missing bot_id or text" }, 400);
    }

    const doId = env.BOT_SESSION.idFromName(body.bot_id);
    const stub = env.BOT_SESSION.get(doId);
    return stub.fetch(new Request("http://do/send", {
      method: "POST",
      body: JSON.stringify({ text: body.text, context_token: body.context_token }),
    }));
  }

  // Bridge WebSocket — forward upgrade to bot's DO
  if (pathname === "/api/bridge/connect") {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "websocket upgrade required" }, 426);
    }
    const botId = url.searchParams.get("bot_id");
    if (!botId) return json({ error: "missing bot_id" }, 400);

    const doId = env.BOT_SESSION.idFromName(botId);
    const stub = env.BOT_SESSION.get(doId);
    return stub.fetch(new Request("http://do/bridge", {
      method: "GET",
      headers: request.headers,
    }));
  }

  // GET /api/bots — list all logged-in bots with status
  if (pathname === "/api/bots" && method === "GET") {
    const raw = await env.BACKENDS.get("bots");
    const botIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];

    const statuses = await Promise.all(
      botIds.map(async (botId) => {
        try {
          const doId = env.BOT_SESSION.idFromName(botId);
          const stub = env.BOT_SESSION.get(doId);
          const resp = await stub.fetch(new Request("http://do/status"));
          const status = (await resp.json()) as Record<string, unknown>;
          return { bot_id: botId, ...status };
        } catch {
          return { bot_id: botId, error: "unreachable" };
        }
      }),
    );

    return json(statuses);
  }

  // GET /api/backends — list registered backends
  if (pathname === "/api/backends" && method === "GET") {
    const listResult = await env.BACKENDS.list({ prefix: "backend:" });
    const backends: Backend[] = [];
    for (const key of listResult.keys) {
      const b = (await env.BACKENDS.get(key.name, "json")) as Backend | null;
      if (b) backends.push(b);
    }
    return json(backends);
  }

  // POST /api/backends — register a backend
  if (pathname === "/api/backends" && method === "POST") {
    const body = (await readJson(request)) as Partial<Backend>;
    if (!body.id || !body.webhook_url) {
      return json({ error: "missing id or webhook_url" }, 400);
    }
    const safeId = sanitizeKeySegment(body.id);
    if (!safeId) return json({ error: "id must be 1-64 lowercase alphanumeric, dash, or underscore" }, 400);
    const backend: Backend = {
      id: safeId,
      name: body.name ?? body.id,
      webhook_url: body.webhook_url,
      auth_token: body.auth_token ?? "",
      routing_rules: body.routing_rules ?? [{ type: "all" }],
      priority: body.priority ?? 0,
      fan_out: body.fan_out ?? false,
    };
    await env.BACKENDS.put(`backend:${safeId}`, JSON.stringify(backend));
    return json({ ok: true, backend });
  }

  // DELETE /api/backends/:id — remove a backend
  const backendsDeleteMatch = pathname.match(/^\/api\/backends\/([^/]+)$/);
  if (backendsDeleteMatch && method === "DELETE") {
    const rawId = decodeURIComponent(backendsDeleteMatch[1]!);
    const safeId = sanitizeKeySegment(rawId);
    if (!safeId) return json({ error: "invalid id" }, 400);
    await env.BACKENDS.delete(`backend:${safeId}`);
    return json({ ok: true });
  }

  // GET /api/webhooks — list all webhook configs (secret stripped)
  if (pathname === "/api/webhooks" && method === "GET") {
    const listResult = await env.BACKENDS.list({ prefix: "webhook:" });
    const configs: Omit<WebhookConfig, "secret">[] = [];
    for (const key of listResult.keys) {
      const raw = (await env.BACKENDS.get(key.name, "json")) as WebhookConfig | null;
      if (raw && raw.bot_ids?.length) {
        const { secret: _secret, ...safe } = raw;
        configs.push(safe);
      }
    }
    return json(configs);
  }

  // POST /api/webhooks — create webhook (auto-generates path if omitted)
  if (pathname === "/api/webhooks" && method === "POST") {
    const body = (await readJson(request)) as Partial<WebhookConfig> & { bot_id?: string };
    // Accept either bot_ids array or legacy single bot_id
    const botIds: string[] = body.bot_ids?.length
      ? body.bot_ids
      : body.bot_id
        ? [body.bot_id]
        : [];
    if (!botIds.length) {
      return json({ error: "missing bot_ids" }, 400);
    }
    const rawPath = body.path?.trim();
    let path: string;
    if (rawPath) {
      const safe = sanitizeKeySegment(rawPath);
      if (!safe) return json({ error: "path must be 1-64 lowercase alphanumeric, dash, or underscore" }, 400);
      path = safe;
    } else {
      path = generateWebhookPath();
    }
    const config: WebhookConfig = {
      path,
      name: body.name?.trim() || path,
      source: body.source?.trim() || "generic",
      secret: body.secret?.trim() || generateSecret(),
      verify: isWebhookVerifyMode(body.verify ?? "") ? (body.verify as WebhookVerifyMode) : "bearer",
      bot_ids: botIds,
      header_field: body.header_field,
      enabled: body.enabled ?? true,
    };
    await env.BACKENDS.put(`webhook:${path}`, JSON.stringify(config));
    return json({ ok: true, config });
  }

  // POST /api/webhooks/:path/reset-secret
  const webhookResetMatch = pathname.match(/^\/api\/webhooks\/([^/]+)\/reset-secret$/);
  if (webhookResetMatch && method === "POST") {
    const whPath = sanitizeKeySegment(decodeURIComponent(webhookResetMatch[1]!));
    if (!whPath) return json({ error: "invalid path" }, 400);
    const existing = (await env.BACKENDS.get(`webhook:${whPath}`, "json")) as WebhookConfig | null;
    if (!existing) return json({ error: "not found" }, 404);
    const newSecret = generateSecret();
    await env.BACKENDS.put(`webhook:${whPath}`, JSON.stringify({ ...existing, secret: newSecret }));
    return json({ ok: true, secret: newSecret });
  }

  // PATCH/DELETE /api/webhooks/:path
  const webhookSubMatch = pathname.match(/^\/api\/webhooks\/([^/]+)$/);
  if (webhookSubMatch) {
    const whPath = sanitizeKeySegment(decodeURIComponent(webhookSubMatch[1]!));
    if (!whPath) return json({ error: "invalid path" }, 400);

    if (method === "PATCH") {
      const existing = (await env.BACKENDS.get(`webhook:${whPath}`, "json")) as WebhookConfig | null;
      if (!existing) return json({ error: "not found" }, 404);
      const update = (await readJson(request)) as Partial<WebhookConfig>;
      const updated: WebhookConfig = { ...existing, ...update, path: whPath };
      await env.BACKENDS.put(`webhook:${whPath}`, JSON.stringify(updated));
      return json({ ok: true, config: updated });
    }

    if (method === "DELETE") {
      await env.BACKENDS.delete(`webhook:${whPath}`);
      return json({ ok: true });
    }
  }

  // GET /api/models — list models (apiKey masked) + activeId
  if (pathname === "/api/models" && method === "GET") {
    const models = (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
    const activeName = await env.BACKENDS.get("llm:active");
    return json({
      models: models.map(({ apiKey: _k, ...rest }) => ({ ...rest, hasApiKey: !!_k })),
      activeName: activeName ?? models[0]?.displayName ?? null,
    });
  }

  // POST /api/models — add model
  if (pathname === "/api/models" && method === "POST") {
    const body = (await readJson(request)) as Partial<CustomModel>;
    if (!body.model || !body.displayName || !body.provider || !body.apiKey) {
      return json({ error: "missing required fields: model, displayName, provider, apiKey" }, 400);
    }
    const name = body.displayName.trim();
    if (!name) return json({ error: "displayName must not be empty" }, 400);
    const models = (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
    if (models.some((m) => m.displayName === name)) return json({ error: "model name already exists" }, 409);
    const model: CustomModel = {
      model: body.model.trim(),
      displayName: name,
      provider: body.provider,
      baseUrl: body.provider === "openai-compat" ? (body.baseUrl?.trim() || undefined) : undefined,
      apiKey: body.apiKey.trim(),
      maxOutputTokens: body.maxOutputTokens,
    };
    models.push(model);
    await env.BACKENDS.put("llm:models", JSON.stringify(models));
    return json({ ok: true, model: { ...model, apiKey: undefined, hasApiKey: true } });
  }

  // PUT /api/models/active — set active model
  if (pathname === "/api/models/active" && method === "PUT") {
    const body = (await readJson(request)) as { name?: string };
    if (!body.name) return json({ error: "missing name" }, 400);
    const models = (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
    if (!models.some((m) => m.displayName === body.name)) return json({ error: "model not found" }, 404);
    await env.BACKENDS.put("llm:active", body.name);
    return json({ ok: true, activeName: body.name });
  }

  // PUT /api/models/:id — update model
  const modelUpdateMatch = pathname.match(/^\/api\/models\/([^/]+)$/);
  if (modelUpdateMatch && method === "PUT") {
    const rawName = decodeURIComponent(modelUpdateMatch[1]!);
    const models = (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
    const idx = models.findIndex((m) => m.displayName === rawName);
    if (idx === -1) return json({ error: "not found" }, 404);
    const body = (await readJson(request)) as Partial<CustomModel>;
    const existing = models[idx]!;
    const newName = body.displayName?.trim() ?? existing.displayName;
    if (newName !== rawName && models.some((m, i) => i !== idx && m.displayName === newName)) {
      return json({ error: "model name already exists" }, 409);
    }
    const updated: CustomModel = {
      ...existing,
      model: body.model?.trim() ?? existing.model,
      displayName: newName,
      provider: body.provider ?? existing.provider,
      baseUrl: (body.provider ?? existing.provider) === "openai-compat"
        ? (body.baseUrl?.trim() || existing.baseUrl)
        : undefined,
      apiKey: body.apiKey?.trim() || existing.apiKey,
      maxOutputTokens: body.maxOutputTokens !== undefined ? body.maxOutputTokens : existing.maxOutputTokens,
    };
    models[idx] = updated;
    await env.BACKENDS.put("llm:models", JSON.stringify(models));
    if (newName !== rawName) {
      const activeName = await env.BACKENDS.get("llm:active");
      if (activeName === rawName) await env.BACKENDS.put("llm:active", newName);
    }
    return json({ ok: true, model: { ...updated, apiKey: undefined, hasApiKey: !!updated.apiKey } });
  }

  // DELETE /api/models/:name — delete model
  if (modelUpdateMatch && method === "DELETE") {
    const rawName = decodeURIComponent(modelUpdateMatch[1]!);
    const models = (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
    const filtered = models.filter((m) => m.displayName !== rawName);
    if (filtered.length === models.length) return json({ error: "not found" }, 404);
    await env.BACKENDS.put("llm:models", JSON.stringify(filtered));
    const activeName = await env.BACKENDS.get("llm:active");
    if (activeName === rawName) await env.BACKENDS.delete("llm:active");
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("invalid_json");
  }
}

function isManagementRoute(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/login/qr" ||
    pathname === "/login/status" ||
    pathname.startsWith("/bot/") ||
    pathname.startsWith("/api/")
  );
}

function getBearerToken(request: Request): string {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7);
}

async function enforceLoginRateLimit(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const limit = LOGIN_ROUTE_LIMITS[pathname];
  if (!limit) return null;

  const client = clientAddress(request);
  const stub = env.BOT_SESSION.get(env.BOT_SESSION.idFromName(RATE_LIMIT_DO_NAME));
  const response = await stub.fetch(new Request("http://do/rate-limit", {
    method: "POST",
    body: JSON.stringify({
      key: `${pathname}:${client}`,
      limit,
      window_ms: LOGIN_WINDOW_MS,
    }),
  }));

  if (!response.ok) {
    console.error(`[rate-limit] internal failure for ${pathname}`);
    return json({ error: "internal_error" }, 500);
  }

  const payload = (await response.json()) as {
    allowed?: boolean;
    retry_after_ms?: number;
  };
  if (payload.allowed !== false) return null;

  return json(
    {
      error: "rate_limited",
      retry_after_ms: Math.max(Number(payload.retry_after_ms ?? LOGIN_WINDOW_MS), 0),
    },
    429,
  );
}

function clientAddress(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function handleWebhook(request: Request, env: Env, urlPath: string): Promise<Response> {
  const config = await loadWebhookConfig(env, urlPath);
  if (!config) return json({ error: "not found" }, 404);
  if (!config.enabled) return json({ error: "not found" }, 404);

  const rawBody = await request.text();
  const authorized = await verifyWebhookRequest(request, rawBody, config);
  if (!authorized) return json({ error: "unauthorized" }, 401);

  let payload: unknown = rawBody;
  if (rawBody) {
    try { payload = JSON.parse(rawBody) as unknown; } catch { payload = rawBody; }
  }

  // Use config.source for the parser (not the URL path)
  const text = parseWebhookMessage(config.source, payload, request.headers);
  if (!text) return json({ ok: true, ignored: true });

  const delivered = await deliverWebhookMessage(env, config, text);
  if (!delivered) return json({ error: "delivery_failed" }, 502);

  return json({ ok: true });
}

async function loadWebhookConfig(env: Env, urlPath: string): Promise<WebhookConfig | null> {
  const config = (await env.BACKENDS.get(`webhook:${urlPath}`, "json")) as WebhookConfig | null;
  if (!config || !config.bot_ids?.length || !isWebhookVerifyMode(config.verify)) {
    return null;
  }
  return config;
}

/** Only allow safe characters in user-supplied KV key segments. */
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

function isWebhookVerifyMode(value: string): value is WebhookVerifyMode {
  return value === "hmac-sha256" || value === "bearer" || value === "none";
}

async function verifyWebhookRequest(
  request: Request,
  rawBody: string,
  config: WebhookConfig,
): Promise<boolean> {
  if (config.verify === "none") {
    return true;
  }

  if (config.verify === "bearer") {
    return secureCompare(getBearerToken(request), config.secret);
  }

  const headerName = config.header_field || "X-Hub-Signature-256";
  const signature = request.headers.get(headerName) || "";
  if (!signature || !config.secret) return false;

  const expected = await hmacSha256Hex(config.secret, rawBody);
  const normalized = signature.trim().toLowerCase().replace(/^sha256=/, "");
  return secureCompare(normalized, expected);
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function secureCompare(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function deliverWebhookMessage(
  env: Env,
  config: WebhookConfig,
  text: string,
): Promise<boolean> {
  // Fan-out: deliver to all configured bots in parallel.
  // Each bot sends to its own owner (ilink_user_id from credentials).
  const results = await Promise.all(
    config.bot_ids.map(async (botId) => {
      try {
        const stub = env.BOT_SESSION.get(env.BOT_SESSION.idFromName(botId));
        const response = await stub.fetch(new Request("http://do/send", {
          method: "POST",
          body: JSON.stringify({ text }),
        }));
        if (!response.ok) {
          console.error(`[webhook] delivery to bot ${botId} failed: ${response.status}`);
          return false;
        }
        return true;
      } catch (err) {
        console.error(`[webhook] delivery to bot ${botId} error:`, err);
        return false;
      }
    }),
  );
  return results.some(Boolean); // succeed if at least one bot delivered
}
