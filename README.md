# WeClaw Hub

微信消息中枢 — 部署在 Cloudflare Workers 上，零服务器成本。

## 功能

**通知聚合** — 把 GitHub / Stripe 等 SaaS webhook 转成微信消息，手机即时收到。

**AI Bot** — 微信里直接和 Claude / GPT 对话，24h 在线。支持多模型切换、对话历史、自定义 system prompt。

**Gateway** — 多后端路由、本地 Bridge 接入（WebSocket）、多账号管理。

## 技术栈

Cloudflare Workers + Durable Objects + KV，TypeScript，零冷启动。

## 快速开始

### 部署

```bash
# 安装依赖
bun install

# 登录 Cloudflare
wrangler login

# 创建 KV namespace，把输出的 id 填入 wrangler.toml
bunx wrangler kv namespace create BACKENDS
bunx wrangler kv namespace create CONTACTS

# 设置 secrets
bunx wrangler secret put AUTH_TOKEN         # 管理 API 认证 token
bunx wrangler secret put ANTHROPIC_API_KEY  # Claude API key（选填）

# 部署
bun run deploy
```

### 本地开发

```bash
bun run dev    # http://localhost:8787
```

本地 `AUTH_TOKEN` 使用 `wrangler.toml` 里的 `dev-test-token`。

## 使用

### 微信登录

访问 `https://你的域名/login#你的AUTH_TOKEN`，扫码绑定微信账号。

### AI 对话

绑定后直接在微信给 bot 发消息即可。支持的命令：

| 命令 | 说明 |
|------|------|
| `/help` | 帮助 |
| `/model list` | 查看可用模型 |
| `/model <名称或编号>` | 切换模型 |
| `/clear` | 清空对话历史 |
| `/status` | 查看 bot 状态 |

纯文本消息直接发给 AI 对话。

### Webhook 通知

在管理页面创建 Webhook，把生成的 URL 填到 GitHub 等服务的 webhook 设置中。支持 HMAC-SHA256、Bearer Token 验证。

内置解析器：`github`、`generic`（通用）。新增 source 只需在 `src/webhooks/` 下新建文件。

### 保活

微信有 24 小时回复窗口限制。每个 bot 可在管理页面开启「保活」，在窗口过期前自动发送提醒消息，催促用户回复以续期。

### Bridge 模式

通过 WebSocket 连接本地服务到 bot，实现自定义消息处理：

```
ws://你的域名/api/bridge/connect?bot_id=xxx
Authorization: Bearer 你的AUTH_TOKEN
```

## 架构

```
                    ┌─────────────────────┐
  GitHub ──webhook──┤                     │
  Cloudflare Worker │──── iLink API ──── 微信
  自定义 ───webhook──┤   (src/index.ts)    │
                    │                     │
  Bridge ──ws──────►│   ┌─────────────┐   │
                    │   │ BotSession   │   │    KV
                    │   │ Durable Obj  │◄──┼──► (BACKENDS)
                    │   │ (per bot)    │   │
                    │   └─────────────┘   │
                    └─────────────────────┘
```

- **Worker 入口** — HTTP 路由、认证、webhook 验签、限速
- **BotSession DO** — 每个 bot 一个实例，alarm 驱动长轮询，消息分派（Bridge → Backend → Agent）
- **KV** — 存储 bot 列表、后端配置、webhook 配置、LLM 模型

## LLM 配置

**管理页面配置**（推荐）：在 `/login` 页面的「模型配置」卡片中添加，支持多模型、一键切换。

**环境变量回退**：

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude（默认） |
| `LLM_BASE_URL` | OpenAI 兼容接口地址（OpenRouter 等） |
| `LLM_API_KEY` | 优先于 `ANTHROPIC_API_KEY` |
| `LLM_MODEL` | 覆盖默认模型 |
| `SYSTEM_PROMPT` | 自定义系统提示词 |

自定义模型的 `apiKey` 支持 `${ENV_VAR}` 插值引用 wrangler secrets。

## API


主要端点：

```
GET  /health                    # 健康检查
GET  /api/bots                  # 列出所有 bot
GET  /bot/:id/status            # bot 状态
PATCH /bot/:id/settings         # bot 设置（保活等）
POST /api/send                  # 发送消息
GET  /api/webhooks              # 列出 webhook
POST /api/webhooks              # 创建 webhook
GET  /api/models                # 列出模型
POST /api/models                # 添加模型
```

所有管理端点需要 `Authorization: Bearer AUTH_TOKEN`。


## 路线图

### 近期

- [ ] **Claude Code 接入** — 通过 Bridge 模式将 Claude Code CLI 连接到微信，在手机上触发代码生成、代码审查、文件修改等任务，结果直接推送到微信
- [ ] **Codex 接入** — 接入 OpenAI Codex CLI，支持在微信中下发自然语言编程指令，Codex 在本地执行后将结果回传
- [ ] **Webhook 增强** — 支持更多内置 parser（Stripe、Linear、PagerDuty 等）



## License

MIT
