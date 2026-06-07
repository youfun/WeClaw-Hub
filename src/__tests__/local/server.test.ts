/**
 * Local server integration tests (RED → GREEN).
 *
 * These tests run OUTSIDE the Cloudflare vitest pool — they use Bun's
 * native test runner and bun:sqlite directly.
 *
 * Run with:  bun test src/__tests__/local/server.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { start } from "../../local/server";

const BOT_ID = "local-test-bot";
const USER_ID = "local-user-001";

const AUTH = "Bearer local-dev-token";

let server: ReturnType<typeof start>;
let baseUrl: string;

async function apiGet(path: string) {
  const req = new Request(`http://localhost${path}`, {
    headers: { Authorization: AUTH },
  });
  return server.app.fetch(req, server.env);
}

async function apiPost(path: string, body: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify(body),
  });
  return server.app.fetch(req, server.env);
}

describe("Local WeClaw-Hub Server", () => {
  beforeAll(() => {
    // Use in-memory database for testing
    server = start({ dataDir: `./test-data-${Date.now()}` });
  });

  afterAll(() => {
    server.stop();
  });

  // ── Health check ──────────────────────────────────────────────────────

  it("GET /health returns ok", async () => {
    // /health is a public route, no auth needed
    const req = new Request("http://localhost/health");
    const res = await server.app.fetch(req, server.env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("ok");
  });

  it("GET / returns landing page", async () => {
    const res = await apiGet("/");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("WeClaw");
  });

  // ── Seed + compress (end-to-end) ──────────────────────────────────────

  it("seed-chat creates messages, compress reduces them", async () => {
    // Create conversation
    const convRes = await apiPost(`/bot/${BOT_ID}/conv`, {
      user_id: USER_ID,
      sub: "new",
      title: "本地压缩测试",
    });
    expect(convRes.status).toBe(200);

    // Seed 40 messages
    const seedRes = await apiPost(`/bot/${BOT_ID}/seed-chat`, {
      user_id: USER_ID,
      count: 40,
    });
    expect(seedRes.status).toBe(200);

    // Verify message count before compression
    const beforeRes = await apiGet(
      `/bot/${BOT_ID}/compress?user_id=${USER_ID}`,
    );
    const beforeData = (await beforeRes.json()) as { message_count: number };
    expect(beforeData.message_count).toBe(40);

    // Trigger compression
    const compressRes = await apiPost(`/bot/${BOT_ID}/compress`, {
      user_id: USER_ID,
    });
    expect(compressRes.status).toBe(200);
    const compressData = (await compressRes.json()) as {
      ok: boolean;
      original_count: number;
      snapshot_index: number;
    };
    expect(compressData.ok).toBe(true);
    expect(compressData.original_count).toBe(10);
    expect(compressData.snapshot_index).toBe(0);

    // After compression: keep_first(10) + keep_recent(20) = 30 remaining
    const afterRes = await apiGet(
      `/bot/${BOT_ID}/compress?user_id=${USER_ID}`,
    );
    const afterData = (await afterRes.json()) as {
      summaries: Array<{ snapshot_index: number }>;
      message_count: number;
    };
    expect(afterData.summaries.length).toBe(1);
    expect(afterData.message_count).toBe(30);
  });

  // ── Multiple compressions ─────────────────────────────────────────────

  it("multiple compressions produce incrementing snapshot_index", async () => {
    const uid = USER_ID + "-multi";

    await apiPost(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "多次压缩",
    });

    // First batch
    await apiPost(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    const r1 = await apiPost(`/bot/${BOT_ID}/compress`, { user_id: uid });
    const d1 = (await r1.json()) as { ok: boolean; snapshot_index: number };
    expect(d1.ok).toBe(true);
    expect(d1.snapshot_index).toBe(0);

    // Second batch
    await apiPost(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    const r2 = await apiPost(`/bot/${BOT_ID}/compress`, { user_id: uid });
    const d2 = (await r2.json()) as { ok: boolean; snapshot_index: number };
    expect(d2.ok).toBe(true);
    expect(d2.snapshot_index).toBe(1);

    // Verify two summaries
    const statusRes = await apiGet(
      `/bot/${BOT_ID}/compress?user_id=${uid}`,
    );
    const statusData = (await statusRes.json()) as {
      summaries: Array<{ snapshot_index: number }>;
    };
    expect(statusData.summaries.length).toBe(2);
  });

  // ── Empty conversation ────────────────────────────────────────────────

  it("compress returns 0 for empty conversation", async () => {
    const uid = USER_ID + "-empty";
    const res = await apiPost(`/bot/${BOT_ID}/compress`, {
      user_id: uid,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; original_count: number };
    expect(data.ok).toBe(true);
    expect(data.original_count).toBe(0);
  });
});