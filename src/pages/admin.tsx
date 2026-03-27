/** @jsxImportSource hono/jsx */

import type { Backend, CustomModel, LlmProvider } from "../types.ts";
import { EmptyState, Section, renderPage } from "./layout.tsx";

type BotSummary = {
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
    subtitle: "统一查看机器人状态、供应商、模型与 Webhook 配置。",
    children: (
      <>
        <Section title="机器人总览" description="每个机器人对应一个 Durable Object，会在这里汇总当前状态。">
          <div class="grid">
            {props.bots.length ? props.bots.map((bot) => (
              <div class="row">
                <div>
                  <strong>{bot.bot_id}</strong>
                  <div class="meta">
                    <span>{bot.remark || "未备注"}</span>
                    <span>{bot.agent_mode || "family"} 模式</span>
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

        <Section title="供应商" description="Provider 与 Model 分层管理，便于统一维护密钥与拉取模型。">
          <div class="grid">
            {props.providers.length ? props.providers.map((provider) => (
              <div class="row">
                <div>
                  <strong>{provider.name}</strong>
                  <div class="meta">
                    <span>{provider.type}</span>
                    <span class="code">{provider.baseUrl || "内置端点"}</span>
                  </div>
                </div>
                <div class="inline">
                  <button class="button" type="button" data-load-models={provider.id}>拉取模型</button>
                  <button class="button" type="button" data-delete-provider={provider.id}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无供应商配置。" />}
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
                  <option value="anthropic">anthropic</option>
                  <option value="openai-compat">openai-compat</option>
                </select>
              </div>
              <div class="field"><label>Base URL</label><input name="baseUrl" placeholder="https://openrouter.ai/api/v1" /></div>
              <div class="field full"><label>API Key</label><input name="apiKey" placeholder="${OPENROUTER_API_KEY}" required /></div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存供应商</button></div>
          </form>

          <div style="height: 14px"></div>

          <div id="model-import" class="card stack" hidden>
            <strong id="model-import-title">导入模型</strong>
            <div id="model-import-list" class="stack"></div>
            <div class="inline">
              <button id="import-selected-models" class="primary" type="button">导入选中模型</button>
            </div>
          </div>
        </Section>

        <Section title="模型" description="支持 daily / complex 角色标记，供 family 模式自动选模。">
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
                  <option value="daily">daily</option>
                  <option value="complex">complex</option>
                </select>
              </div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存模型</button></div>
          </form>
        </Section>

        <Section title="Webhooks" description="现有 webhook 配置会在此集中展示。">
          <div class="grid">
            {props.webhooks.length ? props.webhooks.map((webhook) => (
              <div class="row">
                <div>
                  <strong>{String((webhook as Record<string, unknown>).name || (webhook as Record<string, unknown>).path || "Webhook")}</strong>
                  <div class="meta">
                    <span>{String((webhook as Record<string, unknown>).source || "generic")}</span>
                    <span class="code">/{String((webhook as Record<string, unknown>).path || "")}</span>
                  </div>
                </div>
                <div class="inline">
                  <button class="button" type="button" data-delete-webhook={String((webhook as Record<string, unknown>).path || "")}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无 webhook 配置。" />}
          </div>

          <div style="height: 14px"></div>

          <form id="webhook-form" class="card stack">
            <strong>创建 Webhook</strong>
            <div class="form-grid">
              <div class="field"><label>路径</label><input name="path" placeholder="daily-news" /></div>
              <div class="field"><label>名称</label><input name="name" placeholder="每日新闻" /></div>
              <div class="field"><label>来源</label><input name="source" value="generic" /></div>
              <div class="field">
                <label>验证方式</label>
                <select name="verify">
                  <option value="bearer">bearer</option>
                  <option value="hmac-sha256">hmac-sha256</option>
                  <option value="none">none</option>
                </select>
              </div>
              <div class="field full"><label>Bot IDs（逗号分隔）</label><input name="bot_ids" placeholder="bot-a,bot-b" required /></div>
            </div>
            <div class="inline"><button class="primary" type="submit">创建 Webhook</button></div>
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
    }).join("") || '<p class="muted">没有可导入模型</p>';
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

function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}