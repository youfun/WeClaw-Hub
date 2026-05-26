/** @jsxImportSource hono/jsx */

import type { Child } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";

type LayoutProps = {
  title: string;
  subtitle?: string;
  activeNav?: "guide" | "admin" | "login";
  children: Child;
};

export function renderPage(props: LayoutProps): Response {
  const body = renderToString(<Layout {...props} />);
  return new Response(`<!DOCTYPE html>${body}`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function Layout({ title, subtitle, activeNav, children }: LayoutProps) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
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
              <a href="/guide" class={activeNav === "guide" ? "nav-active" : ""}>使用说明</a>
              <a href="/admin" class={activeNav === "admin" ? "nav-active" : ""}>管理台</a>
              <a href="/login" class={activeNav === "login" ? "nav-active" : ""}>绑定账号</a>
            </nav>
          </header>
          <main class="content">{children}</main>
        </div>
      </body>
    </html>
  );
}

export function Section(props: {
  title: string;
  description?: string;
  /** dot color: "wechat" | "cf" | "brand" | "terminal" | "amber" | "sky" | "purple" */
  dot?: string;
  children: Child;
}) {
  const dotColor = props.dot ?? "brand";
  return (
    <section class="panel">
      <div class="panel-head">
        <span class={`dot dot-${dotColor}`} aria-hidden="true" />
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

export function StatusBadge(props: {
  status: "ok" | "warn";
  text: string;
  pulse?: boolean;
}) {
  return (
    <span class={`badge ${props.status}${props.pulse ? " badge-pulse" : ""}`}>
      {props.pulse ? <span class="badge-dot" aria-hidden="true" /> : null}
      {props.text}
    </span>
  );
}

export function Chip(props: {
  color?: "brand" | "terminal" | "purple" | "blue" | "wechat" | "amber";
  text: string;
}) {
  const c = props.color ?? "brand";
  return <span class={`chip chip-${c}`}>{props.text}</span>;
}

const styles = `
:root {
  --bg: #f4efe6;
  --bg-accent: #efe0cb;
  --panel: rgba(255, 252, 247, 0.82);
  --panel-strong: #fffaf2;
  --ink: #1f1a17;
  --ink-muted: #6f6258;
  --line: rgba(74, 57, 44, 0.12);
  --line-soft: rgba(74, 57, 44, 0.07);
  --brand: #b6542d;
  --brand-deep: #7f3014;
  --wechat: #07C160;
  --cf: #F38020;
  --amber: #d97706;
  --terminal: #10b981;
  --ok: #2f6a48;
  --warn-color: #8a5a14;
  --red: #dc2626;
  --sky: #0ea5e9;
  --purple: #7c3aed;
  --shadow: 0 16px 40px rgba(61, 39, 22, 0.08);
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  color: var(--ink);
  background:
    radial-gradient(ellipse 80% 60% at 15% 0%,   rgba(230,154,90,0.22), transparent 38%),
    radial-gradient(ellipse 50% 50% at 85% 15%,  rgba(182,84,45,0.10), transparent 32%),
    linear-gradient(180deg, var(--bg) 0%, #fbf7f2 48%, #f3ebe0 100%);
  min-height: 100vh;
}

a { color: inherit; }

/* ── Shell ── */
.shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 20px 0 40px;
}

/* ── Header ── */
.hero {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  padding: 20px 24px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: rgba(255,255,255,0.75);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow);
}

.eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 11px;
  color: var(--brand-deep);
  opacity: 0.8;
}

h1 {
  margin: 0;
  font-family: "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
  font-weight: 900;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1.05;
}

.subtitle {
  margin: 10px 0 0;
  max-width: 620px;
  color: var(--ink-muted);
  line-height: 1.55;
  font-size: 14px;
}

/* ── Top Nav ── */
.topnav {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.topnav a,
.button,
button {
  border: 1px solid rgba(127, 48, 20, 0.16);
  background: rgba(255, 250, 242, 0.92);
  color: var(--ink);
  padding: 8px 14px;
  border-radius: 999px;
  text-decoration: none;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.topnav a:hover,
.button:hover,
button:hover {
  background: rgba(182, 84, 45, 0.06);
}

.nav-active {
  background: linear-gradient(135deg, var(--brand), var(--brand-deep)) !important;
  color: white !important;
  border-color: transparent !important;
}

.button.primary,
button.primary {
  background: linear-gradient(135deg, var(--brand), var(--brand-deep));
  color: white;
  border-color: transparent;
  font-weight: 600;
}

.button.primary:hover,
button.primary:hover {
  opacity: 0.92;
}

/* ── Content ── */
.content {
  margin-top: 16px;
  display: grid;
  gap: 12px;
}

/* ── Panel ── */
.panel {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: rgba(255,255,255,0.80);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.panel-head {
  padding: 16px 20px 8px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.panel-head h2 {
  margin: 0;
  font-family: "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
  font-weight: 700;
  font-size: 20px;
}

.panel-head p,
.muted {
  color: var(--ink-muted);
}

.panel-head p {
  margin: 3px 0 0;
  font-size: 13px;
}

.panel-body {
  padding: 0 20px 20px;
}

/* ── Pulse Dot ── */
@keyframes pulse-dot {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%      { opacity: 0.45; transform: scale(1.15); }
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
  margin-top: 5px;
  animation: pulse-dot 2.4s ease-in-out infinite;
}
.dot-wechat  { background: var(--wechat); }
.dot-cf      { background: var(--cf); }
.dot-brand   { background: var(--brand); opacity: 0.6; }
.dot-terminal{ background: var(--terminal); }
.dot-amber   { background: var(--amber); opacity: 0.6; }
.dot-sky     { background: var(--sky); opacity: 0.5; }
.dot-purple  { background: var(--purple); opacity: 0.5; }

/* ── Status Stripe ── */
@keyframes signal-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.stripe-ok::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--wechat);
  border-radius: 0 2px 2px 0;
}

.stripe-ok::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(7,193,96,0.12) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: signal-shimmer 3s ease-in-out infinite;
  pointer-events: none;
}

.stripe-warn::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--amber);
  opacity: 0.4;
  border-radius: 0 2px 2px 0;
}

/* ── Grid & Cards ── */
.grid,
.cards {
  display: grid;
  gap: 10px;
}

.cards.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cards.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }

.card,
.row {
  border: 1px solid var(--line);
  background: var(--panel-strong);
  border-radius: 14px;
  padding: 12px 16px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.row strong,
.card strong {
  display: block;
  margin-bottom: 4px;
  font-weight: 600;
  font-size: 14px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--ink-muted);
  font-size: 12px;
}

/* ── Badge ── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--line);
  background: rgba(182, 84, 45, 0.06);
}

.badge.ok {
  color: var(--wechat);
  background: rgba(7, 193, 96, 0.08);
  border-color: rgba(7, 193, 96, 0.18);
}

.badge.warn {
  color: var(--amber);
  background: rgba(217, 119, 6, 0.08);
  border-color: rgba(217, 119, 6, 0.18);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%      { opacity: 0.45; transform: scale(1.15); }
}

.badge-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
}

.badge-pulse .badge-dot {
  animation: pulse-dot 2.4s ease-in-out infinite;
}

/* ── Chip (role / provider type) ── */
.chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid;
}

.chip-brand    { color: var(--brand);      background: rgba(182,84,45,0.07);   border-color: rgba(182,84,45,0.16); }
.chip-terminal { color: var(--terminal);   background: rgba(16,185,129,0.07);  border-color: rgba(16,185,129,0.16); }
.chip-purple   { color: var(--purple);     background: rgba(124,58,237,0.07);  border-color: rgba(124,58,237,0.16); }
.chip-blue     { color: #2563eb;           background: rgba(37,99,235,0.07);   border-color: rgba(37,99,235,0.16); }
.chip-wechat   { color: var(--wechat);     background: rgba(7,193,96,0.07);    border-color: rgba(7,193,96,0.16); }
.chip-amber    { color: var(--amber);      background: rgba(217,119,6,0.07);   border-color: rgba(217,119,6,0.16); }

/* ── Meta chip (inline code / tag in meta) ── */
.meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--line-soft);
  background: rgba(255,255,255,0.50);
}

/* ── Layout helpers ── */
.stack { display: grid; gap: 8px; }
.inline { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.code {
  font-family: "JetBrains Mono", "SF Mono", "Consolas", monospace;
  font-size: 13px;
}

.code-inline {
  font-family: "JetBrains Mono", "SF Mono", "Consolas", monospace;
  font-size: 12px;
  background: rgba(31,26,23,0.04);
  padding: 1px 5px;
  border-radius: 4px;
}

/* ── Forms ── */
.form-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 4px;
}

.field.full { grid-column: 1 / -1; }

label {
  font-size: 12px;
  color: var(--ink-muted);
  font-weight: 500;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 12px;
  font: inherit;
  font-size: 13px;
  background: white;
  color: var(--ink);
  transition: border-color 0.15s, box-shadow 0.15s;
}

input[type="checkbox"] {
  width: auto;
  height: auto;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  appearance: checkbox;
  -webkit-appearance: checkbox;
}

input[type="radio"] {
  width: auto;
  height: auto;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  appearance: radio;
  -webkit-appearance: radio;
}

input:not([type="checkbox"]):not([type="radio"]):focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: rgba(182, 84, 45, 0.40);
  box-shadow: 0 0 0 3px rgba(182, 84, 45, 0.08);
}

textarea { min-height: 110px; resize: vertical; }

select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%236f6258' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

/* ── QR ── */
.qr-box {
  position: relative;
  min-height: 200px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(127, 48, 20, 0.22);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(239,224,203,0.5));
}

.qr-expired-overlay {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background: rgba(31, 26, 23, 0.75);
  backdrop-filter: blur(2px);
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  z-index: 10;
  transition: background-color 0.15s;
}

.qr-expired-overlay:hover {
  background: rgba(31, 26, 23, 0.85);
}

.footer-note { font-size: 13px; color: var(--ink-muted); }

/* ── Modal overlay ── */
.hidden { display: none !important; }
.modal-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(31, 26, 23, 0.35);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: fade-in 0.15s ease-out;
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.modal-card {
  background: var(--panel-strong);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px 24px;
  width: min(560px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 32px 80px rgba(61, 39, 22, 0.18);
  animation: modal-in 0.2s ease-out;
}
@keyframes modal-in { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

.modal-card strong { display: block; margin-bottom: 12px; font-size: 16px; }

/* ── Breadcrumb ── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-muted);
  padding: 0 0 2px;
}
.breadcrumb a {
  text-decoration: none;
  color: var(--brand);
  font-weight: 500;
}
.breadcrumb a:hover { text-decoration: underline; }
.breadcrumb-sep { opacity: 0.4; }
.breadcrumb-current { color: var(--ink); font-weight: 600; }

/* ── Guide callout ── */
.callout {
  margin-top: 10px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(182, 84, 45, 0.04);
}
.callout strong { display: block; margin-bottom: 4px; font-weight: 600; font-size: 14px; }
.callout p { margin: 0; color: var(--ink-muted); font-size: 13px; line-height: 1.55; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(74,57,44,0.15); border-radius: 3px; }

/* ── Responsive ── */
@media (max-width: 860px) {
  .hero,
  .row { flex-direction: column; }
  .cards.two,
  .cards.three,
  .form-grid { grid-template-columns: 1fr; }
  .shell { width: min(100% - 20px, 1180px); }
}
`;
