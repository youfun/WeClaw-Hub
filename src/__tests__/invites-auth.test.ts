/**
 * Auth boundary tests for invite routes — Phase 1: 邀请绑定
 *
 * Verifies:
 *   - /api/invites/* requires authentication
 *   - /invite/* (public routes) do NOT require authentication
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";

const AUTH = "Bearer test-token";

async function cleanInviteKV(): Promise<void> {
  const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
  const list = await kv.list({ prefix: "invite:" });
  await Promise.all(list.keys.map((k) => kv.delete(k.name)));
  const usageList = await kv.list({ prefix: "invite_usage:" });
  await Promise.all(usageList.keys.map((k) => kv.delete(k.name)));
  const qrList = await kv.list({ prefix: "invite_qr:" });
  await Promise.all(qrList.keys.map((k) => kv.delete(k.name)));
}

async function createInvite(): Promise<string> {
  const res = await SELF.fetch("http://localhost/api/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as { code: string };
  return data.code;
}

// ── Management routes require auth ─────────────────────────────────────────

describe("/api/invites requires auth", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("GET /api/invites without auth → 401", async () => {
    const res = await SELF.fetch("http://localhost/api/invites");
    expect(res.status).toBe(401);
  });

  it("POST /api/invites without auth → 401", async () => {
    const res = await SELF.fetch("http://localhost/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/invites/:code without auth → 401", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/api/invites/${code}`);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/invites/:code without auth → 401", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/api/invites/${code}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("PUT /api/invites/:code/disable without auth → 401", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/api/invites/${code}/disable`, {
      method: "PUT",
    });
    expect(res.status).toBe(401);
  });

  it("PUT /api/invites/:code/enable without auth → 401", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/api/invites/${code}/enable`, {
      method: "PUT",
    });
    expect(res.status).toBe(401);
  });

  it("management routes work with correct Bearer token", async () => {
    const res = await SELF.fetch("http://localhost/api/invites", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
  });
});

// ── Public routes do NOT require auth ──────────────────────────────────────

describe("/invite/* routes are public", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("GET /invite/:code without auth → 200 (or valid status, not 401)", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/invite/${code}`);
    expect(res.status).not.toBe(401);
  });

  it("GET /invite/:code/qr without auth → not 401", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/invite/${code}/qr`);
    expect(res.status).not.toBe(401);
  });

  it("GET /invite/:code/status without auth → not 401", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/invite/${code}/status`);
    expect(res.status).not.toBe(401);
  });
});

// ── Wrong token rejected ────────────────────────────────────────────────────

describe("wrong token rejected", () => {
  it("GET /api/invites with wrong Bearer token → 401", async () => {
    const res = await SELF.fetch("http://localhost/api/invites", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });
});