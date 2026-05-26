/** @jsxImportSource hono/jsx */

import type { Backend, CustomModel, LlmProvider } from "../types.ts";
import { EmptyState, Section, renderPage } from "./layout.tsx";

export type BotSummary = {
  bot_id: string;
  remark?: string;
  polling?: boolean;
  agent_mode?: string;
  paused?: boolean;
};

type AdminPageProps = {
  bots: BotSummary[];
  providers: LlmProvider[];
  models: CustomModel[];
  webhooks: Array<Backend | Record<string, unknown>>;
};

export function adminPage(props: AdminPageProps): Response {
  const payload = serialize({
    providers: props.providers,
    models: props.models,
    webhooks: props.webhooks,
  });

  return renderPage({
    title: "管理台",
    subtitle: "统一管理机器人、供应商、模型与 Webhook 配置。",
    children: (
      <>
        <Section title="机器人" description="每个机器人独立运行，当前状态在此集中展示。">
          <div class="grid">
            {props.bots.length ? props.bots.map((bot) => (
              <div class="row">
                <div>
                  <strong>{bot.bot_id}</strong>
                  <div class="meta">
                    <span>{bot.remark || "未备注"}</span>
                    <span>{displayAgentMode(bot.agent_mode)} 模式</span>
                  </div>
                </div>
                <div class="inline">
                  <span class={bot.polling ? "badge ok" : "badge warn"}>{bot.polling ? "轮询中" : "已停止"}</span>
                  <a class="button primary" href={`/admin/bot/${encodeURIComponent(bot.bot_id)}`}>进入配置</a>
                </div>
              </div>
            )) : <EmptyState text="暂无已登录机器人。" />}
          </div>
        </Section>

        <Section title="供应商" description="按供应商统一管理密钥与接口地址，拉取可用模型并一键导入。">
          <div class="grid">
            {props.providers.length ? props.providers.map((provider) => (
              <div class="row">
                <div>
                  <strong>{provider.name}</strong>
                  <div class="meta">
                    <span>{displayProviderType(provider.type)}</span>
                    <span class="code">{provider.baseUrl || "官方 API"}</span>
                  </div>
                </div>
                <div class="inline">
                  <button class="button" type="button" data-load-models={provider.id}>获取模型列表</button>
                  <button class="button" type="button" data-delete-provider={provider.id}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无供应商。" />}
          </div>

          <div style="height: 14px"></div>

          <form id="provider-form" class="card stack">
            <strong>添加供应商</strong>
            <div class="form-grid">
              <div class="field"><label>ID</label><input name="id" placeholder="openrouter" required /></div>
              <div class="field"><label>名称</label><input name="name" placeholder="OpenRouter" required /></div>
              <div class="field">
                <label>类型</label>
                <select name="type">
                  <option value="anthropic">Anthropic 格式</option>
                  <option value="openai-compat">OpenAI 兼容</option>
                </select>
              </div>
              <div class="field"><label>接口地址</label><input name="baseUrl" placeholder="https://openrouter.ai/api/v1" /></div>
              <div class="field full"><label>密钥</label><input name="apiKey" placeholder="${OPENROUTER_API_KEY}" required /></div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存供应商</button></div>
          </form>

          <div style="height: 14px"></div>

          <div id="model-import" class="card stack" hidden>
            <strong id="model-import-title">从供应商导入模型</strong>
            <div id="model-import-list" class="stack"></div>
            <div class="inline">
              <button id="import-selected-models" class="primary" type="button">导入所选模型</button>
            </div>
          </div>
        </Section>

        <Section title="模型" description="支持「日常」「复杂推理」角色标记，供智能模式自动选模。">
          <div class="grid">
            {props.models.length ? props.models.map((model) => (
              <div class="row">
                <div>
                  <strong>{model.displayName}</strong>
                  <div class="meta">
                    <span class="code">{model.model}</span>
                    <span>{model.providerId}</span>
                    <span>{model.role || "未设角色"}</span>
                  </div>
                </div>
                <div class="inline">
                  <button class="button" type="button"
                    data-edit-model={model.displayName}
                    data-edit-model-id={model.model}
                    data-edit-provider={model.providerId}
                    data-edit-role={model.role || ""}>编辑</button>
                  <button class="button" type="button" data-delete-model={model.displayName}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无模型配置。" />}
          </div>

          <div style="height: 14px"></div>

          <form id="model-form" class="card stack">
            <strong>添加模型</strong>
            <div class="form-grid">
              <div class="field"><label>模型 ID</label><input name="model" placeholder="claude-sonnet-4-5-20250514" required /></div>
              <div class="field"><label>显示名</label><input name="displayName" placeholder="Sonnet 4.5" required /></div>
              <div class="field">
                <label>供应商</label>
                <select name="providerId">
                  {props.providers.map((provider) => <option value={provider.id}>{provider.name}</option>)}
                </select>
              </div>
              <div class="field">
                <label>角色</label>
                <select name="role">
                  <option value="">未设置</option>
                  <option value="daily">日常 — 聊天、简单问答</option>
                  <option value="complex">复杂推理 — 编程、分析</option>
                  <option value="extraction">记忆提取 — 推荐轻量模型</option>
                </select>
              </div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存模型</button></div>
          </form>

          <form id="model-edit-form" class="card stack" hidden>
            <strong>编辑模型</strong>
            <input type="hidden" name="_originalName" />
            <div class="form-grid">
              <div class="field"><label>模型 ID</label><input name="model" required /></div>
              <div class="field"><label>显示名</label><input name="displayName" required /></div>
              <div class="field">
                <label>供应商</label>
                <select name="providerId">
                  {props.providers.map((provider) => <option value={provider.id}>{provider.name}</option>)}
                </select>
              </div>
              <div class="field">
                <label>角色</label>
                <select name="role">
                  <option value="">未设置</option>
                  <option value="daily">日常 — 聊天、简单问答</option>
                  <option value="complex">复杂推理 — 编程、分析</option>
                  <option value="extraction">记忆提取 — 推荐轻量模型</option>
                </select>
              </div>
            </div>
            <div class="inline">
              <button class="primary" type="submit">保存修改</button>
              <button class="button" type="button" id="model-edit-cancel">取消</button>
            </div>
          </form>
        </Section>

        <Section title="Webhook" description="将外部服务的事件推送到微信。在此集中管理 Webhook 配置。">
          <div class="grid">
            {props.webhooks.length ? props.webhooks.map((webhook) => (
              <div class="row">
                <div>
                  <strong>{String((webhook as Record<string, unknown>).name || (webhook as Record<string, unknown>).path || "Webhook")}</strong>
                  <div class="meta">
                    <span>{displayWebhookSource(String((webhook as Record<string, unknown>).source || "generic"))}</span>
                    <span class="code">/{String((webhook as Record<string, unknown>).path || "")}</span>
                  </div>
                </div>
                <div class="inline">
                  <button class="button" type="button" data-delete-webhook={String((webhook as Record<string, unknown>).path || "")}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无 Webhook。" />}
          </div>

          <div style="height: 14px"></div>

          <form id="webhook-form" class="card stack">
            <strong>添加 Webhook</strong>
            <div class="form-grid">
              <div class="field"><label>路径</label><input name="path" placeholder="daily-news" /></div>
              <div class="field"><label>名称</label><input name="name" placeholder="每日新闻" /></div>
              <div class="field"><label>消息来源</label><input name="source" value="generic" /></div>
              <div class="field">
                <label>验证方式</label>
                <select name="verify">
                  <option value="bearer">Bearer 令牌</option>
                  <option value="hmac-sha256">HMAC-SHA256 签名</option>
                  <option value="none">无验证</option>
                </select>
              </div>
              <div class="field full"><label>目标机器人（逗号分隔）</label><input name="bot_ids" placeholder="bot-a,bot-b" required /></div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存 Webhook</button></div>
          </form>
        </Section>

        <script dangerouslySetInnerHTML={{ __html: buildAdminScript(payload) }} />
      </>
    ),
  });
}

function buildAdminScript(payload: string): string {
  return `
const adminData = ${payload};
let activeProviderId = "";

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
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "request_failed");
  }
  return res.json().catch(() => ({}));
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

document.getElementById("provider-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = formToObject(event.currentTarget);
  await api("POST", "/api/providers", body);
  location.reload();
});

document.getElementById("model-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = formToObject(event.currentTarget);
  if (!body.role) delete body.role;
  await api("POST", "/api/models", body);
  location.reload();
});

document.getElementById("webhook-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = formToObject(event.currentTarget);
  body.bot_ids = String(body.bot_ids || "").split(",").map((item) => item.trim()).filter(Boolean);
  await api("POST", "/api/webhooks", body);
  location.reload();
});

document.querySelectorAll("[data-delete-provider]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("DELETE", "/api/providers/" + encodeURIComponent(button.dataset.deleteProvider));
    location.reload();
  });
});

document.querySelectorAll("[data-delete-model]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("DELETE", "/api/models/" + encodeURIComponent(button.dataset.deleteModel));
    location.reload();
  });
});

document.querySelectorAll("[data-edit-model]").forEach((button) => {
  button.addEventListener("click", () => {
    const form = document.getElementById("model-edit-form");
    if (!form) return;
    form.querySelector("[name=_originalName]").value = button.dataset.editModel;
    form.querySelector("[name=model]").value = button.dataset.editModelId;
    form.querySelector("[name=displayName]").value = button.dataset.editModel;
    form.querySelector("[name=providerId]").value = button.dataset.editProvider;
    form.querySelector("[name=role]").value = button.dataset.editRole;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
});

document.getElementById("model-edit-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = formToObject(event.currentTarget);
  const originalName = body._originalName;
  delete body._originalName;
  if (!body.role) delete body.role;
  await api("PUT", "/api/models/" + encodeURIComponent(originalName), body);
  location.reload();
});

document.getElementById("model-edit-cancel")?.addEventListener("click", () => {
  const form = document.getElementById("model-edit-form");
  if (form) form.hidden = true;
});

document.querySelectorAll("[data-delete-webhook]").forEach((button) => {
  button.addEventListener("click", async () => {
    await api("DELETE", "/api/webhooks/" + encodeURIComponent(button.dataset.deleteWebhook));
    location.reload();
  });
});

document.querySelectorAll("[data-load-models]").forEach((button) => {
  button.addEventListener("click", async () => {
    activeProviderId = button.dataset.loadModels || "";
    const provider = adminData.providers.find((item) => item.id === activeProviderId);
    const res = await api("GET", "/api/providers/" + encodeURIComponent(activeProviderId) + "/models");
    const imported = new Set(adminData.models.filter((item) => item.providerId === activeProviderId).map((item) => item.model));
    const wrap = document.getElementById("model-import");
    const title = document.getElementById("model-import-title");
    const list = document.getElementById("model-import-list");
    if (!wrap || !title || !list) return;
    title.textContent = "从 " + (provider?.name || activeProviderId) + " 导入模型";
    list.innerHTML = (res.models || []).map((model) => {
      const checked = imported.has(model.id);
      return '<label class="row"><span><strong>' + model.name + '</strong><span class="meta"><span class="code">' + model.id + '</span></span></span><input type="checkbox" data-import-model="' + model.id + '" data-import-name="' + model.name + '" ' + (checked ? 'disabled' : '') + '></label>';
    }).join("") || '<p class="muted">未找到可导入的模型</p>';
    wrap.hidden = false;
  });
});

document.getElementById("import-selected-models")?.addEventListener("click", async () => {
  if (!activeProviderId) return;
  const selected = Array.from(document.querySelectorAll("[data-import-model]:checked")).map((input) => ({
    model: input.dataset.importModel,
    displayName: input.dataset.importName,
  }));
  if (!selected.length) return;
  await api("POST", "/api/models/import", { providerId: activeProviderId, models: selected });
  location.reload();
});
`;
}

function displayAgentMode(mode: string | undefined): string {
  if (mode === "family") return "智能";
   if (mode === "manual") return "手动";
  return mode || "智能";
}

function displayProviderType(type: string): string {
  return type === "anthropic" ? "Anthropic 格式" : type === "openai-compat" ? "OpenAI 兼容" : type;
}

function displayModelRole(role: string | null | undefined): string {
  if (!role) return "未设置";
  if (role === "daily") return "日常";
  if (role === "complex") return "复杂推理";
  if (role === "extraction") return "记忆提取";
  return role;
}

function displayWebhookSource(source: string): string {
  if (source === "generic") return "通用";
  if (source === "github") return "GitHub";
  return source;
}

function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}