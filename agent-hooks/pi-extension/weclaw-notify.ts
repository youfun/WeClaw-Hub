/**
 * weclaw-notify.ts — Pi Agent → WeClaw-Hub Webhook 通知扩展
 *
 * 安装位置: ~/.pi/agent/extensions/weclaw-notify.ts
 *
 * 环境变量:
 *   WECLAW_WEBHOOK_URL    — WeClaw-Hub webhook 完整 URL（必需）
 *   WECLAW_WEBHOOK_SECRET — Bearer token（可选，仅当 webhook verify 为 "bearer" 时需要）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const WEBHOOK_URL = process.env.WECLAW_WEBHOOK_URL;
  const WEBHOOK_SECRET = process.env.WECLAW_WEBHOOK_SECRET;

  // 未配置时静默跳过，不影响 pi 正常工作
  if (!WEBHOOK_URL) return;

  // ── 工具: 可被 LLM 调用，手动发送状态更新 ──────────
  // （可选启用）
  // pi.registerTool({
  //   name: "notify_weclaw",
  //   label: "Notify WeClaw",
  //   description: "Send a custom status notification to WeClaw-Hub",
  //   parameters: Type.Object({
  //     title: Type.String({ description: "通知标题" }),
  //     summary: Type.String({ description: "通知摘要" }),
  //     status: Type.Optional(Type.String({ description: "状态: completed|in_progress|aborted|error" })),
  //   }),
  //   async execute(_toolCallId, params) {
  //     await sendWebhook({
  //       source: "pi",
  //       event: "manual",
  //       title: params.title,
  //       summary: params.summary,
  //       status: (params.status as string) || "completed",
  //     });
  //     return {
  //       content: [{ type: "text", text: "通知已发送" }],
  //       details: {},
  //     };
  //   },
  // });

  // ── 事件: 任务完成 (agent_end) ─────────────────────

  pi.on("agent_end", async (event, ctx) => {
    // 获取最后一条 assistant 消息
    const messages = (event as any).messages || [];
    const lastAssistant = [...messages]
      .reverse()
      .find((m: any) => m.role === "assistant");

    // 提取文本内容作为摘要
    let summary = "任务已完成";
    if (lastAssistant?.content) {
      const textParts = lastAssistant.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text || "");
      const text = textParts.join("").trim();
      if (text) {
        summary = text.slice(0, 300);
      }
    }

    // 提取 assistant 消息的 usage 信息
    const usage = lastAssistant?.usage || {};
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;

    // 计算工具调用次数
    const toolCalls = messages.filter(
      (m: any) => m.role === "assistant" && m.content?.some((c: any) => c.type === "tool_use"),
    ).length;

    // 收集修改文件（从 tool_result 中提取）
    const modifiedFiles = new Set<string>();
    for (const msg of messages) {
      if (msg.role === "toolResult" && msg.details) {
        const path = msg.details.filePath || msg.details.path;
        if (path) modifiedFiles.add(path);
      }
    }

    // 发送 webhook
    const payload = {
      source: "pi",
      event: "task_completed",
      title: "Pi Agent · 任务完成",
      summary,
      status: "completed",
      duration_ms: 0,
      tool_calls: toolCalls,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      modified_files: [...modifiedFiles],
      session_id: (ctx.sessionManager?.getSessionFile?.() || "").split("/").pop() || "",
      timestamp: Date.now(),
    };

    await sendWebhook(payload);
  });

  // ── 事件: 任务开始时通知 ───────────────────────────

  pi.on("agent_start", async (_event, _ctx) => {
    // 可选：任务开始时发送通知
    // await sendWebhook({
    //   source: "pi",
    //   event: "task_started",
    //   title: "Pi Agent · 开始处理",
    //   summary: "正在处理新任务...",
    //   status: "in_progress",
    //   timestamp: Date.now(),
    // });
  });

  // ── 发送 webhook 的通用函数 ────────────────────────

  async function sendWebhook(payload: Record<string, unknown>) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (WEBHOOK_SECRET) {
        headers["Authorization"] = `Bearer ${WEBHOOK_SECRET}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10s 超时

      await fetch(WEBHOOK_URL!, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          timestamp: payload.timestamp || Date.now(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch {
      // 静默失败 — webhook 通知不应影响 pi 正常工作
    }
  }
}