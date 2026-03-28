// HTTP Agent — supports Anthropic Messages API and OpenAI-compatible APIs
// Reference: ref/weclaw/agent/http_agent.go

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxOutputTokens?: number;
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
  return start > 0 ? trimmed.slice(start) : trimmed;
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

async function callAnthropic(
  messages: Message[],
  systemPrompt: string,
  config: LLMConfig,
): Promise<string> {
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
      messages: trimHistory(messages),
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
    ...trimHistory(messages),
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
