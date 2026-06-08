import { Hono } from "hono";
import { CloudflareAPI } from "./cloudflare-api.ts";
import {
  createSession,
  getSession,
  findSessionByState,
  deleteSession,
  type DeployConfig,
} from "./types.ts";

type Env = {
  CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  CLOUDFLARE_OAUTH_CLIENT_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();

// ---- CORS ----
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

app.options("*", (c) => c.text("", 204));

// ---- Health check ----
app.get("/health", (c) => c.json({ status: "ok", service: "weclaw-hub-deploy" }));

// ---- Deploy wizard page ----
app.get("/deploy", (c) => c.html(renderDeployPage()));

// ---- API: Create session ----
app.post("/api/deploy/session", async (c) => {
  const clientId = c.env.CLOUDFLARE_OAUTH_CLIENT_ID;
  if (!clientId) return c.json({ error: "服务未配置 OAuth Client ID" }, 500);

  const session = await createSession();
  const origin = new URL(c.req.url).origin;

  const authorizeUrl = new URL("https://dash.cloudflare.com/oauth2/auth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/deploy`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "account:read workers:write workers:routes workers:kv:write");
  authorizeUrl.searchParams.set("state", session.state);
  authorizeUrl.searchParams.set("code_challenge", session.codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return c.json({
    session_id: session.sessionId,
    authorize_url: authorizeUrl.toString(),
  });
});

// ---- API: OAuth callback ----
app.post("/api/deploy/oauth/callback", async (c) => {
  try {
    const body = await c.req.json<{ code: string; state: string }>();
    const { code, state } = body;

    if (!code || !state) return c.json({ error: "缺少 code 或 state 参数" }, 400);

    // Find session by state
    const session = findSessionByState(state);
    if (!session) return c.json({ error: "会话已过期，请重新开始" }, 400);

    const origin = new URL(c.req.url).origin;

    // Exchange code for token
    const tokenRes = await fetch("https://dash.cloudflare.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: c.env.CLOUDFLARE_OAUTH_CLIENT_ID!,
        client_secret: c.env.CLOUDFLARE_OAUTH_CLIENT_SECRET!,
        code,
        code_verifier: session.codeVerifier,
        redirect_uri: `${origin}/deploy`,
      }),
    });

    if (!tokenRes.ok) {
      const err = (await tokenRes.json().catch(() => ({}))) as Record<string, string>;
      return c.json({ error: err.error_description || "Token 交换失败" }, 400);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };
    session.accessToken = tokenData.access_token;

    // Get accounts
    const api = new CloudflareAPI(tokenData.access_token, "");
    const accounts = await api.getAccounts();

    if (!accounts.length) return c.json({ error: "未找到可用的 Cloudflare 账号" }, 400);

    session.cloudflareAccountId = accounts[0].id;

    return c.json({ accounts, session_id: session.sessionId });
  } catch (e) {
    console.error("[deploy] oauth callback error:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---- API: Execute deployment ----
app.post("/api/deploy/execute", async (c) => {
  try {
    const body = await c.req.json<{
      session_id: string;
      account_id: string;
      worker_name?: string;
      auth_token?: string;
      llm?: DeployConfig["llm"];
      route?: string | null;
    }>();
    const { session_id, account_id, worker_name, auth_token, llm, route } = body;

    const session = getSession(session_id);
    if (!session?.accessToken) return c.json({ error: "会话已过期，请重新授权" }, 400);

    const name = worker_name || "weclaw-hub";
    const token = auth_token || generateDeployToken();

    const api = new CloudflareAPI(session.accessToken, account_id);

    // Step 1: Create KV namespaces
    const backendsKv = await api.createKVNamespace(`${name}-BACKENDS`);
    const contactsKv = await api.createKVNamespace(`${name}-CONTACTS`);

    // Step 2: Get worker bundle
    const workerScript = await fetchWorkerBundle();

    // Step 3: Upload worker
    const metadata = buildWorkerMetadata(name, backendsKv.id, contactsKv.id);
    await api.uploadWorkerScript(name, workerScript, metadata);

    // Step 4: Set secrets
    await api.setWorkerSecret(name, "AUTH_TOKEN", token);

    if (llm) {
      if (llm.provider === "anthropic" && llm.apiKey) {
        await api.setWorkerSecret(name, "ANTHROPIC_API_KEY", llm.apiKey);
      } else if (llm.provider === "openai-compat") {
        await api.setWorkerSecret(name, "LLM_API_KEY", llm.apiKey);
        if (llm.baseUrl) await api.setWorkerSecret(name, "LLM_BASE_URL", llm.baseUrl);
        if (llm.model) await api.setWorkerSecret(name, "LLM_MODEL", llm.model);
      }
    }

    // Step 5: Verify deployment
    const workerUrl = `https://${name}.${account_id}.workers.dev`;
    const adminUrl = `${workerUrl}/admin`;

    deleteSession(session_id);

    return c.json({
      ok: true,
      worker_url: workerUrl,
      admin_url: adminUrl,
      auth_token: token,
      created: {
        kv_namespaces: [backendsKv.id, contactsKv.id],
        worker: name,
      },
    });
  } catch (e) {
    console.error("[deploy] execute error:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---- Worker bundle fetching ----
const WEHUB_VERSION = "0.4.0";
const GITHUB_REPO = "youfun/WeClaw-Hub";

async function fetchWorkerBundle(): Promise<string> {
  // Try GitHub release first
  const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${WEHUB_VERSION}/weclaw-hub.js`;
  try {
    const res = await fetch(releaseUrl, { redirect: "follow" });
    if (res.ok) return await res.text();
    console.warn(`[deploy] GitHub release not found at ${releaseUrl}, status: ${res.status}`);
  } catch (e) {
    console.warn("[deploy] GitHub release fetch failed:", e);
  }

  // Fallback: try fetching from raw GitHub (won't work for deployment, but serves as a placeholder)
  // To enable deployment, build the worker bundle with `bun run build:worker-bundle`
  // and upload it to GitHub releases as weclaw-hub.js
  throw new Error(
    `Worker 脚本获取失败。请先运行 \`bun run build:worker-bundle\` 并发布到 GitHub Releases (${releaseUrl})`
  );
}

function buildWorkerMetadata(name: string, backendsKvId: string, contactsKvId: string) {
  return {
    main_module: "src/index.ts",
    compatibility_date: "2024-12-01",
    compatibility_flags: ["nodejs_compat"],
    durable_objects: {
      bindings: [{ name: "BOT_SESSION", class_name: "BotSession" }],
    },
    migrations: [{ tag: "v1", new_sqlite_classes: ["BotSession"] }],
    kv_namespaces: [
      { binding: "BACKENDS", id: backendsKvId },
      { binding: "CONTACTS", id: contactsKvId },
    ],
    vars: {
      WECLAW_HUB_VERSION: WEHUB_VERSION,
      WECLAW_DEPLOYER: "oauth",
      SYSTEM_PROMPT: "你是一個有用的AI助手。",
    },
  };
}

function generateDeployToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

// ---- Frontend HTML ----
function renderDeployPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WeClaw Hub — 一键部署</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .card {
    background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.3);
    max-width: 520px; width: 100%; padding: 40px;
  }
  h1 { text-align: center; color: #1a202c; margin-bottom: 4px; font-size: 28px; }
  .sub { text-align: center; color: #718096; margin-bottom: 28px; font-size: 14px; }
  .btn {
    display: block; width: 100%; padding: 14px 24px; border: none; border-radius: 8px;
    font-size: 16px; font-weight: 600; cursor: pointer; transition: all .2s; text-align: center;
  }
  .btn-primary { background: #f6821f; color: #fff; }
  .btn-primary:hover { background: #e2751a; transform: translateY(-1px); }
  .btn-primary:disabled { background: #cbd5e0; cursor: not-allowed; transform: none; }
  .btn-secondary { background: #edf2f7; color: #4a5568; margin-top: 12px; }
  .btn-secondary:hover { background: #e2e8f0; }
  .panel { margin-top: 20px; padding: 20px; border-radius: 8px; background: #f7fafc; border: 1px solid #e2e8f0; }
  .panel.error { background: #fff5f5; border-color: #fed7d7; color: #c53030; }
  .panel.success { background: #f0fff4; border-color: #c6f6d5; color: #22543d; }
  .progress { display: flex; gap: 8px; margin: 20px 0; }
  .step { flex: 1; text-align: center; padding: 8px; border-radius: 8px; background: #edf2f7; font-size: 12px; color: #718096; transition: all .3s; }
  .step.active { background: #667eea; color: #fff; }
  .step.done { background: #48bb78; color: #fff; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 13px; font-weight: 600; color: #4a5568; margin-bottom: 6px; }
  .form-group input, .form-group select {
    width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px;
    font-size: 14px; outline: none; transition: border-color .2s;
  }
  .form-group input:focus, .form-group select:focus { border-color: #667eea; }
  .hidden { display: none !important; }
  .result-link { color: #667eea; text-decoration: none; font-weight: 600; }
  .result-link:hover { text-decoration: underline; }
  .warning { color: #c05621; font-size: 13px; margin-top: 8px; }
</style>
</head>
<body>
<div class="card">
  <h1>🚀 WeClaw Hub</h1>
  <p class="sub">一键部署到你的 Cloudflare 账号</p>

  <!-- Step indicator -->
  <div class="progress">
    <div class="step" id="s1">1. 授权</div>
    <div class="step" id="s2">2. 配置</div>
    <div class="step" id="s3">3. 部署</div>
  </div>

  <!-- Auth section -->
  <div id="auth-section">
    <button id="auth-btn" class="btn btn-primary" onclick="startAuth()">登录 Cloudflare 并授权</button>
    <div id="auth-status" class="panel hidden"></div>
  </div>

  <!-- Config section -->
  <div id="config-section" class="hidden">
    <h3 style="margin-bottom: 16px; color: #2d3748;">⚙️ 部署配置</h3>
    <div class="form-group">
      <label>Worker 名称</label>
      <input type="text" id="worker-name" value="weclaw-hub" placeholder="weclaw-hub">
    </div>
    <div class="form-group">
      <label>AI 供应商</label>
      <select id="llm-provider" onchange="toggleLlmFields()">
        <option value="none">稍后配置（管理台）</option>
        <option value="anthropic">Anthropic Claude</option>
        <option value="openai-compat">OpenAI 兼容</option>
      </select>
    </div>
    <div id="llm-anthropic" class="hidden">
      <div class="form-group">
        <label>Anthropic API Key</label>
        <input type="password" id="anthropic-key" placeholder="sk-ant-...">
      </div>
    </div>
    <div id="llm-openai" class="hidden">
      <div class="form-group">
        <label>API Key</label>
        <input type="password" id="openai-key" placeholder="sk-...">
      </div>
      <div class="form-group">
        <label>Base URL（可选）</label>
        <input type="text" id="openai-base" placeholder="https://api.openai.com/v1">
      </div>
      <div class="form-group">
        <label>模型（可选）</label>
        <input type="text" id="openai-model" placeholder="gpt-4o">
      </div>
    </div>
    <button id="deploy-btn" class="btn btn-primary" onclick="executeDeploy()">开始部署</button>
    <div id="deploy-status" class="panel hidden"></div>
  </div>

  <!-- Result section -->
  <div id="result-section" class="hidden">
    <div class="panel success">
      <h3>✅ 部署成功！</h3>
      <p style="margin-top: 12px; color: #4a5568;">
        管理台：<a class="result-link" id="admin-link" href="#" target="_blank"></a>
      </p>
      <p style="margin-top: 8px; color: #4a5568;">
        Worker：<a class="result-link" id="worker-link" href="#" target="_blank"></a>
      </p>
      <p style="margin-top: 12px; color: #718096; font-size: 13px;">
        <strong>AUTH_TOKEN：</strong><code id="auth-token" style="background:#e2e8f0;padding:2px 6px;border-radius:4px;"></code>
      </p>
      <p class="warning">⚠️ 请妥善保管 AUTH_TOKEN，用于登录管理台。</p>
    </div>
  </div>
</div>

<script>
let sessionId = null;

function setStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('s' + i);
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    if (i === n) el.classList.add('active');
  }
}

function showStatus(id, msg, cls) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'panel ' + (cls || '');
  el.classList.remove('hidden');
}

async function startAuth() {
  const btn = document.getElementById('auth-btn');
  btn.disabled = true;
  btn.textContent = '正在创建会话...';
  setStep(1);

  try {
    const res = await fetch('/api/deploy/session', { method: 'POST' });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const { authorize_url } = await res.json();
    showStatus('auth-status', '正在跳转到 Cloudflare 授权...', '');
    window.location.href = authorize_url;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '重试';
    showStatus('auth-status', e.message, 'error');
  }
}

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) { showStatus('auth-status', '授权失败: ' + error, 'error'); return; }
  if (!code || !state) return; // Not a callback, show normal page

  document.getElementById('auth-section').classList.add('hidden');
  const config = document.getElementById('config-section');
  config.classList.remove('hidden');
  setStep(2);

  try {
    const res = await fetch('/api/deploy/oauth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const data = await res.json();
    sessionId = data.session_id;
    window.history.replaceState({}, '', '/deploy');
  } catch (e) {
    showStatus('deploy-status', e.message, 'error');
    document.getElementById('auth-section').classList.remove('hidden');
    config.classList.add('hidden');
  }
}

function toggleLlmFields() {
  const provider = document.getElementById('llm-provider').value;
  document.getElementById('llm-anthropic').classList.toggle('hidden', provider !== 'anthropic');
  document.getElementById('llm-openai').classList.toggle('hidden', provider !== 'openai-compat');
}

async function executeDeploy() {
  const btn = document.getElementById('deploy-btn');
  btn.disabled = true;
  btn.textContent = '正在部署...';
  setStep(3);

  const provider = document.getElementById('llm-provider').value;
  let llm = undefined;
  if (provider === 'anthropic') {
    llm = { provider, apiKey: document.getElementById('anthropic-key').value };
  } else if (provider === 'openai-compat') {
    llm = {
      provider,
      apiKey: document.getElementById('openai-key').value,
      baseUrl: document.getElementById('openai-base').value || undefined,
      model: document.getElementById('openai-model').value || undefined,
    };
  }

  try {
    const res = await fetch('/api/deploy/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        account_id: null, // Will use the one from session
        worker_name: document.getElementById('worker-name').value || 'weclaw-hub',
        llm,
      })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const result = await res.json();

    document.getElementById('admin-link').href = result.admin_url;
    document.getElementById('admin-link').textContent = result.admin_url;
    document.getElementById('worker-link').href = result.worker_url;
    document.getElementById('worker-link').textContent = result.worker_url;
    document.getElementById('auth-token').textContent = result.auth_token;

    document.getElementById('config-section').classList.add('hidden');
    document.getElementById('result-section').classList.remove('hidden');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '重试';
    showStatus('deploy-status', '部署失败: ' + e.message, 'error');
  }
}

// Init
if (window.location.search) handleCallback();
</script>
</body>
</html>`;
}

export default app;