/** @jsxImportSource hono/jsx */

import type { Backend, CustomModel, LlmProvider } from "../types.ts";
import { Chip, EmptyState, Section, StatusBadge, renderPage } from "./layout.tsx";

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
  imageProviderId: string | null;
  imageModel: string | null;
};

export function adminPage(props: AdminPageProps): Response {
  const payload = serialize({
    providers: props.providers,
    models: props.models,
    webhooks: props.webhooks,
    botIds: props.bots.map((b) => b.bot_id),
    imageProviderId: props.imageProviderId,
    imageModel: props.imageModel,
  });

  return renderPage({
    title: "管理台",
    subtitle: "统一管理机器人、供应商、模型与 Webhook 配置。",
    activeNav: "admin",
    children: (
      <>
        <Section
          title="机器人"
          description="每个机器人独立运行，当前状态在此集中展示。"
          dot="wechat"
        >
          <div class="grid">
            {props.bots.length ? props.bots.map((bot) => (
              <div class={`row stripe-${bot.polling ? "ok" : "warn"}`} style="position:relative;overflow:hidden">
                <div style="padding-left:4px">
                  <strong>{bot.bot_id}</strong>
                  <div class="meta">
                    <span class="meta-chip">{bot.remark || "未备注"}</span>
                    <span class="meta-chip">{bot.agent_mode || "family"} 模式</span>
                  </div>
                </div>
                <div class="inline">
                  <StatusBadge
                    status={bot.polling ? "ok" : "warn"}
                    text={bot.polling ? "轮询中" : "已停止"}
                    pulse={bot.polling}
                  />
                  <a class="button primary" href={`/admin/bot/${encodeURIComponent(bot.bot_id)}`}>进入配置</a>
                  <button class="button" type="button" data-unbind-bot={bot.bot_id}>解除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无已登录机器人。" />}
          </div>
        </Section>

        <Section
          title="供应商"
          description="按供应商统一管理密钥与接口地址，拉取可用模型并一键导入。"
          dot="cf"
        >
          <div class="grid">
            {props.providers.length ? props.providers.map((provider) => (
              <div class="row">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <strong style="margin-bottom:0">{provider.name}</strong>
                    <Chip
                      color={provider.type === "anthropic" ? "purple" : "blue"}
                      text={displayProviderType(provider.type)}
                    />
                  </div>
                  <div class="meta">
                    <span class="code-inline">{provider.baseUrl || "官方 API"}</span>
                  </div>
                </div>
                <div class="inline">
                  <button class="button" type="button" data-load-models={provider.id}>获取模型列表</button>
                  <button class="button" type="button" data-delete-provider={provider.id}>删除</button>
                </div>
              </div>
            )) : <EmptyState text="暂无供应商。" />}
          </div>

          <div class="inline" style="margin-top:12px">
            <button id="toggle-provider-form" class="button" type="button">+ 添加供应商</button>
          </div>

          <div id="provider-form-wrap" class="card hidden" style="margin-top:12px">
              <form id="provider-form" class="stack">
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
                  <div class="field"><label>接口地址</label><input name="baseUrl" placeholder="https://openrouter.ai/api/v1" /></div>
                  <div class="field full"><label>密钥</label><input name="apiKey" placeholder="${OPENROUTER_API_KEY}" required /></div>
                </div>
                <div class="inline">
                  <button class="primary" type="submit">保存供应商</button>
                  <button class="button" type="button" id="cancel-provider-form">取消</button>
                </div>
              </form>
          </div>

          <div style="height: 14px"></div>

          <div id="model-import" class="card stack" hidden>
            <strong id="model-import-title">从供应商导入模型</strong>
            <div id="model-import-list" class="stack"></div>
            <div class="inline">
              <button id="import-selected-models" class="primary" type="button">导入所选模型</button>
            </div>
          </div>
        </Section>

        <Section
          title="模型"
          description="支持 daily / complex 角色标记，供 family 模式自动选模。"
          dot="brand"
        >
          <div class="grid">
            {props.models.length ? props.models.map((model) => (
              <div class="row">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <strong style="margin-bottom:0">{model.displayName}</strong>
                    {model.role ? (
                      <Chip
                        color={model.role === "complex" ? "brand" : model.role === "extraction" ? "purple" : "terminal"}
                        text={displayModelRole(model.role)}
                      />
                    ) : null}
                  </div>
                  <div class="meta">
                    <span class="code-inline">{model.model}</span>
                    <span class="meta-chip">{model.providerId}</span>
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

          <div class="inline" style="margin-top:12px">
            <button id="toggle-model-form" class="button" type="button">+ 添加模型</button>
          </div>

          <div id="model-form-wrap" class="card hidden" style="margin-top:12px">
              <form id="model-form" class="stack">
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
                <div class="inline">
                  <button class="primary" type="submit">保存模型</button>
                  <button class="button" type="button" id="cancel-model-form">取消</button>
                </div>
              </form>
          </div>

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

        <Section
          title="生图"
          description="发送 /draw 命令时使用的图片生成模型。"
          dot="amber"
        >
          <form id="image-form" class="card stack">
            <div class="form-grid">
              <div class="field">
                <label>供应商</label>
                <select name="image_provider_id" id="image-provider-select">
                  <option value="">不使用生图</option>
                  {props.providers.map((provider) => <option value={provider.id} selected={props.imageProviderId === provider.id}>{provider.name}</option>)}
                </select>
              </div>
              <div class="field">
                <label>模型</label>
                <select name="image_model" id="image-model-select">
                  {props.imageModel ? <option value={props.imageModel}>{props.imageModel}</option> : <option value="">请先选择供应商</option>}
                </select>
              </div>
            </div>
            <div class="inline"><button class="primary" type="submit">保存</button></div>
          </form>
        </Section>

        <Section
          title="Webhook"
          description="将外部服务的事件推送到微信。在此集中管理 Webhook 配置。"
          dot="sky"
        >
          <div class="grid">
            {props.webhooks.length ? props.webhooks.map((webhook) => {
              const w = webhook as Record<string, unknown>;
              const source = String(w.source || "generic");
              return (
                <div class="row">
                  <div style="display:flex;align-items:flex-start;gap:8px">
                    <span style="font-size:18px;margin-top:-1px;color:var(--ink-muted);opacity:0.5" aria-hidden="true">→</span>
                    <div>
                      <strong style="margin-bottom:4px">{String(w.name || w.path || "Webhook")}</strong>
                      <div class="meta">
                        <Chip
                          color={source === "github" ? "brand" : source === "tapd" ? "amber" : "blue"}
                          text={displayWebhookSource(source)}
                        />
                        <span class="code-inline">/{String(w.path || "")}</span>
                      </div>
                    </div>
                  </div>
                  <div class="inline">
                    <button class="button" type="button" data-delete-webhook={String(w.path || "")}>删除</button>
                  </div>
                </div>
              );
            }) : <EmptyState text="暂无 Webhook。" />}
          </div>

          <div class="inline" style="margin-top:12px">
            <button id="toggle-webhook-form" class="button" type="button">+ 添加 Webhook</button>
          </div>

          <div id="webhook-form-wrap" class="card hidden" style="margin-top:12px">
              <form id="webhook-form" class="stack">
                <strong>添加 Webhook</strong>
                <div class="form-grid">
                  <div class="field"><label>路径</label><input name="path" placeholder="daily-news" /></div>
                  <div class="field"><label>名称</label><input name="name" placeholder="每日新闻" /></div>
                  <div class="field">
                    <label>消息来源</label>
                    <select name="source">
                      <option value="generic">通用</option>
                      <option value="github">GitHub</option>
                      <option value="tapd">TAPD</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>验证方式</label>
                    <select name="verify">
                      <option value="bearer">Bearer 令牌</option>
                      <option value="hmac-sha256">HMAC-SHA256 签名</option>
                      <option value="none">无验证</option>
                    </select>
                  </div>
                  <div class="field full">
                    <label>目标机器人</label>
                    <div id="webhook-bot-ids" class="stack" style="gap:6px">
                      {props.bots.length ? props.bots.map((bot) => (
                        <label class="row" style="padding:8px 12px">
                          <span>
                            <strong style="margin:0">{bot.bot_id}</strong>
                            <span class="meta" style="font-size:12px">{bot.remark || ""}</span>
                          </span>
                          <input type="checkbox" name="bot_id" value={bot.bot_id} />
                        </label>
                      )) : <p class="muted">暂无可选机器人，请先登录。</p>}
                    </div>
                  </div>
                  <div class="field full">
                    <label>消息模板（可选）</label>
                    <input name="template" placeholder="💰 新订单 ${data.object.amount_total}" />
                    <span class="muted" style="font-size:12px;margin-top:4px">用 <code>$&#123;字段路径&#125;</code> 提取 JSON 字段，支持算术如 <code>$&#123;price * qty&#125;</code></span>
                  </div>
                </div>
                <div class="inline">
                  <button class="primary" type="submit">保存 Webhook</button>
                  <button class="button" type="button" id="cancel-webhook-form">取消</button>
                </div>
              </form>
          </div>
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

function toggleForm(btnId, modalId, cancelBtnId) {
  const btn = document.getElementById(btnId);
  const modal = document.getElementById(modalId);
  const cancelBtn = document.getElementById(cancelBtnId);
  if (!btn || !modal) return;
  var addLabel = btn.textContent;
  var closeLabel = "− 收起";

  function showModal() {
    modal.classList.remove("hidden");
    btn.textContent = closeLabel;
  }
  function hideModal() {
    modal.classList.add("hidden");
    btn.textContent = addLabel;
  }

  btn.addEventListener("click", function () {
    modal.classList.contains("hidden") ? showModal() : hideModal();
  });
  if (cancelBtn) cancelBtn.addEventListener("click", hideModal);
}
toggleForm("toggle-provider-form", "provider-form-wrap", "cancel-provider-form");
toggleForm("toggle-model-form", "model-form-wrap", "cancel-model-form");
toggleForm("toggle-webhook-form", "webhook-form-wrap", "cancel-webhook-form");

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
  const form = event.currentTarget;
  const body = formToObject(form);
  body.bot_ids = Array.from(form.querySelectorAll('[name="bot_id"]:checked')).map((cb) => cb.value);
  delete body.bot_id;
  await api("POST", "/api/webhooks", body);
  location.reload();
});

document.getElementById("image-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = formToObject(form);
  await api("PATCH", "/api/image-config", {
    image_provider_id: body.image_provider_id || null,
    image_model: body.image_model || null,
  });
  location.reload();
});

async function loadImageModels(providerId, currentModel) {
  const sel = document.getElementById("image-model-select");
  if (!sel) return;
  if (!providerId) {
    sel.innerHTML = '<option value="">请先选择供应商</option>';
    return;
  }
  sel.innerHTML = '<option value="">加载中…</option>';
  try {
    const res = await api("GET", "/api/providers/" + encodeURIComponent(providerId) + "/models");
    const models = res.models || [];
    sel.innerHTML = models.map((m) => '<option value="' + m.id + '"' + (m.id === currentModel ? ' selected' : '') + '>' + m.name + '</option>').join('');
  } catch (err) {
    sel.innerHTML = '<option value="">加载失败，请重试</option>';
  }
}

// Load image models on page load if a provider is already selected
if (adminData.imageProviderId) {
  loadImageModels(adminData.imageProviderId, adminData.imageModel);
}

document.getElementById("image-provider-select")?.addEventListener("change", function () {
  loadImageModels(this.value, "");
});

document.querySelectorAll("[data-unbind-bot]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!confirm("确定要解除绑定吗？")) return;
    await api("POST", "/bot/" + button.dataset.unbindBot + "/unbind");
    location.reload();
  });
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
      return '<label class="row"><span><strong>' + model.name + '</strong><span class="meta"><span class="code-inline">' + model.id + '</span></span></span><input type="checkbox" data-import-model="' + model.id + '" data-import-name="' + model.name + '" ' + (checked ? 'disabled' : '') + '></label>';
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

function displayProviderType(type: string): string {
  return type === "anthropic" ? "Anthropic 原生" : type === "openai-compat" ? "OpenAI 兼容" : type;
}

function displayModelRole(role: string): string {
  if (role === "daily") return "日常";
  if (role === "complex") return "复杂推理";
  if (role === "extraction") return "记忆提取";
  return role;
}

function displayWebhookSource(source: string): string {
  if (source === "generic") return "通用";
  if (source === "github") return "GitHub";
  if (source === "tapd") return "TAPD";
  return source;
}

function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
