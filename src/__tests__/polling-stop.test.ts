/**
 * TDD tests for BotSession stop/start polling persistence.
 *
 * RED → GREEN cycle:
 *   1. Stop should persist across alarm invocations (no re-arm)
 *   2. Start should resume polling
 *   3. Status should report correct polling state
 *
 * Run with: npx vitest run src/__tests__/polling-stop.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env, SELF } from "cloudflare:test";

const AUTH = "Bearer test-token";

describe("Bot polling stop/start persistence", () => {
  const BOT_ID = "stop-test-bot-" + Date.now();
  const USER_ID = "stop-test-user";

  afterEach(async () => {
    // Unbind the test bot so it can be reused
    try {
      await fetch(`http://localhost/bot/${BOT_ID}/unbind`, {
        method: "POST",
        headers: { Authorization: AUTH },
      });
    } catch { /* ignore */ }
  });

  // ── RED: stop should clear alarm and persist ──────────────────────────

  it("RED: /stop sets polling to false and /status reports stopped", async () => {
    // Seed credentials to simulate a logged-in bot
    const loginRes = await fetch(`http://localhost/bot/${BOT_ID}/login`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        ilink_bot_id: BOT_ID,
        ilink_user_id: "test-user-001",
        token: "fake-token",
        baseurl: "https://ilinkai.weixin.qq.com",
        aeskey: "0123456789abcdef0123456789abcdef",
      }),
    });
    expect(loginRes.status).toBe(200);

    // After login, polling should be active
    const status1 = await fetch(
      `http://localhost/bot/${BOT_ID}/status`,
      { headers: { Authorization: AUTH } },
    );
    const s1 = await status1.json() as { polling: boolean };
    // Alarm should be set after login (100ms future)
    expect(s1.polling).toBe(true);

    // Stop the bot
    const stopRes = await fetch(`http://localhost/bot/${BOT_ID}/stop`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    expect(stopRes.status).toBe(200);

    // After stop, polling should be false
    const status2 = await fetch(
      `http://localhost/bot/${BOT_ID}/status`,
      { headers: { Authorization: AUTH } },
    );
    const s2 = await status2.json() as { polling: boolean };
    expect(s2.polling).toBe(false);
  });

  // ── RED: start should resume polling ──────────────────────────────────

  it("RED: /start after /stop resumes polling", async () => {
    // Login
    await fetch(`http://localhost/bot/${BOT_ID}/login`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        ilink_bot_id: BOT_ID,
        ilink_user_id: "test-user-002",
        token: "fake-token",
        baseurl: "https://ilinkai.weixin.qq.com",
        aeskey: "0123456789abcdef0123456789abcdef",
      }),
    });

    // Stop
    await fetch(`http://localhost/bot/${BOT_ID}/stop`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });

    // Verify stopped
    const status1 = await fetch(
      `http://localhost/bot/${BOT_ID}/status`,
      { headers: { Authorization: AUTH } },
    );
    const s1 = await status1.json() as { polling: boolean };
    expect(s1.polling).toBe(false);

    // Start
    const startRes = await fetch(`http://localhost/bot/${BOT_ID}/start`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    expect(startRes.status).toBe(200);

    // Verify restarted
    const status2 = await fetch(
      `http://localhost/bot/${BOT_ID}/status`,
      { headers: { Authorization: AUTH } },
    );
    const s2 = await status2.json() as { polling: boolean };
    expect(s2.polling).toBe(true);
  });

  // ── RED: stop persists across multiple status calls ────────────────────

  it("RED: polling stays stopped across multiple /status calls (no alarm re-arm)", async () => {
    // Login
    await fetch(`http://localhost/bot/${BOT_ID}/login`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        ilink_bot_id: BOT_ID,
        ilink_user_id: "test-user-003",
        token: "fake-token",
        baseurl: "https://ilinkai.weixin.qq.com",
        aeskey: "0123456789abcdef0123456789abcdef",
      }),
    });

    // Stop
    await fetch(`http://localhost/bot/${BOT_ID}/stop`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });

    // Poll status multiple times — should stay stopped
    for (let i = 0; i < 3; i++) {
      const status = await fetch(
        `http://localhost/bot/${BOT_ID}/status`,
        { headers: { Authorization: AUTH } },
      );
      const s = await status.json() as { polling: boolean };
      expect(s.polling, `status call ${i + 1}: polling should be false`).toBe(false);
    }
  });
});