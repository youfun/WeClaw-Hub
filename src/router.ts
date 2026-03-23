// Command router — parse incoming text and return dispatch action
// Reference: ref/weclaw/messaging/handler.go

export type RouterAction =
  | { type: "help" }
  | { type: "status" }
  | { type: "clear" }
  | { type: "model"; args: string }
  | { type: "agent"; message: string };

export const HELP_TEXT = [
  "支持的命令：",
  "/claude [消息] — 与 Claude 对话",
  "/model — 查看/切换模型",
  "/status — 查看 Bot 状态",
  "/clear — 清空对话历史",
  "/help — 显示帮助",
  "直接输入文字 — 与 AI 对话",
].join("\n");

/** Parse incoming text into a router action. Synchronous and side-effect-free. */
export function parseRoute(text: string): RouterAction {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "/help") return { type: "help" };
  if (lower === "/status") return { type: "status" };
  if (lower === "/clear") return { type: "clear" };
  if (lower === "/model") return { type: "model", args: "" };
  if (lower.startsWith("/model ")) return { type: "model", args: trimmed.slice("/model ".length).trim() };

  if (lower.startsWith("/claude ")) {
    return { type: "agent", message: trimmed.slice("/claude ".length).trim() };
  }
  if (lower === "/claude") {
    return { type: "agent", message: "" };
  }

  // Plain text or unrecognized command → default agent
  return { type: "agent", message: trimmed };
}
