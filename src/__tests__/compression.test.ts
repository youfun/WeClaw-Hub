/**
 * Compression integration tests — Phase 3: 对话压缩
 *
 * Tests the compression endpoints through DO proxied by the worker.
 * Uses /seed-chat to populate chat history for testing compression thresholds.
 */

import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

const AUTH = "Bearer test-token";
const BOT_ID = "compress-test-bot";
const USER_ID = "compress-user-001";

async function get(path: string) {
  return SELF.fetch(`http://localhost${path}`, {
    headers: { Authorization: AUTH },
  });
}

async function post(path: string, body: unknown) {
  return SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify(body),
  });
}

// ── Compress on empty conversation ─────────────────────────────────────────

describe("POST /bot/:id/compress", () => {
  it("returns ok with 0 count for empty conversation", async () => {
    const uid = USER_ID + "-empty";
    const res = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; original_count: number };
    expect(data.ok).toBe(true);
    expect(data.original_count).toBe(0);
  });
});

// ── Compress status ────────────────────────────────────────────────────────

describe("GET /bot/:id/compress", () => {
  it("returns empty summaries for empty conversation", async () => {
    const uid = USER_ID + "-status-empty";
    const res = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { summaries: unknown[]; message_count: number };
    expect(Array.isArray(data.summaries)).toBe(true);
    expect(data.summaries).toHaveLength(0);
    expect(data.message_count).toBe(0);
  });
});

// ── Seed + compress ────────────────────────────────────────────────────────

describe("compression with seeded chat history", () => {
  it("compresses middle messages, keeps first 10 + last 20", async () => {
    const uid = USER_ID + "-compress";
    // First, create a conversation
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "压缩测试",
    });

    // Seed 40 messages (keep_first=10 + keep_recent=20 → middle 10 to compress)
    await post(`/bot/${BOT_ID}/seed-chat`, {
      user_id: uid,
      count: 40,
    });

    // Verify message count before compression
    const before = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const beforeData = (await before.json()) as { message_count: number };
    expect(beforeData.message_count).toBe(40);

    // Trigger compression
    const res = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; snapshot_index: number; original_count: number };
    expect(data.ok).toBe(true);
    expect(data.original_count).toBe(10);
    expect(data.snapshot_index).toBe(0);

    // Verify summary was created
    const after = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const afterData = (await after.json()) as { summaries: Array<{ snapshot_index: number; original_count: number }>; message_count: number };
    expect(afterData.summaries.length).toBe(1);
    expect(afterData.summaries[0]!.snapshot_index).toBe(0);
    // After compression: keep_first(10) + keep_recent(20) = 30 remaining
    expect(afterData.message_count).toBe(30);
  });

  it("manual compress returns 0 when count <= keep_total", async () => {
    const uid = USER_ID + "-manual";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "手动压缩",
    });

    // Seed only 10 messages (keep_first=10 + keep_recent=20 = 30, nothing to compress)
    await post(`/bot/${BOT_ID}/seed-chat`, {
      user_id: uid,
      count: 10,
    });

    // Manual compress should return 0
    const res = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; original_count: number };
    expect(data.ok).toBe(true);
    expect(data.original_count).toBe(0);
  });

  it("multiple compressions produce incrementing snapshot_index", async () => {
    const uid = USER_ID + "-multi";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "多次压缩",
    });

    // First batch: seed 40, compress middle (40-30=10) → 30 remain
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    await post(`/bot/${BOT_ID}/compress`, { user_id: uid });

    // Second batch: seed 40 more → total 70, compress middle (70-30=40) → 30 remain
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    const res = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; snapshot_index: number };
    expect(data.ok).toBe(true);
    expect(data.snapshot_index).toBe(1);

    // Verify two summaries exist
    const status = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const statusData = (await status.json()) as { summaries: Array<{ snapshot_index: number }> };
    expect(statusData.summaries.length).toBe(2);
    expect(statusData.summaries[0]!.snapshot_index).toBe(0);
    expect(statusData.summaries[1]!.snapshot_index).toBe(1);
  });

  it("seed-chat rejects count exceeding limit", async () => {
    const uid = USER_ID + "-seed-limit";
    const res = await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 1000 });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("count");
  });

  it("seed-chat accepts count within limit", async () => {
    const uid = USER_ID + "-seed-ok";
    const res = await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    expect(res.status).toBe(200);
  });
});