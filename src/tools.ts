import type { SystemTool } from "./types.ts";

export const BUILTIN_TOOLS: SystemTool[] = [
  {
    id: "send_message",
    name: "发送消息",
    description: "发送固定文本消息",
    source: "builtin",
    params: [
      {
        name: "text",
        type: "text",
        required: true,
        label: "消息内容",
        placeholder: "该写日记啦 📝",
      },
    ],
  },
  {
    id: "agent_prompt",
    name: "AI 生成",
    description: "让 AI 根据提示词生成消息后发送",
    source: "builtin",
    params: [
      {
        name: "prompt",
        type: "text",
        required: true,
        label: "提示词",
        placeholder: "用温馨的语气提醒用户今天要多喝水",
      },
    ],
  },
  {
    id: "fetch_analyze",
    name: "抓取并分析",
    description: "抓取 URL 内容，用 AI 分析后发送结果",
    source: "builtin",
    params: [
      {
        name: "url",
        type: "string",
        required: true,
        label: "目标 URL",
        placeholder: "https://news.example.com/feed",
      },
      {
        name: "prompt",
        type: "text",
        required: true,
        label: "分析指令",
        placeholder: "总结最重要的3条新闻",
      },
      {
        name: "headers",
        type: "text",
        required: false,
        label: "请求头 (JSON)",
        placeholder: '{"Authorization": "Bearer ..."}',
      },
    ],
  },
];

export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}