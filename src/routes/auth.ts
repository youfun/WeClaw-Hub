// Bearer token authentication middleware
// Reference: .kiro/specs/hono-refactor-phase1/design.md

import type { Context, Next } from "hono";
import type { Env } from "../env.ts";

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (!isManagementPath(new URL(c.req.url).pathname)) {
    await next();
    return;
  }

  const authToken = c.env.AUTH_TOKEN?.trim() || "";

  if (!authToken) {
    return c.json({ error: "not configured" }, 503);
  }

  const bearerToken = getBearerToken(c.req.header("Authorization") || "");

  if (!secureCompare(bearerToken.trim(), authToken)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
}

function isManagementPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/login/qr" ||
    pathname === "/login/status" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/bot/")
  );
}

function getBearerToken(auth: string): string {
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7);
}

function secureCompare(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}
