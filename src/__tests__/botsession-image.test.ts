import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCipheriv } from "node:crypto";
import type { Credentials, WeixinMessage } from "../types.ts";

/** Pre-encrypt bytes with AES-128-ECB so downloadImage can decrypt them back. */
function encryptForCdn(bytes: Uint8Array, hexKey: string): Uint8Array {
  const key = Buffer.from(hexKey, "hex");
  const cipher = createCipheriv("aes-128-ecb", key, Buffer.alloc(0));
  cipher.setAutoPadding(true);
  return new Uint8Array(Buffer.concat([cipher.update(Buffer.from(bytes)), cipher.final()]));
}

function mockFetchForBotSession(
  imageBytes?: Uint8Array | null,
  hexKey?: string,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body ? (typeof init.body === "string" ? init.body : "") : "";

    // CDN image download — return encrypted bytes that decrypt to imageBytes
    if (url.includes("novac2c.cdn.weixin.qq.com")) {
      if (imageBytes == null || !hexKey) {
        return new Response(null, { status: 500 });
      }
      const encrypted = encryptForCdn(imageBytes, hexKey);
      return new Response(encrypted, { status: 200 });
    }

    // iLink API calls (sendMessage, etc.)
    if (url.includes("ilink") || url.includes("example.com")) {
      return new Response(JSON.stringify({ ret: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Anthropic API
    if (url.includes("anthropic")) {
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "vision reply" }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // OpenAI-compatible API
    if (body.includes("chat/completions") || url.includes("chat/completions")) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: "vision reply" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("{}", { status: 200 });
  });
}

function createBotSession() {
  const sql = {
    exec: vi.fn((query: string, ...params: unknown[]) => {
      if (query.includes("SELECT role, content FROM chat_history")) {
        return { toArray: () => [] };
      }
      return { toArray: () => [] };
    }),
  };

  const state = {
    storage: {
      sql,
      setAlarm: vi.fn(),
      transactionSync: vi.fn((fn: () => void) => fn()),
    },
    waitUntil: vi.fn(),
  } as unknown as DurableObjectState;

  const env = {
    BACKENDS: {
      list: vi.fn().mockResolvedValue({ keys: [] }),
      get: vi.fn(),
    },
    SYSTEM_PROMPT: "sys",
  } as unknown as import("../env.ts").Env;

  return { state, env, sql };
}

const creds: Credentials = {
  bot_token: "bot-token",
  ilink_bot_id: "bot-1",
  baseurl: "https://example.com",
  ilink_user_id: "owner-1",
};

const TEST_IMAGE_ITEM = {
  aeskey: "000102030405060708090a0b0c0d0e0f",
  media: { encrypt_query_param: "enc", aes_key: "AAECAwQFBgcICQoLDA0ODw==" },
};

describe("BotSession image flow", () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchMock?.mockRestore();
  });

  it("sends bot-origin messages with an empty from_user_id", async () => {
    fetchMock = mockFetchForBotSession();
    const { state, env } = createBotSession();
    const { BotSession } = await import("../BotSession.ts");
    const session = new BotSession(state, env) as any;

    await session.sendTextToUser(creds, "user-1", "ctx-1", "hello");

    const sendCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = typeof call[0] === "string" ? call[0] : call[0] instanceof Request ? call[0].url : "";
      return url.includes("/ilink/bot/sendmessage");
    });
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1]!.body as string) as { msg: { from_user_id: string } };
    expect(body.msg.from_user_id).toBe("");
  });

  it("notifies iLink before starting polling on login", async () => {
    fetchMock = mockFetchForBotSession();
    const { state, env } = createBotSession();
    const { BotSession } = await import("../BotSession.ts");
    const session = new BotSession(state, env) as any;
    session.updateBotsIndex = vi.fn().mockResolvedValue(undefined);

    const response = await session.handleLogin(new Request("http://do/login", {
      method: "POST",
      body: JSON.stringify(creds),
    }));

    expect(response.status).toBe(200);
    const notifyCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = typeof call[0] === "string" ? call[0] : call[0] instanceof Request ? call[0].url : "";
      return url.includes("/ilink/bot/msg/notifystart");
    });
    expect(notifyCall).toBeDefined();
    expect(state.storage.setAlarm).toHaveBeenCalled();
  });

  it("does not drop image-only messages in handleMessage", async () => {
    fetchMock = mockFetchForBotSession();
    const { state, env } = createBotSession();
    const { BotSession } = await import("../BotSession.ts");
    const session = new BotSession(state, env) as any;
    session.saveContextToken = vi.fn();
    session.routeToBackends = vi.fn().mockResolvedValue(false);
    session.handleWithAgent = vi.fn().mockResolvedValue(undefined);

    const msg: WeixinMessage = {
      from_user_id: "user-1",
      to_user_id: "bot-1",
      message_type: 1,
      message_state: 2,
      context_token: "ctx-1",
      item_list: [{ type: 2, image_item: TEST_IMAGE_ITEM }],
    };

    await session.handleMessage(creds, msg);

    expect(session.handleWithAgent).toHaveBeenCalledWith(
      creds,
      "user-1",
      "",
      "ctx-1",
      msg.item_list[0]?.image_item,
    );
  });

  it("passes both text and image data to the LLM", async () => {
    const imageBytes = Uint8Array.from([255, 216, 255]);
    fetchMock = mockFetchForBotSession(imageBytes, TEST_IMAGE_ITEM.aeskey);

    const { state, env } = createBotSession();
    const { BotSession } = await import("../BotSession.ts");
    const session = new BotSession(state, env) as any;
    session.sendTypingTo = vi.fn().mockResolvedValue(undefined);
    session.addChatHistory = vi.fn();
    session.getChatHistory = vi.fn().mockReturnValue([{ role: "assistant", content: "历史" }]);
    session.getActiveLLMConfig = vi.fn().mockResolvedValue({
      config: { apiKey: "key" },
      displayName: "Vision",
      mode: "manual",
    });
    session.buildMemoryContext = vi.fn().mockResolvedValue("");
    session.extractMemories = vi.fn().mockResolvedValue(undefined);

    await session.handleWithAgent(creds, "user-1", "帮我看图", "ctx-1", TEST_IMAGE_ITEM);

    // Verify fetch was called with the right Anthropic request containing image
    const apiCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = typeof call[0] === "string" ? call[0] : "";
      return url.includes("anthropic");
    });
    expect(apiCall).toBeDefined();
    const body = JSON.parse(apiCall![1]!.body as string) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const lastMessage = body.messages[body.messages.length - 1]!;
    expect(Array.isArray(lastMessage.content)).toBe(true);
    const contents = lastMessage.content as Array<Record<string, unknown>>;
    expect(contents[0]?.type).toBe("image");
    expect(contents[1]?.type).toBe("text");
    expect(contents[1]?.text).toBe("帮我看图");
  });

  it("falls back to a text placeholder when CDN download fails", async () => {
    // Pass null imageBytes to simulate CDN failure
    fetchMock = mockFetchForBotSession(null);

    const { state, env } = createBotSession();
    const { BotSession } = await import("../BotSession.ts");
    const session = new BotSession(state, env) as any;
    session.sendTypingTo = vi.fn().mockResolvedValue(undefined);
    session.addChatHistory = vi.fn();
    session.getChatHistory = vi.fn().mockReturnValue([]);
    session.getActiveLLMConfig = vi.fn().mockResolvedValue({
      config: { apiKey: "key" },
      displayName: "Vision",
      mode: "manual",
    });
    session.buildMemoryContext = vi.fn().mockResolvedValue("");
    session.extractMemories = vi.fn().mockResolvedValue(undefined);

    await session.handleWithAgent(creds, "user-1", "", "ctx-1", TEST_IMAGE_ITEM);

    // Verify fetch was called with Anthropic API and the placeholder text
    const apiCall = fetchMock.mock.calls.find((call: unknown[]) => {
      const url = typeof call[0] === "string" ? call[0] : "";
      return url.includes("anthropic");
    });
    expect(apiCall).toBeDefined();
    const body = JSON.parse(apiCall![1]!.body as string) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const lastMessage = body.messages[body.messages.length - 1]!;
    // When download fails and no text, should be plain text with placeholder
    expect(lastMessage.content).toBe("[图片（无法获取，请发文字描述）]");
  });
});
