import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Credentials, WeixinMessage } from "../types.ts";

const mockCallClaude = vi.fn();
const mockDownloadImage = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("../agent.ts", async () => {
  const actual = await vi.importActual<typeof import("../agent.ts")>("../agent.ts");
  return {
    ...actual,
    callClaude: mockCallClaude,
  };
});

vi.mock("../cdn.ts", () => ({
  downloadImage: mockDownloadImage,
  inferImageMediaType: vi.fn(() => "image/jpeg"),
}));

vi.mock("../ilink.ts", async () => {
  const actual = await vi.importActual<typeof import("../ilink.ts")>("../ilink.ts");
  return {
    ...actual,
    sendMessage: mockSendMessage,
  };
});

function createBotSession() {
  const sql = {
    exec: vi.fn((query: string, ...params: unknown[]) => {
      if (query.includes("SELECT role, content FROM chat_history")) {
        return {
          toArray: () => [],
        };
      }

      return {
        toArray: () => [],
      };
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

describe("BotSession image flow", () => {
  beforeEach(() => {
    mockCallClaude.mockReset().mockResolvedValue("vision reply");
    mockDownloadImage.mockReset();
    mockSendMessage.mockReset().mockResolvedValue({ ret: 0 });
  });

  it("does not drop image-only messages in handleMessage", async () => {
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
      item_list: [{
        type: 2,
        image_item: {
          aeskey: "000102030405060708090a0b0c0d0e0f",
          media: { encrypt_query_param: "enc", aes_key: "AAECAwQFBgcICQoLDA0ODw==" },
        },
      }],
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
    mockDownloadImage.mockResolvedValue(Uint8Array.from([255, 216, 255]));

    await session.handleWithAgent(creds, "user-1", "帮我看图", "ctx-1", {
      aeskey: "000102030405060708090a0b0c0d0e0f",
      media: { encrypt_query_param: "enc", aes_key: "AAECAwQFBgcICQoLDA0ODw==" },
    });

    expect(mockCallClaude).toHaveBeenCalledWith(
      [
        { role: "assistant", content: "历史" },
        {
          role: "user",
          content: "帮我看图",
          image: {
            data: Uint8Array.from([255, 216, 255]),
            mediaType: "image/jpeg",
          },
        },
      ],
      "sys",
      { apiKey: "key" },
    );
  });

  it("falls back to a text placeholder when CDN download fails", async () => {
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
    mockDownloadImage.mockResolvedValue(null);

    await session.handleWithAgent(creds, "user-1", "", "ctx-1", {
      aeskey: "000102030405060708090a0b0c0d0e0f",
      media: { encrypt_query_param: "enc", aes_key: "AAECAwQFBgcICQoLDA0ODw==" },
    });

    expect(mockCallClaude).toHaveBeenCalledWith(
      [
        {
          role: "user",
          content: "[图片（无法获取，请发文字描述）]",
          image: undefined,
        },
      ],
      "sys",
      { apiKey: "key" },
    );
  });
});