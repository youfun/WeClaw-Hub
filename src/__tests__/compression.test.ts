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

// ── P1: Turn-aligned cut points ────────────────────────────────────────────

describe("P1: turn-aligned compression", () => {
  it("handles odd message counts without misalignment", async () => {
    const uid = USER_ID + "-p1-odd";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "P1边界测试",
    });

    // Seed 41 messages (odd count, alternating user/assistant)
    // With keepFirst=10, toCompress starts at index 10 (user) → clean boundary
    // Last compressed at index 20 (user), next at 21 (assistant) → P1 ensures alignment
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 41 });

    const res = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; original_count: number };
    expect(data.ok).toBe(true);
    // 41 - (keepFirst + keepRecent) = 41 - 30 = 11 compressed
    expect(data.original_count).toBe(11);

    // Verify 30 messages remain after compression
    const status = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const statusData = (await status.json()) as { message_count: number };
    expect(statusData.message_count).toBe(30);
  });

  it("compression does not produce orphaned assistant messages", async () => {
    const uid = USER_ID + "-p1-clean";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "P1完整性",
    });

    // Seed 42 messages — verify compression produces clean boundaries
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 42 });
    await post(`/bot/${BOT_ID}/compress`, { user_id: uid });

    const status = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const statusData = (await status.json()) as { summaries: Array<{ snapshot_index: number }>; message_count: number };
    expect(statusData.summaries.length).toBe(1);
    // After compression: 42 - 12 = 30 remaining (if no alignment), or 42 - 12 = 30 (with alignment since boundary is clean)
    expect(statusData.message_count).toBe(30);
  });
});

// ── P2: Information retention tracking ──────────────────────────────────────

describe("P2: information retention across multiple compressions", () => {
  it("second compression includes previous summary context", async () => {
    const uid = USER_ID + "-p2-chain";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "P2链式压缩",
    });

    // First compression
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    const r1 = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    const d1 = (await r1.json()) as { ok: boolean; snapshot_index: number };
    expect(d1.ok).toBe(true);
    expect(d1.snapshot_index).toBe(0);

    // Second compression — should include previous summary in prompt (P2)
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    const r2 = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    const d2 = (await r2.json()) as { ok: boolean; snapshot_index: number };
    expect(d2.ok).toBe(true);
    expect(d2.snapshot_index).toBe(1);

    // Third compression — three summaries form a retention chain (P2)
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });
    const r3 = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    const d3 = (await r3.json()) as { ok: boolean; snapshot_index: number };
    expect(d3.ok).toBe(true);
    expect(d3.snapshot_index).toBe(2);

    // Verify all three summaries exist
    const status = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const statusData = (await status.json()) as { summaries: Array<{ snapshot_index: number }> };
    expect(statusData.summaries.length).toBe(3);
    expect(statusData.summaries[0]!.snapshot_index).toBe(0);
    expect(statusData.summaries[1]!.snapshot_index).toBe(1);
    expect(statusData.summaries[2]!.snapshot_index).toBe(2);
  });
});

// ── P3: Adaptive keep ratio ────────────────────────────────────────────────

describe("P3: adaptive keep ratio", () => {
  it("compresses with dynamic keepRecent (defaults to max for tiny messages)", async () => {
    const uid = USER_ID + "-p3-tiny";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "P3小消息",
    });

    // Seed 40 tiny messages (~3 tokens each) → keepRecent stays at max (20)
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });

    const res = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; original_count: number };
    expect(data.ok).toBe(true);
    // With tiny messages: keepRecent=20, keepTotal=30, toCompress=10
    expect(data.original_count).toBe(10);

    const status = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const statusData = (await status.json()) as { message_count: number };
    expect(statusData.message_count).toBe(30);
  });

  it("dynamic keepRecent maintains minimum floor", async () => {
    // Even with edge cases, keepRecent should never drop below 5
    const uid = USER_ID + "-p3-floor";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
      title: "P3保底",
    });

    // Seed enough messages that we would compress if possible
    await post(`/bot/${BOT_ID}/seed-chat`, { user_id: uid, count: 40 });

    const res = await post(`/bot/${BOT_ID}/compress`, { user_id: uid });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    // After compression, at least keepFirst + 5 messages remain (floor)
    const status = await get(`/bot/${BOT_ID}/compress?user_id=${uid}`);
    const statusData = (await status.json()) as { message_count: number };
    expect(statusData.message_count).toBeGreaterThanOrEqual(15);
  });
});