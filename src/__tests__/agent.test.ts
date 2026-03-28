import { afterEach, describe, expect, it, vi } from "vitest";
import { callClaude, isDifficultQuery } from "../agent.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isDifficultQuery", () => {
  it("returns true for long messages", () => {
    expect(isDifficultQuery("a".repeat(301))).toBe(true);
  });

  it("returns true when query contains complex keywords", () => {
    expect(isDifficultQuery("请帮我分析这段代码的架构问题")).toBe(true);
  });

  it("returns true for multiple questions", () => {
    expect(isDifficultQuery("为什么会这样？应该怎么办？")).toBe(true);
  });

  it("returns false for simple smalltalk", () => {
    expect(isDifficultQuery("早上好，今天怎么样")).toBe(false);
  });
});

describe("callClaude vision payloads", () => {
  it("sends Anthropic image blocks before text when image data is present", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await callClaude([
      {
        role: "user",
        content: "请描述这张图片",
        image: { data: Uint8Array.from([1, 2, 3]), mediaType: "image/jpeg" },
      },
    ], "sys", { apiKey: "test-key" });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { messages: Array<{ content: unknown }> };
    expect(Array.isArray(body.messages[0]?.content)).toBe(true);
    expect(body.messages[0]?.content).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "AQID",
        },
      },
      {
        type: "text",
        text: "请描述这张图片",
      },
    ]);
  });

  it("sends Anthropic image-only content without a text block", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await callClaude([
      {
        role: "user",
        content: "",
        image: { data: Uint8Array.from([255, 216, 255]), mediaType: "image/jpeg" },
      },
    ], "sys", { apiKey: "test-key" });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { messages: Array<{ content: unknown }> };
    expect(body.messages[0]?.content).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "/9j/",
        },
      },
    ]);
  });

  it("sends OpenAI-compatible image_url blocks with data URLs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await callClaude([
      {
        role: "user",
        content: "看一下",
        image: { data: Uint8Array.from([1, 2, 3]), mediaType: "image/jpeg" },
      },
    ], "sys", {
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { messages: Array<{ role: string; content: unknown }> };
    expect(body.messages[1]?.content).toEqual([
      {
        type: "image_url",
        image_url: {
          url: "data:image/jpeg;base64,AQID",
        },
      },
      {
        type: "text",
        text: "看一下",
      },
    ]);
  });
});