/** @jsxImportSource hono/jsx */

import type { ScheduledTask, SystemTool } from "../types.ts";
import { Chip, EmptyState, Section, StatusBadge, renderPage } from "./layout.tsx";

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

function humanSchedule(task: ScheduledTask): string {
  if (task.schedule.type === "interval") {
    const ms = task.schedule.interval_ms ?? 0;
    if (ms % 86_400_000 === 0) return `每 ${ms / 86_400_000} 天`;
    if (ms % 3_600_000 === 0) return `每 ${ms / 3_600_000} 小时`;
    return `每 ${ms / 60_000} 分钟`;
  }
  const cron = task.schedule.cron ?? "";
  const daily = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (daily) {
    const mm = daily[1]!.padStart(2, "0");
    const hh = daily[2]!.padStart(2, "0");
    return `每天 ${hh}:${mm}`;
  }
  // weekly: MM HH * * DOW
  const weekly = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+(\d(?:[,-]\d)*)$/);
  if (weekly) {
    const mm = weekly[1]!.padStart(2, "0");
    const hh = weekly[2]!.padStart(2, "0");
    const dowMap = ["日", "一", "二", "三", "四", "五", "六"];
    const days = weekly[3]!.split(",").map((d) => dowMap[Number(d)] ?? d).join(" ");
    return `每周${days} ${hh}:${mm}`;
  }
  return cron;
}

export function botDetailPage(props: BotDetailProps): Response {
  const selectedTool = props.tools.find((tool) => tool.id === "fetch_analyze") ?? props.tools[0] ?? null;
  const payload = serialize({
    botId: props.botId,
    tools: props.tools,
    tasks: props.tasks,
  });

  return renderPage({
    title: `Bot 配置 · ${props.botId}`,
    subtitle: "集中管理当前机器人的设置、定时任务与记忆。",
    activeNav: "admin",
    children: (
      <>
        <div class="breadcrumb">
          <a href="/admin">← 管理台</a>
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-current">{props.botId}</span>
        </div>
        <Section
          title="基础设置"
          description="修改备注、AI 模式与功能开关。"
          dot="brand"
        >
          <form id="settings-form" class="card stack">
            <div class="form-grid">
              <div class="field full">
                <label>备注</label>
                <input name="remark" value={props.settings.remark} placeholder="给这个 bot 起个备注" />
              </div>
              <div class="field">
                <label>AI 模式</label>
                <select name="agent_mode">
                  <option value="family" selected={props.settings.agent_mode === "family"}>智能选择</option>
                  <option value="manual" selected={props.settings.agent_mode === "manual"}>手动指定</option>
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
                  <option value="true" selected={props.settings.keepalive}>开启</option>
                  <option value="false" selected={!props.settings.keepalive}>关闭</option>
                </select>
              </div>
              <div class="field">
                <label>接收 Webhook</label>
                <select name="accept_webhook">
                  <option value="true" selected={props.settings.accept_webhook}>开启</option>
                  <option value="false" selected={!props.settings.accept_webhook}>关闭</option>
                </select>
              </div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存设置</button></div>
          </form>
        </Section>

        <Section
          title="AI 模式"
          description="智能选择会根据对话内容自动切换轻量 / 复杂模型。手动指定则始终使用所选模型。"
          dot="terminal"
        >
          <div class="row">
            <div>
              <strong>{props.settings.agent_mode === "family" ? "智能选择" : "手动指定"}</strong>
              <div class="meta">
                <Chip color="terminal" text={props.settings.agent_mode === "family" ? "智能" : "手动"} />
                <span>{props.settings.active_model || "自动选择"}</span>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="定时任务"
          description="到了设定时间，机器人会自动执行你配置的动作。"
          dot="wechat"
        >
          <div class="grid">
            {props.tasks.length ? props.tasks.map((task) => (
              <div class={`row stripe-${task.enabled ? "ok" : "warn"} relative overflow-hidden`}>
                <div class="pl-1">
                  <strong>{task.name}</strong>
                  <div class="meta">
                    <span class="code-inline">{humanSchedule(task)}</span>
                    <span class="meta-chip">{props.tools.find(t => t.id === task.tool_id)?.name ?? task.tool_id}</span>
                    <span>{task.last_run_at ? new Date(task.last_run_at).toLocaleString("zh-CN") : "未运行"}</span>
                  </div>
                </div>
                <div class="inline">
                  <StatusBadge
                    status={task.enabled ? "ok" : "warn"}
                    text={task.enabled ? "启用" : "停用"}
                    pulse={task.enabled}
                  />
                  <button class="button" type="button" data-edit-task={task.id}>编辑</button>
                  <button class="button" type="button" data-run-task={task.id}>运行</button>
                  <button class="button" type="button" data-toggle-task={task.id} data-next-enabled={task.enabled ? "false" : "true"}>{task.enabled ? "禁用" : "启用"}</button>
                  <button class="button" type="button" data-delete-task={task.id}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无定时任务。" />}
          </div>

          <div class="inline mt-3">
            <button id="toggle-task-form" class="button" type="button">+ 新建任务</button>
          </div>

          <div id="task-form-wrap" class="card hidden mt-3">
          <form id="task-form" class="stack">
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
                <label>触发模式</label>
                <select id="schedule-mode" name="schedule_mode">
                  <option value="daily">每天</option>
                  <option value="interval">间隔</option>
                  <option value="cron">自定义 Cron</option>
                </select>
              </div>
              <div id="schedule-daily" class="field full">
                <label>执行时间</label>
                <input type="time" id="daily-time" name="daily_time" value="08:00" />
              </div>
              <div id="schedule-interval" class="field full hidden">
                <label>执行间隔</label>
                <div class="flex items-center gap-2">
                  <input type="number" id="interval-value" name="interval_value" value="30" min="1" class="w-20" />
                  <select id="interval-unit" name="interval_unit">
                    <option value="minute">分钟</option>
                    <option value="hour">小时</option>
                    <option value="day">天</option>
                  </select>
                </div>
              </div>
              <div id="schedule-cron" class="field full hidden">
                <label>Cron 表达式</label>
                <input id="cron-input" name="cron" value="0 8 * * *" />
                <span class="helper">分 时 日 月 周 · 例：0 8 * * * = 每天 8:00</span>
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
              <button id="cancel-task-form" class="button" type="button">取消</button>
            </div>
          </form>
          </div>
        </Section>

        <Section
          title="记忆管理"
          description="展示当前提取出的用户事实，支持逐条删除或清空。"
          dot="purple"
        >
          <div class="grid">
            {props.notes.length ? props.notes.map((note, index) => (
              <div class="row">
                <div>
                  <strong>{index + 1}. {note.content}</strong>
                  <div class="meta">
                    <span>命中 {note.hitCount ?? 0} 次</span>
                    <span>{note.lastHitAt ? new Date(note.lastHitAt).toLocaleDateString("zh-CN") : "未命中"}</span>
                  </div>
                </div>
                <div class="inline"><button class="button" type="button" data-delete-note={note.id}>删除</button></div>
              </div>
            )) : <EmptyState text="暂无记忆。" />}
          </div>
          <div class="h-3" />
          <div class="inline"><button id="clear-memory" class="button" type="button">清空所有</button></div>
        </Section>

        <Section
          title="MCP 端点"
          description="即将开放，支持接入外部工具扩展机器人能力。"
          dot="amber"
        >
          <div class="card"><StatusBadge status="warn" text="暂未开放" /></div>
        </Section>

        <script dangerouslySetInnerHTML={{ __html: buildBotDetailScript(payload) }} />
      </>
    ),
  });
}

function buildBotDetailScript(payload: string): string {
  return `
const botDetail = ${payload};

function getAuthToken() {
  const match = document.cookie.match(/(?:^|;\\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function api(method, path, body) {
  const token = getAuthToken();
  const headers = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.assign("/auth?redirect=" + encodeURIComponent(window.location.pathname));
    return new Promise(() => {});
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "request_failed");
  }
  return res.json().catch(() => ({}));
}

async function wrapSubmit(target, loadingText, actionFn) {
  let button;
  let originalText;
  let isForm = target.tagName === "FORM";
  if (isForm) {
    button = target.querySelector('button[type="submit"]');
  } else {
    button = target;
  }
  if (button) {
    originalText = button.textContent;
    button.disabled = true;
    if (loadingText) button.textContent = loadingText;
  }
  try {
    await actionFn();
  } catch (err) {
    alert("操作失败: " + err.message);
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function toggleForm(btnId, wrapId, cancelBtnId) {
  const btn = document.getElementById(btnId);
  const wrap = document.getElementById(wrapId);
  const cancelBtn = document.getElementById(cancelBtnId);
  if (!btn || !wrap) return;
  var addLabel = btn.textContent;
  var closeLabel = "\\u2212 收起";

  function show() {
    wrap.classList.remove("hidden");
    btn.textContent = closeLabel;
  }
  function hide() {
    wrap.classList.add("hidden");
    btn.textContent = addLabel;
  }

  btn.addEventListener("click", function () {
    wrap.classList.contains("hidden") ? show() : hide();
  });
  if (cancelBtn) cancelBtn.addEventListener("click", hide);
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

function switchScheduleMode(mode) {
  document.getElementById("schedule-daily").style.display = mode === "daily" ? "" : "none";
  document.getElementById("schedule-interval").style.display = mode === "interval" ? "" : "none";
  document.getElementById("schedule-cron").style.display = mode === "cron" ? "" : "none";
}

function fillScheduleForm(schedule) {
  if (schedule.type === "interval") {
    document.getElementById("schedule-mode").value = "interval";
    switchScheduleMode("interval");
    const ms = schedule.interval_ms || 0;
    if (ms % 86400000 === 0) {
      document.getElementById("interval-value").value = ms / 86400000;
      document.getElementById("interval-unit").value = "day";
    } else if (ms % 3600000 === 0) {
      document.getElementById("interval-value").value = ms / 3600000;
      document.getElementById("interval-unit").value = "hour";
    } else {
      document.getElementById("interval-value").value = ms / 60000;
      document.getElementById("interval-unit").value = "minute";
    }
    return;
  }
  const cron = schedule.cron || "";
  const daily = cron.match(/^(\\d+)\\s+(\\d+)\\s+\\*\\s+\\*\\s+\\*$/);
  if (daily) {
    document.getElementById("schedule-mode").value = "daily";
    switchScheduleMode("daily");
    document.getElementById("daily-time").value = daily[2].padStart(2,"0") + ":" + daily[1].padStart(2,"0");
    return;
  }
  document.getElementById("schedule-mode").value = "cron";
  switchScheduleMode("cron");
  document.getElementById("cron-input").value = cron;
}

function readScheduleFromForm() {
  const mode = document.getElementById("schedule-mode").value;
  if (mode === "daily") {
    const t = document.getElementById("daily-time").value.split(":");
    const mm = parseInt(t[1], 10);
    const hh = parseInt(t[0], 10);
    return { type: "cron", cron: mm + " " + hh + " * * *" };
  }
  if (mode === "interval") {
    const val = parseInt(document.getElementById("interval-value").value, 10) || 30;
    const unit = document.getElementById("interval-unit").value;
    const ms = unit === "day" ? val * 86400000 : unit === "hour" ? val * 3600000 : val * 60000;
    return { type: "interval", interval_ms: ms };
  }
  const cron = document.getElementById("cron-input").value || "0 8 * * *";
  return { type: "cron", cron: cron };
}

function getCurrentParamValues() {
  const values = {};
  document.querySelectorAll('[name^="param:"]').forEach((input) => {
    const name = input.name.slice(6);
    values[name] = input.value;
  });
  return values;
}

document.getElementById("task-tool-id")?.addEventListener("change", (event) => {
  const currentValues = getCurrentParamValues();
  renderParamFields(event.currentTarget.value, currentValues);
});

document.getElementById("schedule-mode")?.addEventListener("change", (event) => {
  switchScheduleMode(event.currentTarget.value);
});

document.getElementById("task-reset")?.addEventListener("click", () => {
  document.getElementById("task-form")?.reset();
  document.getElementById("task-id").value = "";
  document.getElementById("schedule-mode").value = "daily";
  switchScheduleMode("daily");
  document.getElementById("daily-time").value = "08:00";
  document.getElementById("interval-value").value = "30";
  document.getElementById("interval-unit").value = "minute";
  document.getElementById("cron-input").value = "0 8 * * *";
  renderParamFields(document.getElementById("task-tool-id").value, {});
});

document.getElementById("settings-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  await wrapSubmit(form, "保存中...", async () => {
    await api("PATCH", "/bot/" + botDetail.botId + "/settings", {
      remark: formData.get("remark"),
      agent_mode: formData.get("agent_mode"),
      active_model: formData.get("active_model"),
      keepalive: formData.get("keepalive") === "true",
      accept_webhook: formData.get("accept_webhook") === "true",
    });
    location.reload();
  });
});

document.getElementById("task-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const taskId = String(formData.get("id") || "");
  const toolParams = {};
  for (const [key, value] of formData.entries()) {
    if (String(key).startsWith("param:")) {
      toolParams[String(key).slice(6)] = value;
    }
  }
  const body = {
    id: taskId || undefined,
    name: formData.get("name"),
    enabled: true,
    schedule: readScheduleFromForm(),
    tool_id: formData.get("tool_id"),
    tool_params: toolParams,
  };
  const base = "/bot/" + botDetail.botId + "/tasks";
  await wrapSubmit(form, "保存中...", async () => {
    if (taskId) {
      await api("PUT", base + "/" + encodeURIComponent(taskId), body);
    } else {
      await api("POST", base, body);
    }
    location.reload();
  });
});

document.querySelectorAll("[data-edit-task]").forEach((button) => {
  button.addEventListener("click", () => {
    const task = botDetail.tasks.find((item) => item.id === button.dataset.editTask);
    if (!task) return;
    document.getElementById("task-id").value = task.id;
    document.querySelector('[name="name"]').value = task.name;
    fillScheduleForm(task.schedule);
    document.getElementById("task-tool-id").value = task.tool_id;
    renderParamFields(task.tool_id, task.tool_params || {});
    // Auto-expand the form
    var wrap = document.getElementById("task-form-wrap");
    var btn = document.getElementById("toggle-task-form");
    if (wrap && wrap.classList.contains("hidden")) {
      wrap.classList.remove("hidden");
      if (btn) btn.textContent = "\\u2212 收起";
    }
    window.scrollTo({ top: document.getElementById("task-form").offsetTop - 24, behavior: "smooth" });
  });
});

document.querySelectorAll("[data-run-task]").forEach((button) => {
  button.addEventListener("click", async () => {
    await wrapSubmit(button, "运行中...", async () => {
      await api("POST", "/bot/" + botDetail.botId + "/tasks/run", { task_id: button.dataset.runTask });
      location.reload();
    });
  });
});

document.querySelectorAll("[data-toggle-task]").forEach((button) => {
  button.addEventListener("click", async () => {
    await wrapSubmit(button, button.dataset.nextEnabled === "true" ? "启用中..." : "禁用中...", async () => {
      await api("PUT", "/bot/" + botDetail.botId + "/tasks/" + encodeURIComponent(button.dataset.toggleTask), {
        enabled: button.dataset.nextEnabled === "true",
      });
      location.reload();
    });
  });
});

document.querySelectorAll("[data-delete-task]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!confirm("确定要删除该定时任务吗？")) return;
    await wrapSubmit(button, "删除中...", async () => {
      await api("DELETE", "/bot/" + botDetail.botId + "/tasks/" + encodeURIComponent(button.dataset.deleteTask));
      location.reload();
    });
  });
});

document.querySelectorAll("[data-delete-note]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!confirm("确定要删除该条记忆吗？")) return;
    await wrapSubmit(button, "删除中...", async () => {
      await api("DELETE", "/bot/" + botDetail.botId + "/memory/" + encodeURIComponent(button.dataset.deleteNote));
      location.reload();
    });
  });
});

document.getElementById("clear-memory")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!confirm("确定要清空该机器人的所有记忆吗？此操作无法撤销。")) return;
  await wrapSubmit(button, "清空中...", async () => {
    await api("DELETE", "/bot/" + botDetail.botId + "/memory/clear");
    location.reload();
  });
});

switchScheduleMode("daily");
renderParamFields(document.getElementById("task-tool-id")?.value || (botDetail.tools[0] && botDetail.tools[0].id), {});
toggleForm("toggle-task-form", "task-form-wrap", "cancel-task-form");
`;
}

function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
