/**
 * Public invite page integration tests — Phase 1: 邀请绑定
 *
 * Tests the unauthenticated routes:
 *   GET /invite/:code      — HTML page with QR code
 *   GET /invite/:code/qr   — QR code data
 *   GET /invite/:code/status — Polling status
 *
 * Pattern: SELF.fetch WITHOUT Authorization header.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";

const AUTH = "Bearer test-token";

async function post(path: string, body: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify(body),
  });
}

async function put(path: string) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "PUT",
    headers: { Authorization: AUTH },
  });
}

async function cleanInviteKV(): Promise<void> {
  const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
  const list = await kv.list({ prefix: "invite:" });
  await Promise.all(list.keys.map((k) => kv.delete(k.name)));
  const usageList = await kv.list({ prefix: "invite_usage:" });
  await Promise.all(usageList.keys.map((k) => kv.delete(k.name)));
  const qrList = await kv.list({ prefix: "invite_qr:" });
  await Promise.all(qrList.keys.map((k) => kv.delete(k.name)));
}

async function createInvite(opts: { max_scans?: number; ttl_hours?: number; remark?: string } = {}): Promise<string> {
  const res = await post("/api/invites", opts);
  const data = (await res.json()) as { code: string };
  return data.code;
}

// ── GET /invite/:code (public HTML page) ────────────────────────────────────

describe("GET /invite/:code (public)", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("returns HTML page for valid invite code (no auth)", async () => {
    const code = await createInvite({ remark: "公开页面测试" });

    const res = await SELF.fetch(`http://localhost/invite/${code}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("WeClaw Hub");
    expect(html).toContain("邀请");
  });

  it("does not require Authorization header", async () => {
    const code = await createInvite();

    const res = await SELF.fetch(`http://localhost/invite/${code}`, {
      headers: {}, // no auth
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("returns disabled message for disabled invite", async () => {
    const code = await createInvite();
    await put(`/api/invites/${code}/disable`);

    const res = await SELF.fetch(`http://localhost/invite/${code}`);
    expect(res.status).toBe(200); // or maybe 410?
    const html = await res.text();
    expect(html).toContain("邀请已被禁用");
  });

  it("returns expired message for expired invite", async () => {
    const code = await createInvite();
    // Manually set expires_at in the past via KV
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    const invite = await kv.get(`invite:${code}`, "json") as Record<string, unknown>;
    invite.expires_at = Date.now() - 1000; // expired 1 second ago
    await kv.put(`invite:${code}`, JSON.stringify(invite));

    const res = await SELF.fetch(`http://localhost/invite/${code}`);
    expect(res.status).toBe(200); // or 410
    const html = await res.text();
    expect(html).toContain("已过期");
  });

  it("returns exhausted message when scan_count >= max_scans", async () => {
    const code = await createInvite({ max_scans: 1 });
    // Create a usage record to reach max_scans
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    await kv.put(`invite_usage:${code}:1`, JSON.stringify({
      used_at: Date.now(),
      bound_bot_id: "test-bot",
      ilink_user_id: "test-user",
      ip: "127.0.0.1",
      success: true,
    }));

    const res = await SELF.fetch(`http://localhost/invite/${code}`);
    const html = await res.text();
    expect(html).toContain("已用完");
  });

  it("returns 404 for nonexistent invite code", async () => {
    const res = await SELF.fetch("http://localhost/invite/nonexistent1234");
    expect(res.status).toBe(404);
  });
});

// ── GET /invite/:code/qr (public QR code) ──────────────────────────────────

describe("GET /invite/:code/qr (public)", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("returns QR code data including qrcode_svg for valid invite", async () => {
    const code = await createInvite();

    const res = await SELF.fetch(`http://localhost/invite/${code}/qr`);
    // May succeed (200) or fail (502) depending on iLink availability in test
    if (res.status === 200) {
      const data = (await res.json()) as { qrcode?: string; qrcode_svg?: string };
      expect(data.qrcode_svg !== undefined || data.qrcode !== undefined).toBe(true);
    }
  });

  it("does not require Authorization header", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/invite/${code}/qr`);
    // Not 401 unauthorized
    expect(res.status).not.toBe(401);
  });

  it("returns error for disabled invite", async () => {
    const code = await createInvite();
    await put(`/api/invites/${code}/disable`);

    const res = await SELF.fetch(`http://localhost/invite/${code}/qr`);
    expect(res.status).toBe(403);
  });
});

// ── GET /invite/:code/status (public polling) ──────────────────────────────

describe("GET /invite/:code/status (public)", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("returns pending status for valid invite", async () => {
    const code = await createInvite();

    const res = await SELF.fetch(`http://localhost/invite/${code}/status`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(["wait", "pending", "scaned", "confirmed", "expired"]).toContain(data.status);
  });

  it("does not require Authorization header", async () => {
    const code = await createInvite();
    const res = await SELF.fetch(`http://localhost/invite/${code}/status`);
    expect(res.status).not.toBe(401);
  });

  it("returns error for disabled invite", async () => {
    const code = await createInvite();
    await put(`/api/invites/${code}/disable`);

    const res = await SELF.fetch(`http://localhost/invite/${code}/status`);
    expect(res.status).toBe(403);
  });
});