// Public routes module (no authentication required)
// Reference: .kiro/specs/hono-refactor-phase1/design.md

import { Hono } from "hono";
import type { Env } from "../env.ts";
import type { WebhookConfig, WebhookVerifyMode } from "../types.ts";
import { parseWebhookMessage } from "../webhooks/index.ts";

export const publicRoutes = new Hono<{ Bindings: Env }>();

// GET /health - Health check endpoint
publicRoutes.get("/health", (c) => {
  return new Response("ok");
});

// POST /webhooks/:path - Webhook inbound endpoint
publicRoutes.post("/webhooks/:path", async (c) => {
  const urlPath = c.req.param("path");
  
  const config = await loadWebhookConfig(c.env, urlPath);
  if (!config) return c.json({ error: "not found" }, 404);
  if (!config.enabled) return c.json({ error: "not found" }, 404);

  const rawBody = await c.req.text();
  const authorized = await verifyWebhookRequest(c.req.raw, rawBody, config);
  if (!authorized) return c.json({ error: "unauthorized" }, 401);

  let payload: unknown = rawBody;
  if (rawBody) {
    const contentType = c.req.header("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
    } else {
      try { payload = JSON.parse(rawBody) as unknown; } catch { /* not JSON, use raw */ }
    }
  }

  // Use config.source for the parser (not the URL path)
  const text = parseWebhookMessage(config.source, payload, c.req.raw.headers);
  if (!text) return c.json({ ok: true, ignored: true });

  const delivered = await deliverWebhookMessage(c.env, config, text);
  if (!delivered) return c.json({ error: "delivery_failed" }, 502);

  return c.json({ ok: true });
});

// Helper functions

async function loadWebhookConfig(env: Env, urlPath: string): Promise<WebhookConfig | null> {
  const config = (await env.BACKENDS.get(`webhook:${urlPath}`, "json")) as WebhookConfig | null;
  if (!config || !config.bot_ids?.length || !isWebhookVerifyMode(config.verify)) {
    return null;
  }
  return config;
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

function getBearerToken(request: Request): string {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7);
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
  return results.every(Boolean);
}
