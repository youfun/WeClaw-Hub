/** @jsxImportSource hono/jsx */

import type { ScheduledTask, SystemTool } from "../types.ts";
import { EmptyState, Section, renderPage } from "./layout.tsx";

type BotSettings = {
  remark: string;
  keepalive: boolean;
  accept_webhook: boolean;
  agent_mode: "family" | "manual";
  active_model?: string;
};

type BotDetailProps = {
  botId: string;
  settings: BotSettings;
  tasks: ScheduledTask[];
  notes: Array<{ id: string; content: string; hitCount?: number; lastHitAt?: number | null }>;
  tools: SystemTool[];
  models: Array<{ displayName: string }>;
};

export function botDetailPage(props: BotDetailProps): Response {
  const selectedTool = props.tools.find((tool) => tool.id === "fetch_analyze") ?? props.tools[0] ?? null;
  const payload = serialize({
    botId: props.botId,
    tools: props.tools,
    tasks: props.tasks,
  });

  return renderPage({
    title: `Bot 配置 · ${props.botId}`,
    subtitle: "单 Bot 视图，集中管理 AI 模式、任务、记忆和后续 MCP 能力。",
    children: (
      <>
        <Section title="基础设置" description="这里展示当前 Durable Object 上保存的机器人设置。">
          <form id="settings-form" class="card stack">
            <div class="form-grid">
              <div class="field full">
                <label>备注</label>
                <input name="remark" value={props.settings.remark} placeholder="给这个 bot 起个备注" />
              </div>
              <div class="field">
                <label>AI 模式</label>
                <select name="agent_mode">
                  <option value="family" selected={props.settings.agent_mode === "family"}>family</option>
                  <option value="manual" selected={props.settings.agent_mode === "manual"}>manual</option>
                </select>
              </div>
              <div class="field">
                <label>当前模型</label>
                <select name="active_model">
                  <option value="">自动选择</option>
                  {props.models.map((model) => <option value={model.displayName} selected={props.settings.active_model === model.displayName}>{model.displayName}</option>)}
                </select>
              </div>
              <div class="field">
                <label>保活</label>
                <select name="keepalive">
                  <option value="true" selected={props.settings.keepalive}>ON</option>
                  <option value="false" selected={!props.settings.keepalive}>OFF</option>
                </select>
              </div>
              <div class="field">
                <label>接收 Webhook</label>
                <select name="accept_webhook">
                  <option value="true" selected={props.settings.accept_webhook}>ON</option>
                  <option value="false" selected={!props.settings.accept_webhook}>OFF</option>
                </select>
              </div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存设置</button></div>
          </form>
        </Section>

        <Section title="AI 模式" description="family 模式优先按模型角色 daily / complex 自动选择。">
          <div class="row">
            <div>
              <strong>{props.settings.agent_mode === "family" ? "家庭优化" : "指定模型"}</strong>
              <div class="meta">
                <span>{props.settings.agent_mode}</span>
                <span>{props.settings.active_model || "自动选择"}</span>
              </div>
            </div>
          </div>
        </Section>

        <Section title="定时任务" description="任务已切换为工具调用模型，使用 tool_id + tool_params 持久化。">
          <div class="grid">
            {props.tasks.length ? props.tasks.map((task) => (
              <div class="row">
                <div>
                  <strong>{task.name}</strong>
                  <div class="meta">
                    <span class="code">{task.schedule.type === "cron" ? task.schedule.cron : `${task.schedule.interval_ms} ms`}</span>
                    <span>{task.tool_id}</span>
                    <span>{task.last_run_at ? new Date(task.last_run_at).toLocaleString("zh-CN") : "未运行"}</span>
                  </div>
                </div>
                <div class="inline">
                  <span class={task.enabled ? "badge ok" : "badge warn"}>{task.enabled ? "ON" : "OFF"}</span>
                  <button class="button" type="button" data-edit-task={task.id}>编辑</button>
                  <button class="button" type="button" data-run-task={task.id}>运行</button>
                  <button class="button" type="button" data-toggle-task={task.id} data-next-enabled={task.enabled ? "false" : "true"}>{task.enabled ? "禁用" : "启用"}</button>
                  <button class="button" type="button" data-delete-task={task.id}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无定时任务。" />}
          </div>

          <div style="height: 14px"></div>

          <form id="task-form" class="card stack">
            <strong>新建 / 编辑任务</strong>
            <input id="task-id" name="id" type="hidden" />
            <div class="form-grid">
              <div class="field">
                <label>任务名称</label>
                <input name="name" value="每日新闻摘要" />
              </div>
              <div class="field">
                <label>执行工具</label>
                <select id="task-tool-id" name="tool_id">
                  {props.tools.map((tool) => <option value={tool.id}>{tool.name}</option>)}
                </select>
              </div>
              <div class="field full">
                <label>触发规则</label>
                <input name="cron" value="0 8 * * *" />
              </div>
              <div id="task-param-fields" class="field full">
                {selectedTool?.params.map((param) => (
                  <div class={param.type === "text" ? "field full" : "field"}>
                    <label>{param.label}</label>
                    {param.type === "text"
                      ? <textarea name={`param:${param.name}`} placeholder={param.placeholder || ""}></textarea>
                      : <input name={`param:${param.name}`} placeholder={param.placeholder || ""} />}
                  </div>
                ))}
              </div>
            </div>
            <div class="inline">
              <button class="primary" type="submit">保存任务</button>
              <button id="task-reset" class="button" type="button">清空表单</button>
            </div>
          </form>
        </Section>

        <Section title="记忆管理" description="展示当前提取出的用户事实，支持逐条删除或清空。">
          <div class="grid">
            {props.notes.length ? props.notes.map((note, index) => (
              <div class="row">
                <div>
                  <strong>{index + 1}. {note.content}</strong>
                  <div class="meta">
                    <span>hits: {note.hitCount ?? 0}</span>
                    <span>{note.lastHitAt ? new Date(note.lastHitAt).toLocaleDateString("zh-CN") : "未命中"}</span>
                  </div>
                </div>
                <div class="inline"><button class="button" type="button" data-delete-note={note.id}>删除</button></div>
              </div>
            )) : <EmptyState text="暂无记忆。" />}
          </div>
          <div style="height: 14px"></div>
          <div class="inline"><button id="clear-memory" class="button" type="button">清空所有</button></div>
        </Section>

        <Section title="MCP 端点" description="预留区，后续会接入 tools/list 自动发现。">
          <div class="card"><span class="badge warn">暂未开放</span></div>
        </Section>

        <script dangerouslySetInnerHTML={{ __html: buildBotDetailScript(payload) }} />
      </>
    ),
  });
}

function buildBotDetailScript(payload: string): string {
  return `
const botDetail = ${payload};

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "request_failed");
  }
  return res.json().catch(() => ({}));
}

function renderParamFields(toolId, values) {
  const wrap = document.getElementById("task-param-fields");
  if (!wrap) return;
  const tool = botDetail.tools.find((item) => item.id === toolId) || botDetail.tools[0];
  if (!tool) return;
  wrap.innerHTML = tool.params.map((param) => {
    const value = values && values[param.name] != null ? String(values[param.name]) : "";
    if (param.type === "text") {
      return '<div class="field full"><label>' + param.label + '</label><textarea name="param:' + param.name + '" placeholder="' + (param.placeholder || '') + '">' + value + '</textarea></div>';
    }
    return '<div class="field"><label>' + param.label + '</label><input name="param:' + param.name + '" placeholder="' + (param.placeholder || '') + '" value="' + value.replace(/"/g, '&quot;') + '"></div>';
  }).join("");
}

document.getElementById("task-tool-id")?.addEventListener("change", (event) => {
  renderParamFields(event.currentTarget.value, {});
});

document.getElementById("task-reset")?.addEventListener("click", () => {
  document.getElementById("task-form")?.reset();
  document.getElementById("task-id").value = "";
  renderParamFields(document.getElementById("task-tool-id").value, {});
});

document.getElementById("settings-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("PATCH", "/bot/" + encodeURIComponent(botDetail.botId) + "/settings", {
    remark: form.get("remark"),
    agent_mode: form.get("agent_mode"),
    active_model: form.get("active_model"),
    keepalive: form.get("keepalive") === "true",
    accept_webhook: form.get("accept_webhook") === "true",
  });
  location.reload();
});

document.getElementById("task-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const taskId = String(form.get("id") || "");
  const toolParams = {};
  for (const [key, value] of form.entries()) {
    if (String(key).startsWith("param:")) {
      toolParams[String(key).slice(6)] = value;
    }
  }
  const body = {
    id: taskId || undefined,
    name: form.get("name"),
    enabled: true,
    schedule: { type: "cron", cron: form.get("cron") },
    tool_id: form.get("tool_id"),
    tool_params: toolParams,
  };
  const base = "/bot/" + encodeURIComponent(botDetail.botId) + "/tasks";
  if (taskId) {
    await api("PUT", base + "/" + encodeURIComponent(taskId), body);
  } else {
    await api("POST", base, body);
  }
  location.reload();
});

document.querySelectorAll("[data-edit-task]").forEach((button) => {
  button.addEventListener("click", () => {
    const task = botDetail.tasks.find((item) => item.id === button.dataset.editTask);
    if (!task) return;
    document.getElementById("task-id").value = task.id;
    document.querySelector('[name="name"]').value = task.name;
    document.querySelector('[name="cron"]').value = task.schedule.cron || "";
    document.getElementById("task-tool-id").value = task.tool_id;
    renderParamFields(task.tool_id, task.tool_params || {});
    window.scrollTo({ top: document.getElementById("task-form").offsetTop - 24, behavior: "smooth" });
  });
});

document.querySelectorAll("[data-run-task]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("POST", "/bot/" + encodeURIComponent(botDetail.botId) + "/tasks/run", { task_id: button.dataset.runTask });
    location.reload();
  });
});

document.querySelectorAll("[data-toggle-task]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("PUT", "/bot/" + encodeURIComponent(botDetail.botId) + "/tasks/" + encodeURIComponent(button.dataset.toggleTask), {
      enabled: button.dataset.nextEnabled === "true",
    });
    location.reload();
  });
});

document.querySelectorAll("[data-delete-task]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("DELETE", "/bot/" + encodeURIComponent(botDetail.botId) + "/tasks/" + encodeURIComponent(button.dataset.deleteTask));
    location.reload();
  });
});

document.querySelectorAll("[data-delete-note]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("DELETE", "/bot/" + encodeURIComponent(botDetail.botId) + "/memory/" + encodeURIComponent(button.dataset.deleteNote));
    location.reload();
  });
});

document.getElementById("clear-memory")?.addEventListener("click", async () => {
  await api("DELETE", "/bot/" + encodeURIComponent(botDetail.botId) + "/memory/clear");
  location.reload();
});

renderParamFields(document.getElementById("task-tool-id")?.value || (botDetail.tools[0] && botDetail.tools[0].id), {});
`;
}

function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}