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

// ── /api/models ────────────────────────────────────────────────────────────

describe("/api/models CRUD", () => {
  beforeEach(async () => {
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    await kv.delete("llm:models");
    await kv.delete("llm:active");
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
      model: "claude-3-5-sonnet-20241022",
      displayName: "Sonnet",
      provider: "anthropic",
      apiKey: "sk-test-key",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; model: Record<string, unknown> };
    expect(data.ok).toBe(true);
    expect(data.model.hasApiKey).toBe(true);
    expect(data.model.apiKey).toBeUndefined();
  });

  it("POST /api/models rejects duplicate displayName (409)", async () => {
    await post("/api/models", {
      model: "m",
      displayName: "Dupe",
      provider: "anthropic",
      apiKey: "k",
    });
    const res = await post("/api/models", {
      model: "m2",
      displayName: "Dupe",
      provider: "anthropic",
      apiKey: "k2",
    });
    expect(res.status).toBe(409);
  });

  it("POST /api/models rejects missing required fields (400)", async () => {
    const res = await post("/api/models", { model: "m" });
    expect(res.status).toBe(400);
  });

  it("PUT /api/models/active sets active model", async () => {
    await post("/api/models", {
      model: "m",
      displayName: "MyModel",
      provider: "anthropic",
      apiKey: "k",
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
      provider: "anthropic",
      apiKey: "k",
    });
    const res = await put("/api/models/OldName", {
      model: "new-model-id",
      displayName: "NewName",
      provider: "anthropic",
      apiKey: "k",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { model: Record<string, unknown> };
    expect(data.model.displayName).toBe("NewName");
    expect(data.model.model).toBe("new-model-id");
  });

  it("DELETE /api/models/:name removes the model", async () => {
    await post("/api/models", {
      model: "m",
      displayName: "ToDelete",
      provider: "anthropic",
      apiKey: "k",
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
      provider: "anthropic",
      apiKey: "super-secret",
    });
    const res = await get("/api/models");
    const data = (await res.json()) as { models: Array<Record<string, unknown>> };
    const model = data.models.find((m) => m.displayName === "Masked")!;
    expect(model.apiKey).toBeUndefined();
    expect(model.hasApiKey).toBe(true);
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
