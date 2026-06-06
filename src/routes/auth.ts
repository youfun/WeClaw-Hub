// Bearer token authentication middleware
// Reference: .kiro/specs/hono-refactor-phase1/design.md

import type { Context, Next } from "hono";
import type { Env } from "../env.ts";
import { secureCompare, getBearerToken } from "../utils.ts";

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const pathname = new URL(c.req.url).pathname;

  if (!isManagementPath(pathname)) {
    await next();
    return;
  }

  const authToken = c.env.AUTH_TOKEN?.trim() || "";

  if (!authToken) {
    // For HTML pages, redirect to /auth; for API, return JSON error
    if (isHtmlRequest(c)) {
      return c.redirect(`/auth?redirect=${encodeURIComponent(pathname)}`);
    }
    return c.json({ error: "not configured" }, 503);
  }

  const requestToken = getBearerToken(c.req.header("Authorization") || "")
    || getCookieToken(c.req.header("Cookie") || "");

  if (!secureCompare(requestToken.trim(), authToken)) {
    if (isHtmlRequest(c)) {
      return c.redirect(`/auth?redirect=${encodeURIComponent(pathname)}`);
    }
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
}

function isManagementPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/login/qr" ||
    pathname === "/login/status" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/bot/")
  );
}

function isHtmlRequest(c: Context): boolean {
  return (c.req.header("Accept") || "").includes("text/html");
}

function getCookieToken(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}


