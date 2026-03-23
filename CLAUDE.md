# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# WeClaw Hub

微信消息中樞 — 部署在 Cloudflare Workers 上，零服務器成本。

## 項目概述

WeClaw Hub 是一個統一的微信消息網關，功能分三層：
1. **通知聚合** — 把 SaaS webhook（GitHub/Stripe等）轉成微信消息
2. **AI Bot** — 微信裡直接和 Claude/GPT 對話，24h 在線
3. **Gateway** — 多後端路由、本地 Bridge 接入、多賬號管理

## 技術棧

- **Runtime**: Cloudflare Workers + Durable Objects + KV
- **Language**: TypeScript
- **Package Manager**: Bun（開發時用）
- **Deploy**: `wrangler deploy`

## 開發命令

```bash
bun install          # 安裝依賴
bun run dev          # 本地開發（wrangler dev，http://localhost:8787）
bun run deploy       # 部署到 Cloudflare
```

本地開發時 `AUTH_TOKEN` 使用 `wrangler.toml` 裡的 `dev-test-token`，KV/DO 數據存在本地（`--local` 自動創建）。

## 架構說明

### Worker 入口（`src/index.ts`）

HTTP 路由分三類：
- **公開路由**: `/health`、`/webhooks/:path`（Bearer/HMAC-SHA256 驗簽）
- **管理路由**（Bearer `AUTH_TOKEN`）: `/login`、`/login/qr`、`/login/status`、`/api/*`、`/bot/*`
- 登錄相關路由有滑窗限速（`BOT_SESSION` DO 的特殊實例 `__weclaw_hub_login_rate_limit__`）

### BotSession Durable Object（`src/BotSession.ts`）

每個微信 bot 賬號一個 DO 實例，by name（`ilink_bot_id`）。

**Alarm 驅動長輪詢**：登錄後 `setAlarm(+100ms)` → `alarm()` 調 `getUpdates` → 成功立即 `setAlarm(+100ms)`，失敗回退 2s（前3次）/ 30s（之後）；errcode `-14` = Session Expired，暫停 1h。

**消息分派優先級**（`handleMessage`）：
1. Bridge（WebSocket 連接中） → 轉發給 bridge client，等 reply/typing 消息
2. Backend webhook routing → 按 `routing_rules` 匹配，`fan_out` 控制廣播 vs 最高優先級
3. 內建 Agent（Claude + 命令）

**DO SQLite Schema**（`SCHEMA` 常量）：
- `kv(key, value)` — 通用 KV，存 `credentials`、`get_updates_buf`、`paused_until`
- `context_tokens(user_id, token, updated_at)` — 微信 context_token 緩存
- `chat_history(id, user_id, role, content, created_at)` — 對話歷史（上限 100 條/user）
- `typing_tickets(user_id, ticket, updated_at)` — typing ticket 緩存（5 分鐘 TTL）
- `rate_limits(key, bucket, count)` — 滑窗限速

### KV 命名空間（`BACKENDS`）

- `bots` — JSON array，登錄過的 bot ID 列表
- `backend:{id}` — `Backend` 對象（webhook_url、routing_rules、priority、fan_out）
- `webhook:{path}` — `WebhookConfig` 對象（source、verify、bot_id、to_user_id）
- `llm:models` — `CustomModel[]`，模型列表
- `llm:active` — 當前激活的模型 ID

### iLink 協議（`src/ilink.ts`）

- 長輪詢端點 `ilink/bot/getupdates`，25s 超時（CF Workers fetch ~30s 上限）；正常 timeout 返回 `DOMException` `TimeoutError`，視為空響應繼續輪詢
- 請求頭需帶 `AuthorizationType: ilink_bot_token` 和隨機 `X-WECHAT-UIN`（uint32 → decimal → base64）
- 登錄後 `baseurl` 可能是區域節點，優先使用，fallback `https://ilinkai.weixin.qq.com`
- 微信消息必須帶 `context_token` 回傳（從 incoming 消息緩存到 `context_tokens` 表）
- **AES key 解碼有雙重解碼陷阱**（見 `docs/KB_WeixinClaw_iLink_Integration.md`）

### LLM 配置

**優先級**：`llm:models` KV 中的自定義模型 → env vars 回退

自定義模型 `apiKey` 支持 `${ENV_VAR}` 插值（見 `resolveApiKey`）。

env var 方案：
- Anthropic（默認）: `ANTHROPIC_API_KEY`
- OpenAI-compat: `LLM_BASE_URL` + `LLM_API_KEY`（OpenRouter 等）
- `LLM_MODEL` 可覆蓋默認模型；`LLM_API_KEY` 優先於 `ANTHROPIC_API_KEY`

### 命令路由（`src/router.ts`）

`/help`、`/status`、`/clear`、`/model [list|<id>|<n>]`、`/claude <msg>`，其餘純文本直接走 agent。

### Webhook 解析（`src/webhooks/`）

`source` 字段決定 parser：`github`其他均走 `generic`。
新增 source 只需在 `src/webhooks/` 新建文件並在 `index.ts` 分派。

