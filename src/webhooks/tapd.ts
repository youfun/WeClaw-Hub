function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const OBJECT_LABELS: Record<string, string> = {
  story: "需求",
  bug: "缺陷",
  task: "任务",
  release: "发布",
  iteration: "迭代",
};

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  status_change: "状态变更",
};

export function parseTapdMessage(payload: unknown): string | null {
  const body = asRecord(payload);
  if (!body) return null;

  const workspaceId = asText(body.workspace_id) || "unknown";
  const currentUser = asText(body.current_user);
  const id = asText(body.id);
  const event = asText(body.event);

  let objectLabel: string;
  let actionLabel: string;

  if (event) {
    const sep = event.indexOf("::");
    if (sep !== -1) {
      const objectType = event.slice(0, sep);
      const action = event.slice(sep + 2);
      objectLabel = OBJECT_LABELS[objectType] ?? objectType;
      actionLabel = ACTION_LABELS[action] ?? action;
    } else {
      objectLabel = "事件";
      actionLabel = event;
    }
  } else {
    objectLabel = "事件";
    actionLabel = "";
  }

  const parts = [`[TAPD] 项目:${workspaceId}`, objectLabel];
  if (actionLabel) parts.push(actionLabel);
  if (currentUser) parts.push(`by ${currentUser}`);
  if (id) parts.push(`(ID: ${id})`);

  return parts.join(" ");
}
