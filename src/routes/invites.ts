/**
 * Invite routes — Hono router for /api/invites (auth) and /invite/* (public)
 * Phase 1: 分享邀请绑定 + 定期失效 + 邀请记录
 */

import { Hono } from "hono";
import type { Env } from "../env.ts";
import {
  createInvite,
  listInvites,
  getInviteDetail,
  deleteInvite,
  setInviteDisabled,
  validateCreateParams,
  handleInvitePage,
  handleInviteQR,
  handleInviteStatus,
} from "../invites.ts";
import type { InviteCreateParams } from "../invites.ts";

export const invitePublicRoutes = new Hono<{ Bindings: Env }>();
export const inviteApiRoutes = new Hono<{ Bindings: Env }>();

// ── Public routes (no auth needed, registered before authMiddleware) ───────

// GET /invite/:code — Public invite page
invitePublicRoutes.get("/invite/:code", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length !== 16) {
    return c.notFound();
  }
  return handleInvitePage(c.env, code);
});

// GET /invite/:code/qr — QR code for public invite
invitePublicRoutes.get("/invite/:code/qr", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length !== 16) {
    return c.notFound();
  }
  return handleInviteQR(c.env, code);
});

// GET /invite/:code/status — Polling status for public invite
invitePublicRoutes.get("/invite/:code/status", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length !== 16) {
    return c.notFound();
  }
  return handleInviteStatus(c.env, code, c.env.BOT_SESSION);
});

// ── API routes (require auth, registered after authMiddleware) ────────────

// POST /api/invites — Create invite
inviteApiRoutes.post("/api/invites", async (c) => {
  const body = await c.req.json().catch(() => null) as InviteCreateParams | null;

  // Default to empty params if no body
  const params: InviteCreateParams = body ?? {};

  const error = validateCreateParams(params);
  if (error) {
    return c.json({ error }, 400);
  }

  const token = (c.req.header("Authorization") || "").replace(/^Bearer\s+/i, "");
  const invite = await createInvite(c.env, params, token);
  return c.json(invite);
});

// GET /api/invites — List all invites
inviteApiRoutes.get("/api/invites", async (c) => {
  const invites = await listInvites(c.env);
  return c.json(invites);
});

// GET /api/invites/:code — Get invite detail with scan records
inviteApiRoutes.get("/api/invites/:code", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length !== 16) {
    return c.json({ error: "not found" }, 404);
  }

  const detail = await getInviteDetail(c.env, code);
  if (!detail) {
    return c.json({ error: "not found" }, 404);
  }

  return c.json(detail);
});

// DELETE /api/invites/:code — Delete invite
inviteApiRoutes.delete("/api/invites/:code", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length !== 16) {
    return c.json({ error: "not found" }, 404);
  }

  await deleteInvite(c.env, code);
  return c.json({ ok: true });
});

// PUT /api/invites/:code/disable — Disable invite
inviteApiRoutes.put("/api/invites/:code/disable", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length !== 16) {
    return c.json({ error: "not found" }, 404);
  }

  const updated = await setInviteDisabled(c.env, code, true);
  if (!updated) {
    return c.json({ error: "not found" }, 404);
  }

  return c.json({ ok: true });
});

// PUT /api/invites/:code/enable — Enable invite
inviteApiRoutes.put("/api/invites/:code/enable", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length !== 16) {
    return c.json({ error: "not found" }, 404);
  }

  const updated = await setInviteDisabled(c.env, code, false);
  if (!updated) {
    return c.json({ error: "not found" }, 404);
  }

  return c.json({ ok: true });
});