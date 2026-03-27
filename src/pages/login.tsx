/** @jsxImportSource hono/jsx */

import { EmptyState, Section, renderPage } from "./layout.tsx";

export function loginPage(origin: string): Response {
  return renderPage({
    title: "微信消息中枢",
    subtitle: "扫描二维码登录 WeClaw Hub，管理机器人、模型、定时任务与 Webhook 路由。",
    children: (
      <>
        <Section title="扫码登录" description="页面会自动请求二维码并轮询登录状态。">
          <div class="cards two">
            <div class="card stack">
              <div id="qr-box" class="qr-box">
                <EmptyState text="正在获取二维码…" />
              </div>
              <div class="inline">
                <button id="refresh-qr" class="primary" type="button">刷新二维码</button>
                <a class="button" href="/admin">进入管理台</a>
              </div>
            </div>
            <div class="card stack">
              <strong>登录流程</strong>
              <p class="muted">1. 点击“刷新二维码”</p>
              <p class="muted">2. 使用微信扫描</p>
              <p class="muted">3. 确认授权后自动完成机器人绑定</p>
              <p class="footer-note">登录接口：{origin}/login/qr 与 {origin}/login/status</p>
              <div id="login-status" class="badge warn">等待扫码</div>
            </div>
          </div>
        </Section>
        <script dangerouslySetInnerHTML={{
          __html: loginScript,
        }} />
      </>
    ),
  });
}

const loginScript = `
const qrBox = document.getElementById("qr-box");
const statusEl = document.getElementById("login-status");
const refreshBtn = document.getElementById("refresh-qr");
let timer = 0;

function setStatus(text, kind) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = "badge " + (kind || "warn");
}

async function poll(qrcode) {
  window.clearTimeout(timer);
  const res = await fetch("/login/status?qrcode=" + encodeURIComponent(qrcode));
  const data = await res.json();
  if (!res.ok) {
    setStatus("状态查询失败", "warn");
    return;
  }
  if (data.status === "confirmed") {
    setStatus("登录成功，正在跳转", "ok");
    window.setTimeout(() => window.location.assign("/admin"), 600);
    return;
  }
  const label = data.status === "scaned" ? "已扫码，等待确认" : data.status === "expired" ? "二维码已过期" : "等待扫码";
  setStatus(label, data.status === "expired" ? "warn" : "ok");
  timer = window.setTimeout(() => poll(qrcode), 1500);
}

async function loadQr() {
  window.clearTimeout(timer);
  setStatus("正在获取二维码", "warn");
  const res = await fetch("/login/qr");
  const data = await res.json();
  if (!res.ok) {
    qrBox.innerHTML = "<p class=\"muted\">二维码获取失败</p>";
    setStatus("二维码获取失败", "warn");
    return;
  }
  qrBox.innerHTML = data.qrcode_svg || "<p class=\"muted\">二维码为空</p>";
  setStatus("二维码已生成", "ok");
  poll(data.qrcode);
}

refreshBtn?.addEventListener("click", loadQr);
loadQr();
`;