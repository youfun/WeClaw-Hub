/** @jsxImportSource hono/jsx */

import type { Child } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";

type LayoutProps = {
  title: string;
  subtitle?: string;
  children: Child;
};

export function renderPage(props: LayoutProps): Response {
  const body = renderToString(<Layout {...props} />);
  return new Response(`<!DOCTYPE html>${body}`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function Layout({ title, subtitle, children }: LayoutProps) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{styles}</style>
      </head>
      <body>
        <div class="shell">
          <header class="hero">
            <div>
              <p class="eyebrow">WeClaw Hub</p>
              <h1>{title}</h1>
              {subtitle ? <p class="subtitle">{subtitle}</p> : null}
            </div>
            <nav class="topnav">
              <a href="/login">登录</a>
              <a href="/admin">管理台</a>
            </nav>
          </header>
          <main class="content">{children}</main>
        </div>
      </body>
    </html>
  );
}

export function Section(props: { title: string; description?: string; children: Child }) {
  return (
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>{props.title}</h2>
          {props.description ? <p>{props.description}</p> : null}
        </div>
      </div>
      <div class="panel-body">{props.children}</div>
    </section>
  );
}

export function EmptyState(props: { text: string }) {
  return <p class="muted">{props.text}</p>;
}

const styles = `
:root {
  --bg: #f4efe6;
  --bg-accent: #efe0cb;
  --panel: rgba(255, 252, 247, 0.82);
  --panel-strong: #fffaf2;
  --ink: #1f1a17;
  --muted: #6f6258;
  --line: rgba(74, 57, 44, 0.12);
  --brand: #b6542d;
  --brand-deep: #7f3014;
  --ok: #2f6a48;
  --warn: #8a5a14;
  --shadow: 0 24px 60px rgba(61, 39, 22, 0.12);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(circle at top left, rgba(230, 154, 90, 0.28), transparent 28%),
    radial-gradient(circle at top right, rgba(180, 84, 45, 0.12), transparent 26%),
    linear-gradient(180deg, var(--bg) 0%, #fbf7f2 55%, #f3ebe0 100%);
  min-height: 100vh;
}
a { color: inherit; }
.shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px 0 56px;
}
.hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 24px 28px;
  border: 1px solid var(--line);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255,255,255,0.74), rgba(239,224,203,0.74));
  box-shadow: var(--shadow);
}
.eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 12px;
  color: var(--brand-deep);
}
h1 {
  margin: 0;
  font-size: clamp(34px, 5vw, 56px);
  line-height: 0.98;
}
.subtitle {
  margin: 14px 0 0;
  max-width: 720px;
  color: var(--muted);
  line-height: 1.6;
}
.topnav {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.topnav a,
.button,
button {
  border: 1px solid rgba(127, 48, 20, 0.16);
  background: rgba(255, 250, 242, 0.92);
  color: var(--ink);
  padding: 11px 16px;
  border-radius: 999px;
  text-decoration: none;
  font: inherit;
}
.button.primary,
button.primary {
  background: linear-gradient(135deg, var(--brand), var(--brand-deep));
  color: white;
}
.content {
  margin-top: 24px;
  display: grid;
  gap: 18px;
}
.panel {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--panel);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.panel-head {
  padding: 22px 24px 10px;
}
.panel-head h2 {
  margin: 0;
  font-size: 24px;
}
.panel-head p,
.muted {
  color: var(--muted);
}
.panel-body {
  padding: 0 24px 24px;
}
.grid,
.cards {
  display: grid;
  gap: 14px;
}
.cards.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cards.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.card,
.row {
  border: 1px solid var(--line);
  background: var(--panel-strong);
  border-radius: 18px;
  padding: 16px 18px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.row strong,
.card strong {
  display: block;
  margin-bottom: 6px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
  font-size: 14px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--line);
  background: rgba(182, 84, 45, 0.08);
}
.badge.ok { color: var(--ok); background: rgba(47, 106, 72, 0.08); }
.badge.warn { color: var(--warn); background: rgba(138, 90, 20, 0.08); }
.stack { display: grid; gap: 10px; }
.inline { display: flex; flex-wrap: wrap; gap: 10px; }
.code {
  font-family: "Consolas", "SFMono-Regular", monospace;
  font-size: 13px;
}
.form-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.field {
  display: grid;
  gap: 8px;
}
.field.full { grid-column: 1 / -1; }
label { font-size: 14px; color: var(--muted); }
input, textarea, select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 14px;
  font: inherit;
  background: white;
}
textarea { min-height: 110px; resize: vertical; }
.qr-box {
  min-height: 220px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(127, 48, 20, 0.26);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(239,224,203,0.5));
}
.footer-note { font-size: 13px; color: var(--muted); }
@media (max-width: 860px) {
  .hero,
  .row { flex-direction: column; }
  .cards.two,
  .cards.three,
  .form-grid { grid-template-columns: 1fr; }
  .shell { width: min(100% - 20px, 1180px); }
}
`;