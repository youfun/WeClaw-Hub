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

import { afterEach, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

const AUTH = "Bearer test-token";

/** Poll bot status until polling matches expected value, or timeout. */
async function expectPolling(botId: string, expected: boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastPolling: boolean | null = null;
  while (Date.now() < deadline) {
    const res = await SELF.fetch(
      `http://localhost/bot/${botId}/status`,
      { headers: { Authorization: AUTH } },
    );
    const s = await res.json() as { polling: boolean };
    lastPolling = s.polling;
    if (s.polling === expected) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `expected polling=${expected} within ${timeoutMs}ms, last was ${lastPolling}`,
  );
}

describe("Bot polling stop/start persistence", () => {
  const BOT_ID = "stop-test-bot-" + Date.now();

  afterEach(async () => {
    try {
      await SELF.fetch(`http://localhost/bot/${BOT_ID}/unbind`, {
        method: "POST",
        headers: { Authorization: AUTH },
      });
    } catch { /* ignore */ }
  });

  it("RED: /stop sets polling to false and /status reports stopped", async () => {
    const loginRes = await SELF.fetch(`http://localhost/bot/${BOT_ID}/login`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        ilink_bot_id: BOT_ID,
        ilink_user_id: "test-user-001",
        bot_token: "fake-token",
        baseurl: "https://ilinkai.weixin.qq.com",
        aeskey: "0123456789abcdef0123456789abcdef",
      }),
    });
    expect(loginRes.status).toBe(200);

    // Poll status until polling is true (login handler sets alarm after notifyStart,
    // which may take up to 10s to timeout against a remote server in CI).
    await expectPolling(BOT_ID, true, 15_000);

    const stopRes = await SELF.fetch(`http://localhost/bot/${BOT_ID}/stop`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    expect(stopRes.status).toBe(200);

    const status2 = await SELF.fetch(
      `http://localhost/bot/${BOT_ID}/status`,
      { headers: { Authorization: AUTH } },
    );
    const s2 = await status2.json() as { polling: boolean };
    expect(s2.polling).toBe(false);
  }, 30000);

  it("RED: /start after /stop resumes polling", async () => {
    await SELF.fetch(`http://localhost/bot/${BOT_ID}/login`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        ilink_bot_id: BOT_ID,
        ilink_user_id: "test-user-002",
        bot_token: "fake-token",
        baseurl: "https://ilinkai.weixin.qq.com",
        aeskey: "0123456789abcdef0123456789abcdef",
      }),
    });

    await SELF.fetch(`http://localhost/bot/${BOT_ID}/stop`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });

    const status1 = await SELF.fetch(
      `http://localhost/bot/${BOT_ID}/status`,
      { headers: { Authorization: AUTH } },
    );
    const s1 = await status1.json() as { polling: boolean };
    expect(s1.polling).toBe(false);

    const startRes = await SELF.fetch(`http://localhost/bot/${BOT_ID}/start`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    expect(startRes.status).toBe(200);

    // Poll status until polling is true (start handler re-sets alarm).
    await expectPolling(BOT_ID, true, 15_000);
  }, 30000);

  it("RED: polling stays stopped across multiple /status calls (no alarm re-arm)", async () => {
    await SELF.fetch(`http://localhost/bot/${BOT_ID}/login`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        ilink_bot_id: BOT_ID,
        ilink_user_id: "test-user-003",
        bot_token: "fake-token",
        baseurl: "https://ilinkai.weixin.qq.com",
        aeskey: "0123456789abcdef0123456789abcdef",
      }),
    });

    await SELF.fetch(`http://localhost/bot/${BOT_ID}/stop`, {
      method: "POST",
      headers: { Authorization: AUTH },
    });

    for (let i = 0; i < 3; i++) {
      const status = await SELF.fetch(
        `http://localhost/bot/${BOT_ID}/status`,
        { headers: { Authorization: AUTH } },
      );
      const s = await status.json() as { polling: boolean };
      expect(s.polling, `status call ${i + 1}: polling should be false`).toBe(false);
    }
  }, 30000);
});
