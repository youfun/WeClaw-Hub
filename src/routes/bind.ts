// Bind routes module
//
// 微信账号绑定流程：扫码 -> 轮询状态 -> 保存凭证

import { Hono } from "hono";
import type { Env } from "../env.ts";
import { fetchQRCode, pollQRStatus } from "../ilink.ts";
import { loginPage } from "../pages/login.tsx";
import { renderQrSvg } from "../qr.ts";

const BIND_ROUTE_LIMITS: Record<string, number> = {
  "/bind": 20,
  "/bind/qr": 20,
  "/bind/status": 120,
};

const BIND_WINDOW_MS = 60_000;
const RATE_LIMIT_DO_NAME = "__weclaw_hub_bind_rate_limit__";

export const bindRoutes = new Hono<{ Bindings: Env }>();

// Rate limiting middleware for bind routes
bindRoutes.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  const limit = BIND_ROUTE_LIMITS[pathname];
  
  if (limit) {
    const rateLimited = await enforceBindRateLimit(c, pathname, limit);
    if (rateLimited) return rateLimited;
  }
  
  await next();
});

// GET /bind - Return bind page
bindRoutes.get("/bind", (c) => {
  const origin = new URL(c.req.url).origin;
  return loginPage(origin);
});

// GET /bind/qr - Fetch QR code
bindRoutes.get("/bind/qr", async (c) => {
  try {
    const qr = await fetchQRCode();
    return c.json({
      ...qr,
      qrcode_svg: renderQrSvg(qr.qrcode_img_content),
    });
  } catch (err) {
    console.error("[bind/qr] fetch failed", err);
    return c.json({ error: "upstream_error" }, 502);
  }
});

// GET /bind/status - Poll bind status
bindRoutes.get("/bind/status", async (c) => {
  const qrcode = c.req.query("qrcode");
  if (!qrcode) {
    return c.json({ error: "missing qrcode param" }, 400);
  }

  const redirectHost = c.req.query("redirect_host") || undefined;

  try {
    const status = await pollQRStatus(qrcode, redirectHost);

    if (status.status === "confirmed" && status.bot_token && status.ilink_bot_id) {
      const botId = c.env.BOT_SESSION.idFromName(status.ilink_bot_id);
      const stub = c.env.BOT_SESSION.get(botId);
      const response = await stub.fetch(new Request("http://do/login", {
        method: "POST",
        body: JSON.stringify({
          bot_token: status.bot_token,
          ilink_bot_id: status.ilink_bot_id,
          baseurl: status.baseurl ?? status.base_url ?? "",
          ilink_user_id: status.ilink_user_id ?? "",
        }),
      }));

      if (!response.ok) {
        console.error("[bind/status] failed to persist credentials", response.status);
        return c.json({ error: "bind_persist_failed" }, 502);
      }
    }

    return c.json(status);
  } catch (err) {
    console.error("[bind/status] poll failed", err);
    return c.json({ error: "upstream_error" }, 502);
  }
});

// Helper function to enforce rate limiting
async function enforceBindRateLimit(
  c: { env: Env; req: { raw: Request } },
  pathname: string,
  limit: number,
): Promise<Response | null> {
  const client = clientAddress(c.req.raw);
  const stub = c.env.BOT_SESSION.get(c.env.BOT_SESSION.idFromName(RATE_LIMIT_DO_NAME));
  const response = await stub.fetch(new Request("http://do/rate-limit", {
    method: "POST",
    body: JSON.stringify({
      key: `${pathname}:${client}`,
      limit,
      window_ms: BIND_WINDOW_MS,
    }),
  }));

  if (!response.ok) {
    console.error(`[rate-limit] internal failure for ${pathname}`);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = (await response.json()) as {
    allowed?: boolean;
    retry_after_ms?: number;
  };
  
  if (payload.allowed !== false) return null;

  return new Response(
    JSON.stringify({
      error: "rate_limited",
      retry_after_ms: Math.max(Number(payload.retry_after_ms ?? BIND_WINDOW_MS), 0),
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function clientAddress(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
