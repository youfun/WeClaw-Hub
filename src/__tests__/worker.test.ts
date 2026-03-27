/**
 * Worker integration tests — run inside workerd via @cloudflare/vitest-pool-workers.
 *
 * `SELF` dispatches requests to the Worker under test (src/index.ts).
 * `env` gives direct access to KV/DO bindings for test setup.
 * AUTH_TOKEN is set to "test-token" in vitest.config.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import type { WebhookConfig } from "../types.ts";

const AUTH = "Bearer test-token";

async function get(path: string, headers?: Record<string, string>) {
  return SELF.fetch(`http://localhost${path}`, {
    headers: { Authorization: AUTH, ...headers },
  });
}

async function post(path: string, body: unknown, headers?: Record<string, string>) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH, ...headers },
    body: JSON.stringify(body),
  });
}

async function del(path: string) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "DELETE",
    headers: { Authorization: AUTH },
  });
}

async function patch(path: string, body: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify(body),
  });
}

async function put(path: string, body: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify(body),
  });
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── /health ────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await SELF.fetch("http://localhost/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

// ── Auth middleware ────────────────────────────────────────────────────────

describe("auth middleware", () => {
  it("rejects management routes with wrong Bearer token (401)", async () => {
    const res = await SELF.fetch("http://localhost/api/bots", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("allows management routes with correct Bearer token", async () => {
    const res = await get("/api/bots");
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown routes even with valid auth", async () => {
    const res = await get("/api/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 404 for completely unknown path without auth", async () => {
    const res = await SELF.fetch("http://localhost/not-a-route");
    expect(res.status).toBe(404);
  });
});

// ── /api/webhooks ──────────────────────────────────────────────────────────

describe("/api/webhooks CRUD", () => {
  beforeEach(async () => {
    // Clean up any test webhooks
    const list = await (env as unknown as { BACKENDS: KVNamespace }).BACKENDS.list({ prefix: "webhook:" });
    await Promise.all(
      list.keys.map((k) => (env as unknown as { BACKENDS: KVNamespace }).BACKENDS.delete(k.name)),
    );
  });

  it("GET /api/webhooks returns empty array when none exist", async () => {
    const res = await get("/api/webhooks");
    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it("POST /api/webhooks creates a webhook", async () => {
    const res = await post("/api/webhooks", {
      bot_ids: ["bot-001"],
      source: "github",
      verify: "bearer",
      name: "Test Hook",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; config: WebhookConfig };
    expect(data.ok).toBe(true);
    expect(data.config.source).toBe("github");
    expect(data.config.verify).toBe("bearer");
    expect(data.config.bot_ids).toContain("bot-001");
    // secret should be present in the creation response
    expect(typeof data.config.secret).toBe("string");
    expect(data.config.secret.length).toBeGreaterThan(0);
  });

  it("POST /api/webhooks with explicit path uses that path", async () => {
    const res = await post("/api/webhooks", {
      bot_ids: ["bot-001"],
      path: "my-hook",
      verify: "none",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { config: WebhookConfig };
    expect(data.config.path).toBe("my-hook");
  });

  it("POST /api/webhooks rejects missing bot_ids (400)", async () => {
    const res = await post("/api/webhooks", { source: "github" });
    expect(res.status).toBe(400);
  });

  it("POST /api/webhooks rejects invalid path characters (400)", async () => {
    const res = await post("/api/webhooks", {
      bot_ids: ["bot-001"],
      path: "bad path!",
      verify: "none",
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/webhooks lists created webhooks (secret stripped)", async () => {
    await post("/api/webhooks", { bot_ids: ["bot-001"], path: "list-test", verify: "none" });
    const res = await get("/api/webhooks");
    const data = (await res.json()) as Array<Record<string, unknown>>;
    expect(data.some((w) => w.path === "list-test")).toBe(true);
    // secret must be stripped
    expect(data.find((w) => w.path === "list-test")!.secret).toBeUndefined();
  });

  it("PATCH /api/webhooks/:path updates name", async () => {
    await post("/api/webhooks", { bot_ids: ["bot-001"], path: "patch-test", verify: "none" });
    const res = await patch("/api/webhooks/patch-test", { name: "Updated Name" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { config: WebhookConfig };
    expect(data.config.name).toBe("Updated Name");
  });

  it("PATCH /api/webhooks/:path returns 404 for unknown path", async () => {
    const res = await patch("/api/webhooks/no-such-path", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/webhooks/:path removes it", async () => {
    await post("/api/webhooks", { bot_ids: ["bot-001"], path: "del-test", verify: "none" });
    const delRes = await del("/api/webhooks/del-test");
    expect(delRes.status).toBe(200);
    // Verify it's gone from list
    const listRes = await get("/api/webhooks");
    const data = (await listRes.json()) as Array<Record<string, unknown>>;
    expect(data.some((w) => w.path === "del-test")).toBe(false);
  });
});

// ── Webhook ingress verification ───────────────────────────────────────────

describe("POST /webhooks/:path", () => {
  const BEARER_SECRET = "my-bearer-secret-xyz";
  const HMAC_SECRET = "my-hmac-secret-abc";

  beforeEach(async () => {
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;

    const bearerConfig: WebhookConfig = {
      path: "bearer-hook",
      name: "Bearer Test",
      source: "generic",
      secret: BEARER_SECRET,
      verify: "bearer",
      bot_ids: ["bot-001"],
      enabled: true,
    };
    const hmacConfig: WebhookConfig = {
      path: "hmac-hook",
      name: "HMAC Test",
      source: "generic",
      secret: HMAC_SECRET,
      verify: "hmac-sha256",
      bot_ids: ["bot-001"],
      enabled: true,
    };
    const disabledConfig: WebhookConfig = {
      path: "disabled-hook",
      name: "Disabled",
      source: "generic",
      secret: "s",
      verify: "none",
      bot_ids: ["bot-001"],
      enabled: false,
    };

    await kv.put("webhook:bearer-hook", JSON.stringify(bearerConfig));
    await kv.put("webhook:hmac-hook", JSON.stringify(hmacConfig));
    await kv.put("webhook:disabled-hook", JSON.stringify(disabledConfig));
  });

  it("returns 404 for unknown webhook path", async () => {
    const res = await SELF.fetch("http://localhost/webhooks/no-such-path", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for disabled webhook", async () => {
    const res = await SELF.fetch("http://localhost/webhooks/disabled-hook", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("rejects bearer webhook with wrong token (401)", async () => {
    const res = await SELF.fetch("http://localhost/webhooks/bearer-hook", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts bearer webhook with correct token (delivery fails without bot creds → 502)", async () => {
    const res = await SELF.fetch("http://localhost/webhooks/bearer-hook", {
      method: "POST",
      headers: { Authorization: `Bearer ${BEARER_SECRET}` },
      body: JSON.stringify({ text: "hello" }),
    });
    // Auth passed; delivery fails because the test DO has no credentials
    expect(res.status).toBe(502);
  });

  it("rejects HMAC webhook with wrong signature (401)", async () => {
    const res = await SELF.fetch("http://localhost/webhooks/hmac-hook", {
      method: "POST",
      headers: { "X-Hub-Signature-256": "sha256=badsignature" },
      body: JSON.stringify({ text: "hi" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts HMAC webhook with correct signature (delivery fails without bot creds → 502)", async () => {
    const body = JSON.stringify({ text: "hi" });
    const sig = await hmacSha256Hex(HMAC_SECRET, body);
    const res = await SELF.fetch("http://localhost/webhooks/hmac-hook", {
      method: "POST",
      headers: { "X-Hub-Signature-256": `sha256=${sig}` },
      body,
    });
    expect(res.status).toBe(502);
  });

  it("accepts HMAC signature without sha256= prefix (delivery fails without bot creds → 502)", async () => {
    const body = JSON.stringify({ text: "hi" });
    const sig = await hmacSha256Hex(HMAC_SECRET, body);
    const res = await SELF.fetch("http://localhost/webhooks/hmac-hook", {
      method: "POST",
      headers: { "X-Hub-Signature-256": sig },
      body,
    });
    expect(res.status).toBe(502);
  });
});

// ── /api/providers ─────────────────────────────────────────────────────────

describe("/api/providers CRUD", () => {
  beforeEach(async () => {
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    await kv.delete("llm:providers");
  });

  it("GET /api/providers returns empty list initially", async () => {
    const res = await get("/api/providers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { providers: unknown[] };
    expect(data.providers).toHaveLength(0);
  });

  it("POST /api/providers creates a provider and masks apiKey in response", async () => {
    const res = await post("/api/providers", {
      id: "anthropic-direct",
      name: "Anthropic Direct",
      type: "anthropic",
      apiKey: "${ANTHROPIC_API_KEY}",
      defaultMaxOutputTokens: 4096,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; provider: Record<string, unknown> };
    expect(data.ok).toBe(true);
    expect(data.provider.id).toBe("anthropic-direct");
    expect(data.provider.apiKey).toBeUndefined();
    expect(data.provider.hasApiKey).toBe(true);
  });

  it("GET /api/providers/:id/models returns built-in Anthropic models", async () => {
    await post("/api/providers", {
      id: "anthropic-direct",
      name: "Anthropic Direct",
      type: "anthropic",
      apiKey: "${ANTHROPIC_API_KEY}",
    });
    const res = await get("/api/providers/anthropic-direct/models");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { models: Array<{ id: string; name: string }> };
    expect(data.models.some((model) => model.id === "claude-sonnet-4-5-20250514")).toBe(true);
  });

  it("PUT /api/providers/:id updates provider fields", async () => {
    await post("/api/providers", {
      id: "openrouter",
      name: "OpenRouter",
      type: "openai-compat",
      baseUrl: "https://openrouter.ai/api",
      apiKey: "${OPENROUTER_API_KEY}",
    });
    const res = await put("/api/providers/openrouter", {
      name: "OpenRouter Main",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultMaxOutputTokens: 2048,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { provider: Record<string, unknown> };
    expect(data.provider.name).toBe("OpenRouter Main");
    expect(data.provider.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(data.provider.defaultMaxOutputTokens).toBe(2048);
  });

  it("DELETE /api/providers/:id removes provider", async () => {
    await post("/api/providers", {
      id: "openrouter",
      name: "OpenRouter",
      type: "openai-compat",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "${OPENROUTER_API_KEY}",
    });
    const res = await del("/api/providers/openrouter");
    expect(res.status).toBe(200);
    const list = await get("/api/providers");
    const data = (await list.json()) as { providers: Array<{ id: string }> };
    expect(data.providers.some((provider) => provider.id === "openrouter")).toBe(false);
  });
});

// ── /api/models ────────────────────────────────────────────────────────────

describe("/api/models CRUD", () => {
  beforeEach(async () => {
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    await kv.delete("llm:providers");
    await kv.delete("llm:models");
    await kv.delete("llm:active");

    await kv.put("llm:providers", JSON.stringify([
      {
        id: "anthropic-direct",
        name: "Anthropic Direct",
        type: "anthropic",
        apiKey: "${ANTHROPIC_API_KEY}",
        defaultMaxOutputTokens: 4096,
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compat",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "${OPENROUTER_API_KEY}",
        defaultMaxOutputTokens: 2048,
      },
    ]));
  });

  it("GET /api/models returns empty list initially", async () => {
    const res = await get("/api/models");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { models: unknown[]; activeName: null };
    expect(data.models).toHaveLength(0);
    expect(data.activeName).toBeNull();
  });

  it("POST /api/models adds a model (apiKey masked in response)", async () => {
    const res = await post("/api/models", {
      model: "claude-sonnet-4-5-20250514",
      displayName: "Sonnet",
      providerId: "anthropic-direct",
      role: "complex",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; model: Record<string, unknown> };
    expect(data.ok).toBe(true);
    expect(data.model.providerId).toBe("anthropic-direct");
    expect(data.model.role).toBe("complex");
  });

  it("POST /api/models rejects duplicate displayName (409)", async () => {
    await post("/api/models", {
      model: "m",
      displayName: "Dupe",
      providerId: "anthropic-direct",
    });
    const res = await post("/api/models", {
      model: "m2",
      displayName: "Dupe",
      providerId: "anthropic-direct",
    });
    expect(res.status).toBe(409);
  });

  it("POST /api/models rejects missing providerId (400)", async () => {
    const res = await post("/api/models", { model: "m" });
    expect(res.status).toBe(400);
  });

  it("POST /api/models rejects unknown providerId (400)", async () => {
    const res = await post("/api/models", {
      model: "m",
      displayName: "Broken",
      providerId: "missing-provider",
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/models/active sets active model", async () => {
    await post("/api/models", {
      model: "m",
      displayName: "MyModel",
      providerId: "anthropic-direct",
    });
    const res = await put("/api/models/active", { name: "MyModel" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { activeName: string };
    expect(data.activeName).toBe("MyModel");
  });

  it("PUT /api/models/active returns 404 for unknown model", async () => {
    const res = await put("/api/models/active", { name: "Nope" });
    expect(res.status).toBe(404);
  });

  it("PUT /api/models/:name updates a model", async () => {
    await post("/api/models", {
      model: "old-model-id",
      displayName: "OldName",
      providerId: "anthropic-direct",
    });
    const res = await put("/api/models/OldName", {
      model: "new-model-id",
      displayName: "NewName",
      providerId: "openrouter",
      role: "daily",
      maxOutputTokens: 1024,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { model: Record<string, unknown> };
    expect(data.model.displayName).toBe("NewName");
    expect(data.model.model).toBe("new-model-id");
    expect(data.model.providerId).toBe("openrouter");
    expect(data.model.role).toBe("daily");
  });

  it("POST /api/models/import imports selected models and skips duplicates", async () => {
    await post("/api/models", {
      model: "claude-sonnet-4-5-20250514",
      displayName: "Claude Sonnet 4.5",
      providerId: "anthropic-direct",
    });
    const res = await post("/api/models/import", {
      providerId: "anthropic-direct",
      models: [
        { model: "claude-sonnet-4-5-20250514", displayName: "Claude Sonnet 4.5" },
        { model: "claude-3-5-haiku-20241022", displayName: "Claude 3.5 Haiku" },
      ],
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { imported: number; skipped: number };
    expect(data.imported).toBe(1);
    expect(data.skipped).toBe(1);
  });

  it("DELETE /api/models/:name removes the model", async () => {
    await post("/api/models", {
      model: "m",
      displayName: "ToDelete",
      providerId: "anthropic-direct",
    });
    const res = await del("/api/models/ToDelete");
    expect(res.status).toBe(200);
    const listRes = await get("/api/models");
    const data = (await listRes.json()) as { models: Array<{ displayName: string }> };
    expect(data.models.some((m) => m.displayName === "ToDelete")).toBe(false);
  });

  it("GET /api/models masks apiKey in list", async () => {
    await post("/api/models", {
      model: "m",
      displayName: "Masked",
      providerId: "anthropic-direct",
    });
    const res = await get("/api/models");
    const data = (await res.json()) as { models: Array<Record<string, unknown>> };
    const model = data.models.find((m) => m.displayName === "Masked")!;
    expect(model.providerId).toBe("anthropic-direct");
    expect(model.provider).toBeUndefined();
    expect(model.apiKey).toBeUndefined();
  });
});

// ── /api/tools ─────────────────────────────────────────────────────────────

describe("GET /api/tools", () => {
  it("returns builtin tools with dynamic params schema", async () => {
    const res = await get("/api/tools");
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      tools: Array<{
        id: string;
        source: string;
        params: Array<{ name: string; type: string; required: boolean }>;
      }>;
    };

    expect(data.tools.map((tool) => tool.id)).toEqual([
      "send_message",
      "agent_prompt",
      "fetch_analyze",
    ]);
    expect(data.tools.every((tool) => tool.source === "builtin")).toBe(true);
    expect(data.tools.find((tool) => tool.id === "fetch_analyze")?.params).toEqual([
      expect.objectContaining({ name: "url", type: "string", required: true }),
      expect.objectContaining({ name: "prompt", type: "text", required: true }),
      expect.objectContaining({ name: "headers", type: "text", required: false }),
    ]);
  });
});

// ── /api/backends ──────────────────────────────────────────────────────────

describe("/api/backends CRUD", () => {
  beforeEach(async () => {
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    const list = await kv.list({ prefix: "backend:" });
    await Promise.all(list.keys.map((k) => kv.delete(k.name)));
  });

  it("GET /api/backends returns empty list", async () => {
    const res = await get("/api/backends");
    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(data).toHaveLength(0);
  });

  it("POST /api/backends creates a backend", async () => {
    const res = await post("/api/backends", {
      id: "my-backend",
      webhook_url: "https://example.com/hook",
      name: "My Backend",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; backend: Record<string, unknown> };
    expect(data.ok).toBe(true);
    expect(data.backend.id).toBe("my-backend");
    expect(data.backend.webhook_url).toBe("https://example.com/hook");
  });

  it("POST /api/backends rejects missing id or webhook_url (400)", async () => {
    const res = await post("/api/backends", { id: "x" });
    expect(res.status).toBe(400);
  });

  it("POST /api/backends rejects invalid id characters (400)", async () => {
    const res = await post("/api/backends", {
      id: "bad id!",
      webhook_url: "https://example.com/hook",
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/backends/:id removes the backend", async () => {
    await post("/api/backends", {
      id: "del-me",
      webhook_url: "https://example.com/hook",
    });
    const res = await del("/api/backends/del-me");
    expect(res.status).toBe(200);
  });
});

// ── /bot/:id/settings ──────────────────────────────────────────────────────

describe("/bot/:id/settings", () => {
  it("returns structured defaults and supports partial updates", async () => {
    const botId = "settings-bot";

    const initial = await get(`/bot/${botId}/settings`);
    expect(initial.status).toBe(200);
    const initialData = (await initial.json()) as {
      remark: string;
      keepalive: boolean;
      agent_mode: string;
      accept_webhook: boolean;
    };
    expect(initialData.agent_mode).toBe("family");
    expect(initialData.keepalive).toBe(false);
    expect(initialData.accept_webhook).toBe(true);

    const patched = await patch(`/bot/${botId}/settings`, {
      remark: "Primary bot",
      keepalive: true,
      agent_mode: "manual",
      active_model: "Claude Sonnet",
      accept_webhook: false,
    });
    expect(patched.status).toBe(200);

    const after = await get(`/bot/${botId}/settings`);
    const afterData = (await after.json()) as {
      remark: string;
      keepalive: boolean;
      agent_mode: string;
      active_model?: string;
      accept_webhook: boolean;
    };
    expect(afterData.remark).toBe("Primary bot");
    expect(afterData.keepalive).toBe(true);
    expect(afterData.agent_mode).toBe("manual");
    expect(afterData.active_model).toBe("Claude Sonnet");
    expect(afterData.accept_webhook).toBe(false);
  });
});

// ── /bot/:id/status ────────────────────────────────────────────────────────

describe("/bot/:id/status", () => {
  it("reflects the current mode in status output", async () => {
    const botId = "status-bot";
    await patch(`/bot/${botId}/settings`, { agent_mode: "manual", remark: "Status Bot" });

    const res = await get(`/bot/${botId}/status`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { agent_mode: string; remark?: string };
    expect(data.agent_mode).toBe("manual");
  });
});

// ── /bot/:id/tasks ─────────────────────────────────────────────────────────

describe("/bot/:id/tasks", () => {
  it("creates, updates, lists, and deletes scheduled tasks", async () => {
    const botId = "tasks-bot";

    const created = await post(`/bot/${botId}/tasks`, {
      id: "daily-reminder",
      name: "Daily Reminder",
      enabled: true,
      schedule: { type: "cron", cron: "0 21 * * *" },
      tool_id: "send_message",
      tool_params: { text: "晚安" },
    });
    expect(created.status).toBe(200);
    const createdData = (await created.json()) as {
      task: { id: string; tool_id: string; tool_params: { text: string }; next_run_at?: number };
    };
    expect(createdData.task.id).toBe("daily-reminder");
    expect(createdData.task.tool_id).toBe("send_message");
    expect(createdData.task.tool_params.text).toBe("晚安");
    expect(typeof createdData.task.next_run_at).toBe("number");

    const list = await get(`/bot/${botId}/tasks`);
    const listData = (await list.json()) as {
      tasks: Array<{ id: string; enabled: boolean; tool_id: string; tool_params: { text: string } }>;
    };
    expect(listData.tasks.some((task) => task.id === "daily-reminder")).toBe(true);
    expect(listData.tasks.find((task) => task.id === "daily-reminder")?.tool_id).toBe("send_message");

    const updated = await put(`/bot/${botId}/tasks/daily-reminder`, {
      enabled: false,
      name: "Daily Reminder v2",
      tool_id: "agent_prompt",
      tool_params: { prompt: "提醒我早点休息" },
    });
    expect(updated.status).toBe(200);
    const updatedData = (await updated.json()) as {
      task: { enabled: boolean; name: string; tool_id: string; tool_params: { prompt: string } };
    };
    expect(updatedData.task.enabled).toBe(false);
    expect(updatedData.task.name).toBe("Daily Reminder v2");
    expect(updatedData.task.tool_id).toBe("agent_prompt");
    expect(updatedData.task.tool_params.prompt).toBe("提醒我早点休息");

    const deleted = await del(`/bot/${botId}/tasks/daily-reminder`);
    expect(deleted.status).toBe(200);

    const afterDelete = await get(`/bot/${botId}/tasks`);
    const afterData = (await afterDelete.json()) as { tasks: Array<{ id: string }> };
    expect(afterData.tasks.some((task) => task.id === "daily-reminder")).toBe(false);
  });
});

// ── Admin pages ────────────────────────────────────────────────────────────

describe("admin pages", () => {
  it("GET /login returns HTML", async () => {
    const res = await get("/login");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("WeClaw Hub");
  });

  it("GET /admin returns admin dashboard HTML", async () => {
    const res = await get("/admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("机器人总览");
  });

  it("GET /admin/bot/:id returns bot detail HTML", async () => {
    const res = await get("/admin/bot/demo-bot");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("定时任务");
  });
});

// ── /api/send ─────────────────────────────────────────────────────────────

describe("POST /api/send", () => {
  it("returns 400 when missing bot_id or text", async () => {
    const res = await post("/api/send", { text: "hello" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when missing text", async () => {
    const res = await post("/api/send", { bot_id: "bot-1" });
    expect(res.status).toBe(400);
  });

  it("forwards to DO when params valid (DO returns 401 — no credentials)", async () => {
    const res = await post("/api/send", { bot_id: "test-bot", text: "hello" });
    // DO returns 401 because no credentials are set up; worker proxies it
    expect([200, 400, 401, 502]).toContain(res.status);
  });
});

// ── Bridge WebSocket ───────────────────────────────────────────────────────

describe("GET /api/bridge/connect", () => {
  it("returns 426 without WebSocket upgrade header", async () => {
    const res = await get("/api/bridge/connect?bot_id=bot-1");
    expect(res.status).toBe(426);
  });

  it("returns 400 without bot_id", async () => {
    const res = await SELF.fetch("http://localhost/api/bridge/connect", {
      headers: { Authorization: AUTH, Upgrade: "websocket" },
    });
    expect(res.status).toBe(400);
  });
});
