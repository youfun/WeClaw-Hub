/** @jsxImportSource hono/jsx */

import { renderToString } from "hono/jsx/dom/server";

export function landingPage(): Response {
  const body = renderToString(<Landing />);
  return new Response(`<!DOCTYPE html>${body}`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function Landing() {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>WeClaw Hub — 微信消息中樞</title>
        <meta name="description" content="三种方式部署：Cloudflare Workers 零成本、Docker 自托管、Bun 直接运行。聚合通知、AI 对话、多账号管理，一站式微信消息网关。" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <style>{styles}</style>
      </head>
      <body>
        <header class="hero">
          <nav class="topnav">
            <a href="/guide">使用说明</a>
            <a href="/admin">管理台</a>
            <a href="/login">绑定账号</a>
          </nav>
          <div class="hero-content">
            <p class="hero-eyebrow fade-up">WeClaw Hub</p>
            <h1 class="hero-title fade-up" style="animation-delay:0.1s">
              你的微信，<br />
              <span class="hero-accent">AI 了</span>
            </h1>
            <p class="hero-text fade-up" style="animation-delay:0.2s">
              三种方式部署：Cloudflare 零成本、Docker 自托管、Bun 直接运行。<br />
              聚合 SaaS 通知、AI 对话、多账号管理，一站式微信消息网关。
            </p>
            <div class="hero-cta fade-up" style="animation-delay:0.3s">
              <a href="/guide" class="cta-primary">开始使用</a>
              <a href="/admin" class="cta-secondary">管理台 →</a>
            </div>
          </div>
          <div class="hero-decor" aria-hidden="true">
            <span class="hero-decor-ring" />
            <span class="hero-decor-ring" />
            <span class="hero-decor-dot" />
          </div>
        </header>
        <main>
          <section class="features">
            <div class="features-inner">
              <div class="feature fade-up" style="animation-delay:0.1s">
                <span class="feature-num">01</span>
                <h3 class="feature-title">通知聚合</h3>
                <p class="feature-text">
                  GitHub、Stripe 等 SaaS 的 webhook 消息，直接推送到你的微信。支持 Bearer 令牌验证，安全可靠。
                </p>
              </div>
              <div class="feature fade-up" style="animation-delay:0.2s">
                <span class="feature-num">02</span>
                <h3 class="feature-title">AI 对话</h3>
                <p class="feature-text">
                  在微信里直接和 Claude、GPT 对话，24 小时在线。智能模型选择、多对话管理、历史压缩。
                </p>
              </div>
              <div class="feature fade-up" style="animation-delay:0.3s">
                <span class="feature-num">03</span>
                <h3 class="feature-title">消息网关</h3>
                <p class="feature-text">
                  多后端路由、本地 Bridge 接入、多账号统一管理。Cloudflare / Docker / Bun 三种方式运行。
                </p>
              </div>
            </div>
          </section>
          <section class="steps-section">
            <div class="steps-inner">
              <h2 class="steps-title fade-up">三种方式部署</h2>
              <div class="steps">
                <div class="step fade-up" style="animation-delay:0.1s">
                  <span class="step-num" style="background:#b6542d">☁️</span>
                  <div>
                    <h4>Cloudflare Workers</h4>
                    <p>零成本部署在 Cloudflare 边缘网络。点击按钮一键部署，无需服务器。</p>
                    <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/youfun/weclaw-hub" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="32" /></a>
                  </div>
                </div>
                <div class="step fade-up" style="animation-delay:0.2s">
                  <span class="step-num" style="background:#0ea5e9">🐳</span>
                  <div>
                    <h4>Docker 自托管</h4>
                    <p>VPS / NAS / 本地服务器上运行，数据和日志持久化。GitHub Actions 自动构建。</p>
                    <p style="font-size:0.8125rem;color:var(--ink-muted);margin-top:4px"><code>docker compose up -d</code></p>
                  </div>
                </div>
                <div class="step fade-up" style="animation-delay:0.3s">
                  <span class="step-num" style="background:#22c55e">🥟</span>
                  <div>
                    <h4>Bun 直接运行</h4>
                    <p>开发调试、快速尝鲜。原生 SQLite，零外部依赖，一行命令启动。</p>
                    <p style="font-size:0.8125rem;color:var(--ink-muted);margin-top:4px"><code>bun run src/local/server.ts</code></p>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section class="steps-section" style="background:var(--bg);border-top:1px solid var(--line)">
            <div class="steps-inner">
              <h2 class="steps-title fade-up">快速开始</h2>
              <div class="steps">
                <div class="step fade-up" style="animation-delay:0.1s">
                  <span class="step-num">1</span>
                  <div>
                    <h4>选择部署方式</h4>
                    <p>Cloudflare Workers 零成本、Docker VPS 自托管、Bun 本地开发，三种方式任选。</p>
                  </div>
                </div>
                <div class="step fade-up" style="animation-delay:0.2s">
                  <span class="step-num">2</span>
                  <div>
                    <h4>扫码绑定</h4>
                    <p>在微信中扫码，绑定机器人账号。支持多账号管理。</p>
                  </div>
                </div>
                <div class="step fade-up" style="animation-delay:0.3s">
                  <span class="step-num">3</span>
                  <div>
                    <h4>配置模型</h4>
                    <p>在管理台添加 AI 供应商和模型，一键拉取模型列表并导入。</p>
                  </div>
                </div>
                <div class="step fade-up" style="animation-delay:0.4s">
                  <span class="step-num">4</span>
                  <div>
                    <h4>开始使用</h4>
                    <p>在微信中和 AI 对话，或接收来自 SaaS 的 webhook 通知。</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
        <footer class="footer">
          <div class="footer-inner">
            <div class="footer-brand">
              <strong>WeClaw Hub</strong>
              <span class="footer-muted">Cloudflare · Docker · Bun</span>
            </div>
            <nav class="footer-links">
              <a href="/guide">使用说明</a>
              <a href="/admin">管理台</a>
              <a href="https://github.com/youfun/WeClaw-Hub" target="_blank" rel="noopener">GitHub</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}

const styles = `
:root {
  --bg: #f4efe6;
  --brand: #b6542d;
  --brand-deep: #7f3014;
  --ink: #1f1a17;
  --ink-muted: #6f6258;
  --surface: #fffaf2;
  --line: rgba(74, 57, 44, 0.1);
  --line-soft: rgba(74, 57, 44, 0.06);
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; }

/* ── Hero ── */

.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px clamp(24px, 5vw, 80px);
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(182,84,45,0.05) 0%, transparent 50%),
    var(--bg);
}

.hero::before {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 50%; height: 100%;
  background: radial-gradient(ellipse at 70% 50%, rgba(182,84,45,0.03) 0%, transparent 70%);
  pointer-events: none;
}

/* ── Top Nav ── */

.topnav {
  display: flex;
  gap: 20px;
  justify-content: flex-end;
  padding: 8px 0;
}

.topnav a {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ink-muted);
  text-decoration: none;
  padding: 6px 0;
  border-bottom: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.topnav a:hover {
  color: var(--ink);
  border-color: var(--brand);
}

/* ── Hero Content ── */

.hero-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 800px;
  padding: 60px 0;
}

.hero-eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--brand);
  margin: 0 0 16px;
  font-weight: 600;
}

.hero-title {
  font-family: "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
  font-weight: 900;
  font-size: clamp(2.5rem, 6vw, 5rem);
  line-height: 1.05;
  margin: 0 0 24px;
  color: var(--ink);
}

.hero-accent {
  color: var(--brand);
}

.hero-text {
  font-size: clamp(1rem, 1.5vw, 1.125rem);
  line-height: 1.7;
  color: var(--ink-muted);
  margin: 0 0 40px;
  max-width: 620px;
}

.hero-cta {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.cta-primary {
  display: inline-flex;
  align-items: center;
  padding: 14px 32px;
  background: var(--brand);
  color: white;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9375rem;
  border-radius: 999px;
  transition: background 0.2s, transform 0.2s;
}

.cta-primary:hover {
  background: var(--brand-deep);
  transform: translateY(-1px);
}

.cta-secondary {
  display: inline-flex;
  align-items: center;
  padding: 14px 24px;
  color: var(--ink);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9375rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  transition: border-color 0.2s, background 0.2s;
}

.cta-secondary:hover {
  border-color: var(--brand);
  background: rgba(182, 84, 45, 0.04);
}

/* ── Hero Decorative ── */

.hero-decor {
  position: absolute;
  top: 50%;
  right: clamp(20px, 8vw, 120px);
  width: min(360px, 38vw);
  height: min(360px, 38vw);
  transform: translateY(-50%);
  pointer-events: none;
  opacity: 0.35;
}

.hero-decor-ring {
  position: absolute;
  inset: 0;
  border: 1px dashed rgba(182, 84, 45, 0.14);
  border-radius: 50%;
}

.hero-decor-ring:last-of-type {
  inset: 18%;
  border-style: solid;
  border-color: rgba(182, 84, 45, 0.08);
}

.hero-decor-dot {
  position: absolute;
  top: 50%; left: 50%;
  width: 6px; height: 6px;
  background: var(--brand);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.6;
}

@media (max-width: 860px) {
  .hero-decor { display: none; }
}

/* ── Features ── */

.features {
  padding: clamp(60px, 8vw, 100px) clamp(24px, 5vw, 80px);
}

.features-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.feature {
  padding: 40px 32px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  transition: transform 0.2s, box-shadow 0.2s;
}

.feature:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(61, 39, 22, 0.06);
}

.feature-num {
  font-family: "JetBrains Mono", "SF Mono", "Consolas", monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--brand);
  letter-spacing: 0.05em;
  display: block;
  margin-bottom: 20px;
  opacity: 0.7;
}

.feature-title {
  font-family: "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
  font-weight: 700;
  font-size: 1.375rem;
  margin: 0 0 12px;
  color: var(--ink);
}

.feature-text {
  color: var(--ink-muted);
  line-height: 1.65;
  margin: 0;
  font-size: 0.9375rem;
}

/* ── Steps ── */

.steps-section {
  padding: clamp(60px, 8vw, 100px) clamp(24px, 5vw, 80px);
  background: var(--surface);
  border-top: 1px solid var(--line);
}

.steps-inner {
  max-width: 800px;
  margin: 0 auto;
}

.steps-title {
  font-family: "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
  font-weight: 700;
  font-size: clamp(1.5rem, 3vw, 2rem);
  margin: 0 0 48px;
  color: var(--ink);
}

.steps {
  display: grid;
  gap: 32px;
}

.step {
  display: flex;
  gap: 24px;
  position: relative;
}

.step:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 19px;
  top: 48px;
  bottom: -32px;
  width: 1px;
  background: var(--line);
}

.step-num {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--brand);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.step h4 {
  margin: 0 0 6px;
  font-size: 1.0625rem;
  font-weight: 600;
}

.step p {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.9375rem;
  line-height: 1.6;
}

/* ── Footer ── */

.footer {
  padding: 40px clamp(24px, 5vw, 80px);
  border-top: 1px solid var(--line);
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.footer-brand {
  display: flex;
  gap: 12px;
  align-items: center;
}

.footer-brand strong {
  font-weight: 600;
  font-size: 0.9375rem;
}

.footer-muted {
  color: var(--ink-muted);
  font-size: 0.8125rem;
}

.footer-links {
  display: flex;
  gap: 24px;
}

.footer-links a {
  color: var(--ink-muted);
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.15s;
}

.footer-links a:hover {
  color: var(--ink);
}

/* ── Animations ── */

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-up {
  opacity: 0;
  animation: fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .fade-up {
    animation: none;
    opacity: 1;
  }
}

/* ── Responsive ── */

@media (max-width: 768px) {
  .hero {
    min-height: auto;
  }
  .hero-content {
    padding: 40px 0;
  }
  .features {
    padding: 48px 16px;
  }
  .feature {
    padding: 32px 24px;
  }
  .steps-section {
    padding: 48px 16px;
  }
  .footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
`;