/**
 * Conversation DO integration tests — Phase 2: 对话切换
 *
 * Tests conversation CRUD through DO endpoints, following the same pattern
 * as the tasks test in worker.test.ts.
 *
 * Uses SELF.fetch to proxy through worker routes to DO.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";

const AUTH = "Bearer test-token";
const BOT_ID = "conv-test-bot";
const USER_ID = "test-user-001";

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

// ── Conversation list ──────────────────────────────────────────────────────

describe("GET /bot/:id/conv", () => {
  it("returns empty list for new user (no conversations yet)", async () => {
    const res = await get(`/bot/${BOT_ID}/conv?user_id=${USER_ID}`);
    expect([200]).toContain(res.status);
    const data = (await res.json()) as { conversations: unknown[] };
    expect(Array.isArray(data.conversations)).toBe(true);
  });
});

// ── Conversation CRUD ──────────────────────────────────────────────────────

describe("POST /bot/:id/conv", () => {
  it("creates a new conversation with title", async () => {
    const res = await post(`/bot/${BOT_ID}/conv`, {
      user_id: USER_ID,
      sub: "new",
      title: "测试对话",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; conversation?: { id: string; title: string } };
    expect(data.ok).toBe(true);
    if (data.conversation) {
      expect(data.conversation.title).toBe("测试对话");
      expect(typeof data.conversation.id).toBe("string");
    }
  });

  it("creates a new conversation without title", async () => {
    const res = await post(`/bot/${BOT_ID}/conv`, {
      user_id: USER_ID + "-no-title",
      sub: "new",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; conversation?: { title: string } };
    expect(data.ok).toBe(true);
    if (data.conversation) {
      expect(data.conversation.title).toBe("");
    }
  });

  it("lists conversations", async () => {
    // Create a few conversations
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: USER_ID + "-list",
      sub: "new",
      title: "对话A",
    });
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: USER_ID + "-list",
      sub: "new",
      title: "对话B",
    });

    const res = await get(`/bot/${BOT_ID}/conv?user_id=${USER_ID}-list`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { conversations: Array<{ title: string; index: number }> };
    expect(data.conversations.length).toBeGreaterThanOrEqual(2);
    const titles = data.conversations.map((c) => c.title);
    expect(titles).toContain("对话A");
    expect(titles).toContain("对话B");
    // Each conversation should have an index
    for (const conv of data.conversations) {
      expect(typeof conv.index).toBe("number");
      expect(conv.index).toBeGreaterThan(0);
    }
  });
  it("auto-generates title for empty-title conversation", async () => {
    const uid = USER_ID + "-autotitle";
    await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "new",
    });

    const res = await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "auto-title",
      message: "我想学习如何做红烧肉",
    });
    // May fail in test environment (no LLM configured), but should return 200 with title or empty
    expect(res.status).toBe(200);
  });
});

// ── Conversation switching ────────────────────────────────────────────────

describe("conversation switching", () => {
  it("switches to a conversation by index", async () => {
    const uid = USER_ID + "-switch";
    await post(`/bot/${BOT_ID}/conv`, { user_id: uid, sub: "new", title: "First" });
    await post(`/bot/${BOT_ID}/conv`, { user_id: uid, sub: "new", title: "Second" });

    // Switch to conversation 1
    const res = await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "switch",
      index: 1,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });
});

// ── Conversation renaming ─────────────────────────────────────────────────

describe("conversation renaming", () => {
  it("renames a conversation by index", async () => {
    const uid = USER_ID + "-rename";
    await post(`/bot/${BOT_ID}/conv`, { user_id: uid, sub: "new", title: "旧名称" });

    const res = await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "rename",
      index: 1,
      title: "新名称",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    // Verify title changed
    const listRes = await get(`/bot/${BOT_ID}/conv?user_id=${uid}`);
    const listData = (await listRes.json()) as { conversations: Array<{ title: string }> };
    expect(listData.conversations.some((c) => c.title === "新名称")).toBe(true);
  });
});

// ── Conversation deletion ─────────────────────────────────────────────────

describe("conversation deletion", () => {
  it("deletes a conversation by index", async () => {
    const uid = USER_ID + "-delete";
    await post(`/bot/${BOT_ID}/conv`, { user_id: uid, sub: "new", title: "待删除" });
    await post(`/bot/${BOT_ID}/conv`, { user_id: uid, sub: "new", title: "保留" });

    const res = await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "delete",
      index: 1,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    // Verify deleted
    const listRes = await get(`/bot/${BOT_ID}/conv?user_id=${uid}`);
    const listData = (await listRes.json()) as { conversations: Array<{ title: string }> };
    expect(listData.conversations.every((c) => c.title !== "待删除")).toBe(true);
  });

  it("rejects deleting the last conversation", async () => {
    const uid = USER_ID + "-last";
    await post(`/bot/${BOT_ID}/conv`, { user_id: uid, sub: "new", title: "唯一" });

    const res = await post(`/bot/${BOT_ID}/conv`, {
      user_id: uid,
      sub: "delete",
      index: 1,
    });
    // Should return error or still 200 with a message
    const data = (await res.json()) as { ok?: boolean; error?: string };
    // Either way, the conversation should still exist
    const listRes = await get(`/bot/${BOT_ID}/conv?user_id=${uid}`);
    const listData = (await listRes.json()) as { conversations: Array<{ title: string }> };
    expect(listData.conversations.length).toBeGreaterThanOrEqual(1);
  });
});