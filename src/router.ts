// Command router — parse incoming text and return dispatch action
// Reference: ref/weclaw/messaging/handler.go

export type RouterAction =
  | { type: "help" }
  | { type: "status" }
  | { type: "clear" }
  | { type: "model"; args: string }
  | { type: "mode"; args: string }
  | { type: "memory" }
  | { type: "tasks"; args: string }
  | { type: "draw"; prompt: string }
  | { type: "conv"; sub?: "new" | "switch" | "rename" | "delete"; index?: number; title?: string }
  | { type: "compress"; sub?: "status" }
  | { type: "agent"; message: string };

export const HELP_TEXT = [
  "支持的命令：",
  "/conv — 查看对话列表",
  "/conv new [标题] — 新建对话",
  "/conv <序号> — 切换对话",
  "/conv rename <序号> <标题> — 重命名对话",
  "/conv delete <序号> — 删除对话",
  "/compress — 压缩当前对话历史",
  "/compress status — 查看压缩状态",
  "/claude [消息] — 与 Claude 对话",
  "/model — 查看/切换模型",
  "/mode [family|manual] — 切换自动/手动选模",
  "/memory — 查看当前记忆",
  "/tasks — 查看定时任务",
  "/draw [提示词] — AI 生图",
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
  if (lower === "/mode") return { type: "mode", args: "" };
  if (lower.startsWith("/mode ")) return { type: "mode", args: trimmed.slice("/mode ".length).trim() };
  if (lower === "/memory") return { type: "memory" };
  if (lower === "/tasks") return { type: "tasks", args: "" };
  if (lower.startsWith("/tasks ")) return { type: "tasks", args: trimmed.slice("/tasks ".length).trim() };

  if (lower.startsWith("/draw ")) {
    return { type: "draw", prompt: trimmed.slice("/draw ".length).trim() };
  }
  if (lower === "/draw") {
    return { type: "draw", prompt: "" };
  }

  // /conv commands
  if (lower === "/conv") return { type: "conv" };
  if (lower.startsWith("/conv new")) {
    const title = trimmed.slice("/conv new".length).trim();
    return { type: "conv", sub: "new", title };
  }
  if (lower.startsWith("/conv rename")) {
    const rest = trimmed.slice("/conv rename".length).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx > 0) {
      const index = parseInt(rest.slice(0, spaceIdx), 10);
      const title = rest.slice(spaceIdx + 1).trim();
      if (!isNaN(index) && index > 0) {
        return { type: "conv", sub: "rename", index, title };
      }
    }
    return { type: "agent", message: trimmed };
  }
  if (lower.startsWith("/conv delete")) {
    const rest = trimmed.slice("/conv delete".length).trim();
    const index = parseInt(rest, 10);
    if (!isNaN(index) && index > 0) {
      return { type: "conv", sub: "delete", index };
    }
    return { type: "agent", message: trimmed };
  }
  if (lower.startsWith("/conv ")) {
    const rest = trimmed.slice("/conv ".length).trim();
    const index = parseInt(rest, 10);
    if (!isNaN(index) && index > 0) {
      return { type: "conv", sub: "switch", index };
    }
    return { type: "agent", message: trimmed };
  }

  // /compress commands
  if (lower === "/compress") return { type: "compress" };
  if (lower === "/compress status") return { type: "compress", sub: "status" };

  if (lower.startsWith("/claude ")) {
    return { type: "agent", message: trimmed.slice("/claude ".length).trim() };
  }
  if (lower === "/claude") {
    return { type: "agent", message: "" };
  }

  // Plain text or unrecognized command → default agent
  return { type: "agent", message: trimmed };
}
