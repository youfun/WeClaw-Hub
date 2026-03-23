export function loginPage(authToken: string, origin: string): Response {
  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WeClaw Hub</title>
  <style>
    :root {
      --bg: #f4efe7;
      --card: rgba(255, 252, 246, 0.92);
      --ink: #1a1611;
      --muted: #5d5448;
      --line: rgba(55, 43, 28, 0.12);
      --accent: #0f8a5f;
      --danger: #b33a2b;
      --shadow: 0 18px 45px rgba(31, 23, 14, 0.12);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 138, 95, 0.12), transparent 30%),
        radial-gradient(circle at right 20%, rgba(211, 145, 84, 0.2), transparent 25%),
        linear-gradient(160deg, #f6f1e7 0%, #efe7db 48%, #f8f3ed 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 24px 56px;
      gap: 20px;
    }

    /* ── Login card ── */
    .shell {
      width: min(100%, 860px);
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 28px;
      overflow: hidden;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .intro, .panel { padding: 32px; }
    .intro {
      background: linear-gradient(145deg, rgba(255,255,255,0.55), rgba(248,239,225,0.78));
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 24px;
    }

    .eyebrow {
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-size: 12px;
      color: var(--muted);
    }

    h1 { margin: 10px 0 14px; font-size: clamp(34px, 5vw, 52px); line-height: 0.92; font-weight: 700; }

    p { margin: 0; line-height: 1.6; color: var(--muted); font-size: 15px; }

    .steps { display: grid; gap: 12px; }
    .step { display: grid; grid-template-columns: 28px 1fr; gap: 12px; align-items: start; padding: 12px 0; border-top: 1px solid rgba(55,43,28,0.08); }
    .step:first-child { border-top: 0; }
    .step b { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: rgba(15,138,95,0.1); color: var(--accent); font-size: 13px; }

    .panel { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
    .qr-frame { width: 296px; min-height: 296px; display: grid; place-items: center; background: white; border-radius: 24px; border: 1px solid rgba(55,43,28,0.08); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6), 0 18px 35px rgba(27,21,14,0.08); padding: 18px; }
    .qr-frame svg { width: 100%; height: auto; display: block; }

    .status { min-height: 28px; text-align: center; font-size: 15px; color: var(--muted); }
    .status.ok { color: var(--accent); }
    .status.err { color: var(--danger); }

    .result { width: 100%; background: rgba(250,245,237,0.92); border: 1px solid rgba(55,43,28,0.08); border-radius: 18px; padding: 18px; display: none; font-size: 14px; line-height: 1.5; color: var(--muted); word-break: break-word; }
    .result code { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 12px; color: var(--ink); }

    .loading { width: 42px; height: 42px; border: 3px solid rgba(15,138,95,0.12); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 780px) {
      .shell { grid-template-columns: 1fr; }
      .intro { border-right: 0; border-bottom: 1px solid var(--line); }
      .intro, .panel { padding: 24px; }
      .qr-frame { width: min(100%, 296px); }
    }

    /* ── Shared card ── */
    .wh-card {
      width: min(100%, 860px);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 32px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .wh-hd {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 24px;
      gap: 12px;
    }

    .wh-hd h2 { margin: 4px 0 0; font-size: 22px; font-weight: 700; }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 10px; border: 1px solid var(--line); background: white; color: var(--ink); font-family: inherit; font-size: 14px; cursor: pointer; transition: opacity .15s; }
    .btn:hover { opacity: .75; }
    .btn-primary { background: var(--accent); color: white; border-color: transparent; }
    .btn-danger { color: var(--danger); border-color: rgba(179,58,43,.2); }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 7px; }

    /* Webhook items */
    .wh-empty { color: var(--muted); font-size: 14px; padding: 12px 0; }

    .wh-item { padding: 18px 0; border-top: 1px solid var(--line); }
    .wh-item:first-child { border-top: 0; }

    .wh-row1 { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .wh-name { font-weight: 600; font-size: 15px; }

    .badge { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .badge-github { background: #1a1611; color: #fff; }
    .badge-generic { background: rgba(15,138,95,.1); color: var(--accent); }

    .url-box { display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,.03); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; }
    .url-box code { flex: 1; font-family: "IBM Plex Mono", Consolas, monospace; font-size: 12px; word-break: break-all; }

    .wh-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .wh-meta-small { font-size: 12px; color: var(--muted); }

    /* Toggle switch */
    .toggle { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; font-size: 13px; color: var(--muted); user-select: none; }
    .toggle input { display: none; }
    .toggle .track { width: 36px; height: 20px; background: rgba(55,43,28,.2); border-radius: 99px; position: relative; transition: background .15s; flex-shrink: 0; }
    .toggle input:checked ~ .track { background: var(--accent); }
    .toggle .track::after { content: ''; position: absolute; width: 14px; height: 14px; background: white; border-radius: 50%; top: 3px; left: 3px; transition: transform .15s; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
    .toggle input:checked ~ .track::after { transform: translateX(16px); }

    /* New webhook form */
    .wh-form { background: rgba(250,245,237,0.7); border: 1px solid var(--line); border-radius: 18px; padding: 24px; margin-top: 20px; display: none; }
    .wh-form h3 { margin: 0 0 20px; font-size: 16px; }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field.full { grid-column: 1 / -1; }
    .field label { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
    .field input, .field select { padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; background: white; font-family: inherit; font-size: 14px; color: var(--ink); outline: none; }
    .field input:focus, .field select:focus { border-color: var(--accent); }
    .field .hint { font-size: 11px; color: var(--muted); }

    .secret-row { display: flex; gap: 8px; }
    .secret-row input { flex: 1; font-family: "IBM Plex Mono", Consolas, monospace; font-size: 12px; }

    .form-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

    /* Result banner */
    .wh-result { background: rgba(15,138,95,.08); border: 1px solid rgba(15,138,95,.2); border-radius: 12px; padding: 14px 16px; margin-top: 16px; display: none; }
    .wh-result .url-label { font-size: 12px; font-weight: 600; color: var(--accent); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em; }
    .wh-result code { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 13px; word-break: break-all; }
  </style>
</head>
<body>
  <!-- ── Login card ── -->
  <main class="shell">
    <section class="intro">
      <div>
        <div class="eyebrow">WeClaw Hub</div>
        <h1>绑定微信账号</h1>
        <p>登录页面由管理 Token 保护。二维码由本地渲染，不依赖第三方服务。</p>
      </div>
      <div class="steps">
        <div class="step"><b>1</b><p>点击右侧按钮获取二维码，再用微信扫描。</p></div>
        <div class="step"><b>2</b><p>状态变为「已扫描」后，在手机上确认绑定。</p></div>
        <div class="step"><b>3</b><p>保持页面打开，直到 Worker 保存凭证并开始轮询。</p></div>
      </div>
    </section>

    <section class="panel">
      <div class="qr-frame" id="qr">
        <button class="btn btn-primary" id="qr-btn" onclick="start()">获取登录二维码</button>
      </div>
      <div class="status" id="status">点击按钮获取二维码</div>
      <div class="result" id="result"></div>
    </section>
  </main>

  <!-- ── Bot management card ── -->
  <section class="wh-card">
    <div class="wh-hd">
      <div>
        <div class="eyebrow">机器人</div>
        <h2>已绑定账号</h2>
      </div>
      <button class="btn btn-primary" onclick="scrollToQR()">+ 绑定新账号</button>
    </div>
    <div id="bot-list"><div class="loading" style="width:24px;height:24px;border-width:2px"></div></div>
  </section>

  <!-- ── Webhook management card ── -->
  <section class="wh-card">
    <div class="wh-hd">
      <div>
        <div class="eyebrow">Webhooks</div>
        <h2>入站通知</h2>
      </div>
      <button class="btn btn-primary" onclick="openNewForm()">+ 新建</button>
    </div>

    <div id="wh-list"><div class="loading" style="width:28px;height:28px;border-width:2px"></div></div>

    <!-- New webhook form -->
    <div class="wh-form" id="wh-form">
      <h3>新建 Webhook</h3>
      <div class="form-grid">
        <div class="field">
          <label>名称</label>
          <input id="f-name" type="text" placeholder="GitHub 主仓库">
        </div>
        <div class="field">
          <label>来源类型</label>
          <select id="f-source">
            <option value="github">GitHub</option>
            <option value="generic" selected>通用</option>
          </select>
        </div>
        <div class="field full">
          <label>机器人（可多选，同时通知多个账号）</label>
          <div id="f-bots" style="display:flex;flex-wrap:wrap;gap:10px;padding:10px;border:1px solid var(--line);border-radius:10px;background:white;min-height:42px">
            <span style="color:var(--muted);font-size:13px">加载中…</span>
          </div>
        </div>
        <div class="field">
          <label>验证方式</label>
          <select id="f-verify">
            <option value="hmac-sha256">HMAC-SHA256（GitHub 风格）</option>
            <option value="bearer" selected>Bearer Token</option>
            <option value="none">无（仅测试用）</option>
          </select>
        </div>
        <div class="field">
          <label>密钥 / Token</label>
          <div class="secret-row">
            <input id="f-secret" type="text" placeholder="自动生成">
            <button class="btn btn-sm" onclick="regenSecret()">重新生成</button>
          </div>
          <span class="hint">用于验证入站请求</span>
        </div>
      </div>
      <div class="form-foot">
        <button class="btn" onclick="closeNewForm()">取消</button>
        <button class="btn btn-primary" onclick="submitNewWebhook()">创建</button>
      </div>
      <div class="wh-result" id="wh-result">
        <div class="url-label">Webhook 地址 — 复制到你的服务</div>
        <code id="wh-result-url"></code>
        <div class="url-label" style="margin-top:12px;color:var(--danger)">密钥 — 请立即保存，之后不再显示</div>
        <code id="wh-result-secret"></code>
      </div>
    </div>
  </section>

  <!-- ── Models card ── -->
  <section class="wh-card">
    <div class="wh-hd">
      <div>
        <div class="eyebrow">AI 模型</div>
        <h2>模型配置</h2>
      </div>
      <button class="btn btn-primary" onclick="openModelForm()">+ 添加模型</button>
    </div>

    <div id="model-list"><div class="loading" style="width:24px;height:24px;border-width:2px"></div></div>

    <div class="wh-form" id="model-form">
      <h3 id="model-form-title">添加模型</h3>
      <div class="form-grid">
        <div class="field">
          <label>名称（唯一，用于 /model 切换）</label>
          <input id="mf-displayname" type="text" placeholder="openai/gpt-4o">
        </div>
        <div class="field">
          <label>供应商</label>
          <select id="mf-provider" onchange="onProviderChange()">
            <option value="openai-compat">OpenAI Compatible</option>
            <option value="anthropic">Anthropic (Claude)</option>
          </select>
        </div>
        <div class="field">
          <label>模型 ID</label>
          <input id="mf-model" type="text" placeholder="gpt-4o">
          <span class="hint">发送给 API 的模型名称</span>
        </div>
        <div class="field full" id="mf-baseurl-wrap">
          <label>接入地址</label>
          <input id="mf-baseurl" type="text" placeholder="https://api.openai.com/v1">
          <span class="hint">OpenAI Compatible 供应商的 base URL</span>
        </div>
        <div class="field">
          <label>API Key</label>
          <input id="mf-apikey" type="password" placeholder="sk-... 或 \${ENV_VAR}">
          <span class="hint">支持 \${ENV_VAR} 引用 wrangler 环境变量</span>
        </div>
        <div class="field">
          <label>最大输出 Token</label>
          <input id="mf-maxtokens" type="number" placeholder="4096（默认）" min="1" max="131072">
        </div>
      </div>
      <div class="form-foot">
        <button class="btn" onclick="closeModelForm()">取消</button>
        <button class="btn btn-primary" onclick="submitModel()">保存</button>
      </div>
    </div>
  </section>

  <script>
    const AUTH = ${JSON.stringify(authToken)};
    const ORIGIN = ${JSON.stringify(origin)};

    // ── Shared helpers ──────────────────────────────────────────────

    function esc(v) {
      return String(v ?? "").replace(/[&<>"']/g, c =>
        ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
    }

    async function api(method, path, body) {
      const opts = { method, headers: { Authorization: "Bearer " + AUTH } };
      if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
      const r = await fetch(path, opts);
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "请求失败（" + r.status + "）");
      return data;
    }

    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }

    // ── Bot management ──────────────────────────────────────────────

    async function loadBots() {
      const el = document.getElementById("bot-list");
      try {
        const bots = await api("GET", "/api/bots");
        renderBotList(bots);
      } catch (e) {
        el.innerHTML = '<p class="wh-empty">加载失败：' + esc(e.message) + '</p>';
      }
    }

    function botStatusText(b) {
      if (b.error) return "不可达";
      if (!b.logged_in) return "未登录";
      if (b.paused) return "已暂停";
      if (b.polling) return "轮询中";
      return "已停止";
    }

    function renderBotList(bots) {
      const el = document.getElementById("bot-list");
      if (!bots.length) {
        el.innerHTML = '<p class="wh-empty">暂无机器人，请先扫码登录。</p>';
        return;
      }
      el.innerHTML = bots.map(b => {
        const status = botStatusText(b);
        const ka = !!b.keepalive;
        const remark = b.remark || "";
        return \`
<div class="wh-item" id="bot-\${esc(b.bot_id)}">
  <div class="wh-row1">
    <span class="wh-name">\${remark ? esc(remark) : esc(b.bot_id)}</span>
    \${remark ? '<span class="wh-meta-small" style="font-family:monospace">\${esc(b.bot_id)}</span>' : ''}
    \${b.ilink_user_id ? '<span class="wh-meta-small">用户 ID：\${esc(b.ilink_user_id)}</span>' : ''}
  </div>
  <div class="wh-actions">
    <span class="wh-meta-small">状态：\${esc(status)}</span>
    <span class="wh-meta-small">Bridge：\${b.bridge_sessions ?? 0}</span>
    <label class="toggle" title="\${ka ? '保活已开启' : '保活已关闭'}">
      <input type="checkbox" \${ka ? "checked" : ""} onchange="toggleKeepalive('\${esc(b.bot_id)}', this.checked)">
      <span class="track"></span>
      <span>保活\${ka ? "已开启" : "已关闭"}</span>
    </label>
    <button class="btn btn-sm" onclick="editRemark('\${esc(b.bot_id)}', '\${esc(remark)}')">备注</button>
  </div>
</div>\`;
      }).join("");
    }

    async function toggleKeepalive(botId, enabled) {
      try {
        await api("PATCH", "/bot/" + encodeURIComponent(botId) + "/settings", { keepalive: enabled });
        const item = document.getElementById("bot-" + botId);
        if (item) {
          const lbl = item.querySelector(".toggle span:last-child");
          if (lbl) lbl.textContent = "保活" + (enabled ? "已开启" : "已关闭");
        }
      } catch (e) {
        alert("操作失败：" + e.message);
        loadBots();
      }
    }

    function editRemark(botId, current) {
      const remark = prompt("设置备注（留空则清除）：", current);
      if (remark === null) return;  // cancelled
      api("PATCH", "/bot/" + encodeURIComponent(botId) + "/settings", { remark })
        .then(() => loadBots())
        .catch(e => alert("保存失败：" + e.message));
    }

    function scrollToQR() {
      document.querySelector(".shell").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ── QR Login ────────────────────────────────────────────────────

    let qrcode = "", polling = false;

    function setStatus(text, type) {
      const n = document.getElementById("status");
      n.textContent = text;
      n.className = type ? "status " + type : "status";
    }

    function showQrButton(label) {
      document.getElementById("qr").innerHTML =
        '<button class="btn btn-primary" id="qr-btn" onclick="start()">' + label + '</button>';
    }

    async function fetchJsonLegacy(path) {
      const r = await fetch(path, { headers: { Authorization: "Bearer " + AUTH } });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "请求失败（" + r.status + "）");
      return data;
    }

    function renderResult(data) {
      const el = document.getElementById("result");
      el.style.display = "block";
      el.innerHTML = [
        "<strong>机器人 ID：</strong> <code>" + esc(data.ilink_bot_id) + "</code>",
        "<br><strong>用户 ID：</strong> <code>" + esc(data.ilink_user_id) + "</code>",
        "<br><strong>Base URL：</strong> <code>" + esc(data.baseurl) + "</code>",
        "<br><br><strong>状态：</strong> <code>/bot/" + esc(data.ilink_bot_id) + "/status</code>",
      ].join("");
    }

    async function start() {
      const qrNode = document.getElementById("qr");
      qrNode.innerHTML = '<div class="loading" aria-label="加载中"></div>';
      setStatus("正在获取二维码...");
      try {
        const data = await fetchJsonLegacy("/login/qr");
        if (!data?.qrcode || !data?.qrcode_svg) throw new Error("无效的二维码数据");
        qrcode = data.qrcode;
        qrNode.innerHTML = data.qrcode_svg;
        setStatus("请用微信扫描二维码...");
        void poll();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "获取二维码失败", "err");
        showQrButton("重试");
      }
    }

    async function poll() {
      if (polling) return;
      polling = true;
      while (true) {
        try {
          const data = await fetchJsonLegacy("/login/status?qrcode=" + encodeURIComponent(qrcode));
          if (data.status === "confirmed") {
            setStatus("登录成功，开始轮询。", "ok");
            renderResult(data);
            polling = false;
            loadBots();
            loadWebhooks();
            return;
          }
          if (data.status === "scaned") setStatus("已扫描，请在手机上确认...");
          else if (data.status === "expired") {
            setStatus("二维码已过期，请点击刷新。", "err");
            showQrButton("刷新二维码");
            polling = false;
            return;
          } else setStatus("等待扫描...");
        } catch (e) {
          setStatus((e instanceof Error ? e.message : "网络错误") + "，重试中...", "err");
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // ── Webhook management ──────────────────────────────────────────

    function sourceBadge(source) {
      const s = (source || "generic").toLowerCase();
      const cls = s === "github" ? "badge-github" : "badge-generic";
      return '<span class="badge ' + cls + '">' + esc(s) + '</span>';
    }

    function whUrl(path) {
      return ORIGIN + "/webhooks/" + encodeURIComponent(path);
    }

    async function loadWebhooks() {
      const el = document.getElementById("wh-list");
      el.innerHTML = '<div class="loading" style="width:24px;height:24px;border-width:2px"></div>';
      try {
        const list = await api("GET", "/api/webhooks");
        renderWebhookList(list);
      } catch (e) {
        el.innerHTML = '<p class="wh-empty">加载失败：' + esc(e.message) + '</p>';
      }
    }

    function renderWebhookList(list) {
      const el = document.getElementById("wh-list");
      if (!list.length) {
        el.innerHTML = '<p class="wh-empty">暂无 Webhook，点击「新建」创建第一个。</p>';
        return;
      }
      el.innerHTML = list.map(c => {
        const url = whUrl(c.path);
        return \`
<div class="wh-item" id="whi-\${esc(c.path)}">
  <div class="wh-row1">
    \${sourceBadge(c.source)}
    <span class="wh-name">\${esc(c.name)}</span>
    <span class="wh-meta-small">→ \${(c.bot_ids || []).map(id => esc(id)).join(', ')}</span>
  </div>
  <div class="url-box">
    <code>\${esc(url)}</code>
    <button class="btn btn-sm" onclick="copyText('\${esc(url)}')">复制</button>
  </div>
  <div class="wh-actions">
    <label class="toggle" title="\${c.enabled ? '已启用' : '已禁用'}">
      <input type="checkbox" \${c.enabled ? "checked" : ""} onchange="toggleWebhook('\${esc(c.path)}', this.checked)">
      <span class="track"></span>
      <span>\${c.enabled ? "已启用" : "已禁用"}</span>
    </label>
    <span class="wh-meta-small">验证：\${esc(c.verify)}</span>
    <button class="btn btn-sm" onclick="resetWebhookSecret('\${esc(c.path)}')">重置密钥</button>
    <button class="btn btn-sm btn-danger" onclick="deleteWebhook('\${esc(c.path)}')">删除</button>
  </div>
  <div class="wh-result" id="whr-\${esc(c.path)}" style="display:none;margin-top:10px">
    <div class="url-label" style="color:var(--danger)">新密钥 — 请立即保存，之后不再显示</div>
    <code id="whrs-\${esc(c.path)}"></code>
  </div>
</div>\`;
      }).join("");
    }

    async function toggleWebhook(path, enabled) {
      try {
        await api("PATCH", "/api/webhooks/" + encodeURIComponent(path), { enabled });
        const item = document.getElementById("whi-" + path);
        if (item) {
          const lbl = item.querySelector(".toggle span:last-child");
          if (lbl) lbl.textContent = enabled ? "已启用" : "已禁用";
        }
      } catch (e) {
        alert("操作失败：" + e.message);
        loadWebhooks();
      }
    }

    async function resetWebhookSecret(path) {
      if (!confirm("重置后旧密钥立即失效，确认继续？")) return;
      try {
        const { secret } = await api("POST", "/api/webhooks/" + encodeURIComponent(path) + "/reset-secret");
        const banner = document.getElementById("whr-" + path);
        const code   = document.getElementById("whrs-" + path);
        if (banner && code) { code.textContent = secret; banner.style.display = "block"; }
      } catch (e) {
        alert("重置失败：" + e.message);
      }
    }

    async function deleteWebhook(path) {
      if (!confirm("确认删除 Webhook「" + path + "」？")) return;
      try {
        await api("DELETE", "/api/webhooks/" + encodeURIComponent(path));
        loadWebhooks();
      } catch (e) {
        alert("删除失败：" + e.message);
      }
    }

    // ── New webhook form ────────────────────────────────────────────

    function randHex(n) {
      const b = new Uint8Array(n);
      crypto.getRandomValues(b);
      return [...b].map(x => x.toString(16).padStart(2,"0")).join("").slice(0, n * 2);
    }

    function regenSecret() {
      document.getElementById("f-secret").value = randHex(16);
    }

    async function loadBotsForForm() {
      const wrap = document.getElementById("f-bots");
      wrap.innerHTML = '<span style="color:var(--muted);font-size:13px">加载中…</span>';
      try {
        const bots = await api("GET", "/api/bots");
        const loggedIn = bots.filter(b => b.logged_in);
        if (!loggedIn.length) {
          wrap.innerHTML = '<span style="color:var(--muted);font-size:13px">暂无已登录的机器人</span>';
          return;
        }
        wrap.innerHTML = loggedIn.map(b => \`
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" name="bot_ids" value="\${esc(b.bot_id)}" style="width:14px;height:14px;accent-color:var(--accent)">
            \${esc(b.bot_id)}
          </label>\`).join("");
      } catch {
        wrap.innerHTML = '<span style="color:var(--danger);font-size:13px">加载机器人失败</span>';
      }
    }

    function openNewForm() {
      const form = document.getElementById("wh-form");
      form.style.display = "block";
      document.getElementById("wh-result").style.display = "none";
      if (!document.getElementById("f-secret").value) regenSecret();
      loadBotsForForm();
      form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function closeNewForm() {
      document.getElementById("wh-form").style.display = "none";
    }

    async function submitNewWebhook() {
      const name   = document.getElementById("f-name").value.trim();
      const source = document.getElementById("f-source").value;
      const verify = document.getElementById("f-verify").value;
      const secret = document.getElementById("f-secret").value.trim();

      const botIds = [...document.querySelectorAll('#f-bots input[type=checkbox]:checked')]
        .map(el => el.value);
      if (!botIds.length) { alert("请至少选择一个机器人。"); return; }

      try {
        const { config } = await api("POST", "/api/webhooks", {
          name: name || undefined,
          source,
          bot_ids: botIds,
          verify,
          secret: secret || undefined,
        });

        const url = whUrl(config.path);
        const resultEl = document.getElementById("wh-result");
        document.getElementById("wh-result-url").textContent = url;
        document.getElementById("wh-result-secret").textContent = config.secret ?? "";
        resultEl.style.display = "block";
        resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

        document.getElementById("f-name").value = "";
        regenSecret();

        loadWebhooks();
      } catch (e) {
        alert("创建失败：" + e.message);
      }
    }

    void loadBots();
    void loadWebhooks();

    // ── Models ──────────────────────────────────────────────────────

    let editingModelId = null;  // null = adding, string = editing

    function providerBadge(provider) {
      return provider === "anthropic"
        ? '<span class="badge badge-github">Anthropic</span>'
        : '<span class="badge badge-generic">OpenAI Compat</span>';
    }

    async function loadModels() {
      const el = document.getElementById("model-list");
      el.innerHTML = '<div class="loading" style="width:24px;height:24px;border-width:2px"></div>';
      try {
        const data = await api("GET", "/api/models");
        renderModelList(data);
      } catch (e) {
        el.innerHTML = '<p class="wh-empty">加载失败：' + esc(e.message) + '</p>';
      }
    }

    function renderModelList(data) {
      const el = document.getElementById("model-list");
      const { models, activeName } = data;
      if (!models.length) {
        el.innerHTML = '<p class="wh-empty">暂无模型，点击「添加模型」配置第一个。</p>';
        return;
      }
      el.innerHTML = models.map(m => {
        const isActive = m.displayName === activeName;
        return \`
<div class="wh-item" id="mi-\${esc(m.displayName)}">
  <div class="wh-row1">
    \${providerBadge(m.provider)}
    <span class="wh-name">\${esc(m.displayName)}</span>
    \${isActive ? '<span class="badge badge-generic">当前</span>' : ''}
    <span class="wh-meta-small" style="font-family:monospace">\${esc(m.model)}</span>
  </div>
  \${m.baseUrl ? '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">' + esc(m.baseUrl) + '</div>' : ''}
  <div class="wh-actions">
    <span class="wh-meta-small">max tokens: \${m.maxOutputTokens ?? 4096}</span>
    <span class="wh-meta-small">· API Key: \${m.hasApiKey ? '✓' : '<span style="color:var(--danger)">未设置</span>'}</span>
    <button class="btn btn-sm" onclick="setActiveModel('\${esc(m.displayName)}')" \${isActive ? 'hidden' : ''}>设为默认</button>
    <button class="btn btn-sm" onclick="editModel('\${esc(m.displayName)}')">编辑</button>
    <button class="btn btn-sm btn-danger" onclick="deleteModel('\${esc(m.displayName)}')">删除</button>
  </div>
</div>\`;
      }).join("");
    }

    function onProviderChange() {
      const provider = document.getElementById("mf-provider").value;
      document.getElementById("mf-baseurl-wrap").style.display =
        provider === "openai-compat" ? "flex" : "none";
    }

    function openModelForm(model) {
      editingModelId = model ? model.displayName : null;
      document.getElementById("model-form-title").textContent = model ? "编辑模型" : "添加模型";
      document.getElementById("mf-displayname").value = model?.displayName ?? "";
      document.getElementById("mf-provider").value = model?.provider ?? "openai-compat";
      document.getElementById("mf-model").value = model?.model ?? "";
      document.getElementById("mf-baseurl").value = model?.baseUrl ?? "";
      document.getElementById("mf-apikey").value = "";
      document.getElementById("mf-maxtokens").value = model?.maxOutputTokens ?? "";
      onProviderChange();
      const form = document.getElementById("model-form");
      form.style.display = "block";
      form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function closeModelForm() {
      document.getElementById("model-form").style.display = "none";
      editingModelId = null;
    }

    async function submitModel() {
      const displayName = document.getElementById("mf-displayname").value.trim();
      const provider    = document.getElementById("mf-provider").value;
      const model       = document.getElementById("mf-model").value.trim();
      const baseUrl     = document.getElementById("mf-baseurl").value.trim();
      const apiKey      = document.getElementById("mf-apikey").value.trim();
      const maxTokensRaw = document.getElementById("mf-maxtokens").value.trim();
      const maxOutputTokens = maxTokensRaw ? parseInt(maxTokensRaw, 10) : undefined;

      if (!displayName) { alert("请填写名称。"); return; }
      if (!model)       { alert("请填写模型 ID。"); return; }
      if (provider === "openai-compat" && !baseUrl) { alert("OpenAI Compatible 供应商需要填写接入地址。"); return; }

      const body = { displayName, provider, model,
        baseUrl: provider === "openai-compat" ? baseUrl : undefined,
        apiKey: apiKey || undefined,
        maxOutputTokens,
      };

      try {
        if (editingModelId) {
          await api("PUT", "/api/models/" + encodeURIComponent(editingModelId), body);
        } else {
          await api("POST", "/api/models", body);
        }
        closeModelForm();
        loadModels();
      } catch (e) {
        alert("保存失败：" + e.message);
      }
    }

    async function setActiveModel(name) {
      try {
        await api("PUT", "/api/models/active", { name });
        loadModels();
      } catch (e) {
        alert("切换失败：" + e.message);
      }
    }

    async function editModel(name) {
      try {
        const data = await api("GET", "/api/models");
        const m = data.models.find(x => x.displayName === name);
        if (m) openModelForm(m);
      } catch (e) {
        alert("加载失败：" + e.message);
      }
    }

    async function deleteModel(id) {
      if (!confirm("确认删除模型「" + id + "」？")) return;
      try {
        await api("DELETE", "/api/models/" + encodeURIComponent(id));
        loadModels();
      } catch (e) {
        alert("删除失败：" + e.message);
      }
    }

    void loadModels();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
