/**
 * Invite API CRUD integration tests — Phase 1: 邀请绑定 + 失效 + 记录
 *
 * Uses SELF.fetch + env (KV) for integration testing, same pattern as worker.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";

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

async function put(path: string, body?: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

// ── POST /api/invites ──────────────────────────────────────────────────────

describe("POST /api/invites", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("creates invite with minimal params (max_scans defaults to 1, ttl_hours defaults to 24)", async () => {
    const res = await post("/api/invites", {});
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      code: string;
      max_scans: number;
      ttl_hours: number;
      disabled: boolean;
      expires_at: number;
      created_at: number;
      remark: string;
    };
    expect(typeof data.code).toBe("string");
    expect(data.code.length).toBe(16);
    expect(data.max_scans).toBe(1);
    expect(data.ttl_hours).toBe(24);
    expect(data.disabled).toBe(false);
    expect(data.remark).toBe("");
    // expires_at should be ~24h from now
    const expectedExpiry = data.created_at + 24 * 60 * 60 * 1000;
    expect(data.expires_at).toBe(expectedExpiry);
  });

  it("creates invite with custom max_scans and ttl_hours", async () => {
    const res = await post("/api/invites", {
      max_scans: 3,
      ttl_hours: 48,
      remark: "家庭邀请",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      max_scans: number;
      ttl_hours: number;
      remark: string;
    };
    expect(data.max_scans).toBe(3);
    expect(data.ttl_hours).toBe(48);
    expect(data.remark).toBe("家庭邀请");
  });

  it("newly created invite is enabled by default", async () => {
    const res = await post("/api/invites", { remark: "默认启用" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { disabled: boolean };
    expect(data.disabled).toBe(false);
  });

  it("rejects max_scans <= 0 with 400", async () => {
    const res = await post("/api/invites", { max_scans: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects max_scans negative with 400", async () => {
    const res = await post("/api/invites", { max_scans: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects ttl_hours <= 0 with 400", async () => {
    const res = await post("/api/invites", { ttl_hours: 0 });
    expect(res.status).toBe(400);
  });

  it("persists invite to KV", async () => {
    const res = await post("/api/invites", { remark: "KV测试" });
    const data = (await res.json()) as { code: string };
    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    const raw = await kv.get(`invite:${data.code}`, "json");
    expect(raw).not.toBeNull();
    const parsed = raw as { remark: string; scan_count?: number };
    expect(parsed.remark).toBe("KV测试");
    // scan_count is not stored — derived from usage records
    expect(parsed.scan_count).toBeUndefined();
  });
});

// ── GET /api/invites ───────────────────────────────────────────────────────

describe("GET /api/invites", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("returns empty array when no invites exist", async () => {
    const res = await get("/api/invites");
    expect(res.status).toBe(200);
    const data = (await res.json()) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it("lists created invites with correct fields", async () => {
    await post("/api/invites", { remark: "邀请1" });
    await post("/api/invites", { remark: "邀请2" });

    const res = await get("/api/invites");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{
      code: string;
      remark: string;
      max_scans: number;
      scan_count: number;
      disabled: boolean;
      expires_at: number;
    }>;
    expect(data).toHaveLength(2);
    expect(data[0]!.remark).toBe("邀请2");
    expect(data[1]!.remark).toBe("邀请1");
    // Each should have the required fields
    for (const invite of data) {
      expect(typeof invite.code).toBe("string");
      expect(typeof invite.max_scans).toBe("number");
      expect(typeof invite.scan_count).toBe("number");
      expect(typeof invite.disabled).toBe("boolean");
      expect(typeof invite.expires_at).toBe("number");
    }
  });

  it("does not include creator field in list response", async () => {
    await post("/api/invites", { remark: "x" });
    const res = await get("/api/invites");
    const data = (await res.json()) as Array<{ creator?: string }>;
    // creator should not be exposed in list
    expect(data[0]!.creator).toBeUndefined();
  });
});

// ── GET /api/invites/:code ─────────────────────────────────────────────────

describe("GET /api/invites/:code", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("returns invite detail with scan records", async () => {
    const createRes = await post("/api/invites", { remark: "详情测试" });
    const { code } = (await createRes.json()) as { code: string };

    const res = await get(`/api/invites/${code}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      code: string;
      remark: string;
      scan_records: unknown[];
    };
    expect(data.code).toBe(code);
    expect(data.remark).toBe("详情测试");
    expect(Array.isArray(data.scan_records)).toBe(true);
  });

  it("returns 404 for unknown invite code", async () => {
    const res = await get("/api/invites/nonexistent1234");
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/invites/:code ──────────────────────────────────────────────

describe("DELETE /api/invites/:code", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("deletes an invite and it is no longer retrievable", async () => {
    const createRes = await post("/api/invites", { remark: "待删除" });
    const { code } = (await createRes.json()) as { code: string };

    const delRes = await del(`/api/invites/${code}`);
    expect(delRes.status).toBe(200);

    const getRes = await get(`/api/invites/${code}`);
    expect(getRes.status).toBe(404);
  });

  it("also removes invite from KV", async () => {
    const createRes = await post("/api/invites", { remark: "KV删除测试" });
    const { code } = (await createRes.json()) as { code: string };

    await del(`/api/invites/${code}`);

    const kv = (env as unknown as { BACKENDS: KVNamespace }).BACKENDS;
    const raw = await kv.get(`invite:${code}`);
    expect(raw).toBeNull();
  });

  it("deleting nonexistent invite returns 404", async () => {
    const res = await del("/api/invites/nonexistent1234");
    expect(res.status).toBe(404);
  });
});

// ── PUT /api/invites/:code/disable ─────────────────────────────────────────

describe("PUT /api/invites/:code/disable", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("disables an active invite", async () => {
    const createRes = await post("/api/invites", { remark: "可禁用" });
    const { code } = (await createRes.json()) as { code: string };

    const res = await put(`/api/invites/${code}/disable`);
    expect(res.status).toBe(200);

    // Verify disabled
    const getRes = await get(`/api/invites/${code}`);
    const data = (await getRes.json()) as { disabled: boolean };
    expect(data.disabled).toBe(true);
  });

  it("disabling already-disabled invite is idempotent", async () => {
    const createRes = await post("/api/invites", {});
    const { code } = (await createRes.json()) as { code: string };

    await put(`/api/invites/${code}/disable`);
    const res = await put(`/api/invites/${code}/disable`);
    expect(res.status).toBe(200);

    const getRes = await get(`/api/invites/${code}`);
    const data = (await getRes.json()) as { disabled: boolean };
    expect(data.disabled).toBe(true);
  });
});

// ── PUT /api/invites/:code/enable ──────────────────────────────────────────

describe("PUT /api/invites/:code/enable", () => {
  beforeEach(async () => {
    await cleanInviteKV();
  });

  it("enables a disabled invite", async () => {
    const createRes = await post("/api/invites", {});
    const { code } = (await createRes.json()) as { code: string };

    await put(`/api/invites/${code}/disable`);
    const res = await put(`/api/invites/${code}/enable`);
    expect(res.status).toBe(200);

    const getRes = await get(`/api/invites/${code}`);
    const data = (await getRes.json()) as { disabled: boolean };
    expect(data.disabled).toBe(false);
  });

  it("enabling already-enabled invite is idempotent", async () => {
    const createRes = await post("/api/invites", {});
    const { code } = (await createRes.json()) as { code: string };

    const res = await put(`/api/invites/${code}/enable`);
    expect(res.status).toBe(200);

    const getRes = await get(`/api/invites/${code}`);
    const data = (await getRes.json()) as { disabled: boolean };
    expect(data.disabled).toBe(false);
  });
});