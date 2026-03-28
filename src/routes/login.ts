// Login routes module
// Reference: .kiro/specs/hono-refactor-phase1/design.md

import { Hono } from "hono";
import type { Env } from "../env.ts";
import { fetchQRCode, pollQRStatus } from "../ilink.ts";
import { loginPage } from "../pages/login.tsx";
import { renderQrSvg } from "../qr.ts";

const LOGIN_ROUTE_LIMITS: Record<string, number> = {
  "/login": 20,
  "/login/qr": 20,
  "/login/status": 120,
};

const LOGIN_WINDOW_MS = 60_000;
const RATE_LIMIT_DO_NAME = "__weclaw_hub_login_rate_limit__";

export const loginRoutes = new Hono<{ Bindings: Env }>();

// Rate limiting middleware for login routes
loginRoutes.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  const limit = LOGIN_ROUTE_LIMITS[pathname];
  
  if (limit) {
    const rateLimited = await enforceLoginRateLimit(c, pathname, limit);
    if (rateLimited) return rateLimited;
  }
  
  await next();
});

// GET /login - Return admin page
loginRoutes.get("/login", (c) => {
  const origin = new URL(c.req.url).origin;
  return loginPage(origin);
});

// GET /login/qr - Fetch QR code
loginRoutes.get("/login/qr", async (c) => {
  try {
    const qr = await fetchQRCode();
    return c.json({
      ...qr,
      qrcode_svg: renderQrSvg(qr.qrcode_img_content),
    });
  } catch (err) {
    console.error("[login/qr] fetch failed", err);
    return c.json({ error: "upstream_error" }, 502);
  }
});

// GET /login/status - Poll login status
loginRoutes.get("/login/status", async (c) => {
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
          baseurl: status.baseurl ?? "",
          ilink_user_id: status.ilink_user_id ?? "",
        }),
      }));

      if (!response.ok) {
        console.error("[login/status] failed to persist credentials", response.status);
        return c.json({ error: "login_persist_failed" }, 502);
      }
    }

    return c.json(status);
  } catch (err) {
    console.error("[login/status] poll failed", err);
    return c.json({ error: "upstream_error" }, 502);
  }
});

// Helper function to enforce rate limiting
async function enforceLoginRateLimit(
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
      window_ms: LOGIN_WINDOW_MS,
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
      retry_after_ms: Math.max(Number(payload.retry_after_ms ?? LOGIN_WINDOW_MS), 0),
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
