// HTTP Agent — supports Anthropic Messages API and OpenAI-compatible APIs
// Reference: ref/weclaw/agent/http_agent.go

export interface ImageData {
  data: Uint8Array;
  mediaType: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  image?: ImageData;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxOutputTokens?: number;
  maxContextTokens?: number;
}

const HISTORY_LIMIT = 100; // 50 turns = 100 messages
const WECHAT_CHAR_LIMIT = 4000;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
export const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_SYSTEM = "你是一個有用的AI助手。";
const DIFFICULT_QUERY_KEYWORDS = [
  "分析", "报告", "体检", "诊断", "法律", "合同", "翻译",
  "编程", "代码", "计算", "数学", "论文", "研究", "策略",
  "规划", "设计", "架构", "优化", "比较", "评估", "总结",
  "详细", "复杂", "为什么", "怎么办", "解释一下",
  "心脏", "血压", "血糖", "彩超", "化验", "CT", "MRI",
  "保险", "理赔", "退款", "投诉",
  "药", "用药", "服药", "停药", "换药", "减药", "加药",
  "药片", "胶囊", "药水", "药膏", "处方",
  "副作用", "不良反应", "过敏", "禁忌",
  "头孢", "阿莫西林", "布洛芬", "阿司匹林", "降压药", "降糖药",
  "抗生素", "消炎药", "止痛药", "感冒药", "维生素",
  "剂量", "药物", "中药", "西药",
];

export function isDifficultQuery(text: string): boolean {
  if (text.length > 300) return true;

  for (const keyword of DIFFICULT_QUERY_KEYWORDS) {
    if (text.includes(keyword)) return true;
  }

  const qCount = (text.match(/[？?]/g) ?? []).length;
  return qCount >= 2;
}

/** Trim history to last HISTORY_LIMIT messages, always starting with a user turn. */
export function trimHistory(messages: Message[]): Message[] {
  if (messages.length <= HISTORY_LIMIT) return messages;
  const trimmed = messages.slice(messages.length - HISTORY_LIMIT);
  const start = trimmed.findIndex((m) => m.role === "user");
  const normalized = start > 0 ? trimmed.slice(start) : trimmed;
  return normalized.map((message, index) => ({
    role: message.role,
    content: message.content,
    image: index === normalized.length - 1 ? message.image : undefined,
  }));
}

/** Call LLM and return reply text. Never throws — returns error string on failure. */
export async function callClaude(
  messages: Message[],
  systemPrompt: string,
  config: LLMConfig,
): Promise<string> {
  if (!config.apiKey) {
    return "AI 无法回应：未配置 API Key";
  }

  try {
    const reply = config.baseUrl
      ? await callOpenAICompat(messages, systemPrompt, config)
      : await callAnthropic(messages, systemPrompt, config);

    if (!reply) return "AI 无法回应：接口返回空内容";
    return reply.length > WECHAT_CHAR_LIMIT
      ? reply.slice(0, WECHAT_CHAR_LIMIT - 3) + "..."
      : reply;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[agent] callClaude error:", msg);
    return `AI 无法回应：${msg}`;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function buildAnthropicContent(message: Message): string | Array<Record<string, unknown>> {
  if (!message.image) return message.content;

  const content: Array<Record<string, unknown>> = [{
    type: "image",
    source: {
      type: "base64",
      media_type: message.image.mediaType,
      data: bytesToBase64(message.image.data),
    },
  }];

  if (message.content) {
    content.push({ type: "text", text: message.content });
  }

  return content;
}

function buildOpenAIContent(message: Message): string | Array<Record<string, unknown>> {
  if (!message.image) return message.content;

  const base64 = bytesToBase64(message.image.data);
  const content: Array<Record<string, unknown>> = [{
    type: "image_url",
    image_url: {
      url: `data:${message.image.mediaType};base64,${base64}`,
    },
  }];

  if (message.content) {
    content.push({ type: "text", text: message.content });
  }

  return content;
}

async function callAnthropic(
  messages: Message[],
  systemPrompt: string,
  config: LLMConfig,
): Promise<string> {
  const apiMessages = trimHistory(messages).map((message) => ({
    role: message.role,
    content: buildAnthropicContent(message),
  }));

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: config.maxOutputTokens ?? 4096,
      system: systemPrompt || DEFAULT_SYSTEM,
      messages: apiMessages,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[agent] Anthropic error ${res.status}:`, errText.slice(0, 200));
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned empty or missing text content");
  return text;
}

async function callOpenAICompat(
  messages: Message[],
  systemPrompt: string,
  config: LLMConfig,
): Promise<string> {
  const url = config.baseUrl!.replace(/\/$/, "") + "/chat/completions";
  const oaiMessages = [
    { role: "system", content: systemPrompt || DEFAULT_SYSTEM },
    ...trimHistory(messages).map((message) => ({
      role: message.role,
      content: buildOpenAIContent(message),
    })),
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_OPENAI_MODEL,
      max_tokens: config.maxOutputTokens ?? 4096,
      messages: oaiMessages,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[agent] OpenAI-compat error ${res.status}:`, errText.slice(0, 200));
    throw new Error(`API ${res.status}: ${errText.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("API returned empty or missing content");
  return content;
}

// ---- Streaming ----

/**
 * Call LLM with streaming, yielding text chunks as they arrive.
 * Yields individual token strings. The caller is responsible for
 * batching and sending partial messages with message_state=GENERATING.
 */
export async function* callClaudeStream(
  messages: Message[],
  systemPrompt: string,
  config: LLMConfig,
): AsyncGenerator<string> {
  if (!config.apiKey) {
    yield "AI 无法回应：未配置 API Key";
    return;
  }

  const gen = config.baseUrl
    ? streamOpenAICompat(messages, systemPrompt, config)
    : streamAnthropic(messages, systemPrompt, config);

  let totalLen = 0;
  for await (const chunk of gen) {
    totalLen += chunk.length;
    if (totalLen > WECHAT_CHAR_LIMIT) break;
    yield chunk;
  }
}

async function* streamAnthropic(
  messages: Message[],
  systemPrompt: string,
  config: LLMConfig,
): AsyncGenerator<string> {
  const apiMessages = trimHistory(messages).map((message) => ({
    role: message.role,
    content: buildAnthropicContent(message),
  }));

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "messages-2023-12-15",
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: config.maxOutputTokens ?? 4096,
      system: systemPrompt || DEFAULT_SYSTEM,
      messages: apiMessages,
      stream: true,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[agent] Anthropic stream error ${res.status}:`, errText.slice(0, 200));
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 120)}`);
  }

  if (!res.body) throw new Error("Anthropic stream has no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let charCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type: string;
          delta?: { type: string; text?: string };
          content_block?: { type: string; text?: string };
        };
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
          charCount += event.delta.text.length;
          if (charCount > WECHAT_CHAR_LIMIT) return;
          yield event.delta.text;
        }
      } catch {
        // skip unparseable lines
      }
    }
  }
}

async function* streamOpenAICompat(
  messages: Message[],
  systemPrompt: string,
  config: LLMConfig,
): AsyncGenerator<string> {
  const url = config.baseUrl!.replace(/\/$/, "") + "/chat/completions";
  const oaiMessages = [
    { role: "system", content: systemPrompt || DEFAULT_SYSTEM },
    ...trimHistory(messages).map((message) => ({
      role: message.role,
      content: buildOpenAIContent(message),
    })),
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_OPENAI_MODEL,
      max_tokens: config.maxOutputTokens ?? 4096,
      messages: oaiMessages,
      stream: true,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[agent] OpenAI-compat stream error ${res.status}:`, errText.slice(0, 200));
    throw new Error(`API ${res.status}: ${errText.slice(0, 120)}`);
  }

  if (!res.body) throw new Error("OpenAI stream has no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let charCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const text = event.choices?.[0]?.delta?.content;
        if (text) {
          charCount += text.length;
          if (charCount > WECHAT_CHAR_LIMIT) return;
          yield text;
        }
      } catch {
        // skip unparseable lines
      }
    }
  }
}

// ---- Image Generation ----

export interface ImageGenResult {
  /** URL of the generated image */
  url?: string;
  /** Base64-encoded image data */
  b64Json?: string;
  /** Revised prompt (DALL-E 3 only) */
  revisedPrompt?: string;
}

/**
 * Generate an image via OpenAI-compatible Images API.
 */
export async function generateImage(
  prompt: string,
  config: LLMConfig,
): Promise<ImageGenResult> {
  if (!config.apiKey) {
    throw new Error("未配置 API Key");
  }

  const baseUrl = config.baseUrl || "https://api.openai.com";
  // Strip trailing /v1 to avoid double-prefix (e.g. baseUrl already ending in /v1)
  const url = baseUrl.replace(/\/v1\/?$/, "") + "/v1/images/generations";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[agent] generateImage error ${res.status}:`, errText.slice(0, 200));
    throw new Error(`图片生成失败 (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  };

  const result = data.data?.[0];
  if (!result || (!result.url && !result.b64_json)) {
    throw new Error("图片生成接口返回空结果");
  }

  return {
    url: result.url,
    b64Json: result.b64_json,
    revisedPrompt: result.revised_prompt,
  };
}
