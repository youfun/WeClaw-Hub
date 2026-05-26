# WeClaw Hub

微信消息中枢 — 部署在 Cloudflare Workers 上，零服务器成本。

## 功能

### AI 对话
微信里直接和 Claude / GPT 对话，24h 在线。

- **智能选择模式**：根据问题复杂度自动切换轻量 / 复杂模型，省 token
- **手动指定模式**：固定使用某个模型，支持 `/model` 命令随时切换
- **对话历史**：保留最近 100 条消息（约 50 轮），`/clear` 清空
- **记忆系统**：AI 自动提取用户偏好和事实，跨对话持久化
- **生图**：`/draw` 命令生成图片（需配置支持 Images API 的供应商）
- **流式回复**：AI 回复逐字生成，降低等待感

### 定时任务
到了设定时间自动执行，无需手动触发。

- **每天定时**：选择时间，每天准时发送
- **间隔执行**：每 N 分钟 / 小时 / 天触发一次
- **自定义 Cron**：兼容标准 cron 表达式
- **执行动作**：发送固定消息
- **失败重试**：自动指数退避，不影响其他任务

### Webhook 通知
把 SaaS 服务的事件实时推送到微信。

- GitHub / TAPD / 通用 JSON — 内置解析器
- Bearer Token 验证
- 消息模板支持 `${字段路径}` 提取 JSON 字段
- 新增来源只需在 `src/webhooks/` 下新建文件

### 多账号管理
- 支持多个微信号同时在线，每个 Bot 独立配置
- 统一管理台：供应商、模型、Webhook 集中配置
- Bot 配置：AI 模式、模型选择、保活、定时任务、记忆管理

### Bridge 模式
WebSocket 连接本地服务到 Bot，实现自定义消息处理。

```
wss://你的域名/api/bridge/connect?bot_id=xxx
Authorization: Bearer 你的AUTH_TOKEN
```

## 配置变量

部署前必须配置以下变量。

### 必须配置

| 变量 | 说明 | 设置方式 |
|------|------|----------|
| `AUTH_TOKEN` | 管理 API 认证密钥，所有管理操作需要此 Token | `wrangler secret put AUTH_TOKEN` |

本地开发时不要把 `AUTH_TOKEN` 写入 `wrangler.toml`；复制 `.dev.vars.example` 为 `.dev.vars`，在本地文件中设置。

### AI 模型配置

**方式一（推荐）：管理台配置。** 登录后进入管理台 → 供应商 → 添加 Provider，填写 API Key 和接口地址。支持 Anthropic 和 OpenAI 兼容协议。

**方式二：环境变量。**

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API 密钥 |
| `LLM_BASE_URL` | OpenAI 兼容接口地址（OpenRouter 等） |
| `LLM_API_KEY` | OpenAI 兼容接口的 API 密钥 |
| `LLM_MODEL` | 覆盖默认模型（如 `gpt-4o`） |

`LLM_API_KEY` 优先于 `ANTHROPIC_API_KEY`。

### 可选配置

| 变量 | 说明 |
|------|------|
| `SYSTEM_PROMPT` | 自定义系统提示词 |

管理台添加的 Provider 的 `apiKey` 支持 `${ENV_VAR}` 插值引用 wrangler secrets。

## 快速开始

```bash
# 1. 安装依赖
bun install

# 2. 创建 KV namespace（记录输出的 id）
bunx wrangler kv namespace create BACKENDS
bunx wrangler kv namespace create CONTACTS

# 3. 把 KV id 填入 wrangler.toml

# 4. 设置密钥（必须）
bunx wrangler secret put AUTH_TOKEN

# 5. 设置 AI 密钥（至少选一个）
bunx wrangler secret put ANTHROPIC_API_KEY
# 或
bunx wrangler secret put LLM_API_KEY
bunx wrangler secret put LLM_BASE_URL

# 6. 部署
bun run deploy
```

### 本地开发

```bash
cp .dev.vars.example .dev.vars
# 按需编辑 .dev.vars；至少需要 AUTH_TOKEN
bun run dev:local    # 启动 wrangler dev，并自动 POST /api/bots/start-all 恢复已绑定 Bot 轮询
```

如果只想启动 Worker、不自动恢复轮询，也可以运行 `bun run dev`。

本地开发时 KV 和 DO 数据保存在本地（`--local` 模式）。`.dev.vars` 只用于本地且已被 `.gitignore` 忽略；线上密钥请用 `wrangler secret put`。

## 使用

### 登录绑定

1. 访问 `https://你的域名/login`，进入授权页面
2. 点击「刷新二维码」，用微信扫描
3. 确认授权，Bot 自动上线

支持绑定多个微信账号，每个独立管理。

### 微信对话命令

| 命令 | 说明 |
|------|------|
| 直接输入文字 | 与 AI 对话 |
| `/help` | 查看命令列表 |
| `/status` | 查看 Bot 状态 |
| `/clear` | 清空对话历史 |
| `/mode` | 查看当前模式 |
| `/mode family` | 切换到智能选择 |
| `/mode manual` | 切换到手动指定 |
| `/model list` | 查看可用模型 |
| `/model <名称或编号>` | 切换模型 |
| `/memory` | 查看 Bot 记忆 |
| `/tasks` | 查看定时任务 |
| `/draw <描述>` | AI 生图 |

### 管理台

访问 `https://你的域名/admin`，用 `AUTH_TOKEN` 认证后进入管理台。

- **机器人**：查看所有已登录 Bot 的状态
- **供应商**：管理 API 密钥和接口地址
- **模型**：为模型设置角色（日常 / 复杂 / 记忆提取）
- **生图**：配置图片生成模型
- **Webhook**：创建和管理 Webhook 配置
- **Bot 配置**：进入单个 Bot 的设置页面，管理 AI 模式、定时任务、记忆

## 架构

```
                    ┌─────────────────────┐
  GitHub ──webhook──┤                     │
                    │   Cloudflare Worker  │──── iLink API ──── 微信
  自定义 ───webhook──┤   (src/index.ts)    │
                    │                     │
  Bridge ──ws──────►│   ┌─────────────┐   │
                    │   │ BotSession   │   │    KV
                    │   │ Durable Obj  │◄──┼──► (BACKENDS)
                    │   │ (per bot)    │   │
                    │   └─────────────┘   │
                    └─────────────────────┘
```

- **Worker 入口**：HTTP 路由、认证、Webhook 验签、滑窗限速
- **BotSession DO**：每个 Bot 一个实例，Alarm 驱动长轮询，消息分派（Bridge → Backend → Agent）
- **KV**：存储 Bot 列表、后端配置、Webhook 配置、LLM 模型

## API

所有管理端点需要 `Authorization: Bearer <AUTH_TOKEN>`。

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `POST /webhooks/:path` | 接收 Webhook 事件 |
| `GET /admin` | 管理台 |
| `GET /admin/bot/:id` | Bot 配置页 |
| `GET /api/bots` | 列出所有 Bot 状态 |
| `POST /api/send` | 发送消息 |
| `GET /api/bridge/connect` | WebSocket Bridge |
| `GET /api/backends` | 列出后端配置 |
| `POST /api/backends` | 创建后端 |
| `GET /api/webhooks` | 列出 Webhook |
| `POST /api/webhooks` | 创建 Webhook |
| `PATCH /api/webhooks/:path` | 修改 Webhook |
| `DELETE /api/webhooks/:path` | 删除 Webhook |
| `GET /api/providers` | 列出 AI 供应商 |
| `POST /api/providers` | 添加供应商 |
| `GET /api/models` | 列出模型 |
| `POST /api/models` | 添加模型 |
| `PATCH /api/image-config` | 修改生图配置 |
| `ALL /bot/:id/*` | Bot DO 代理（任务、记忆、设置等） |

## 路线图

- [ ] **定时任务 Agent 动作**：`AI 生成`（让 AI 按提示词生成消息）和 `抓取并分析`（定时抓取网页，AI 总结后推送）
- [ ] **MCP 端点**：支持接入外部工具，扩展机器人能力
- [ ] **Webhook 增强**：支持更多内置解析器（Stripe、PagerDuty 等）

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/<你的用户名>/weclaw-hub)

> 将 `<你的用户名>` 替换为你的 GitHub 用户名。

点击按钮后 Cloudflare 自动完成：克隆仓库、创建 KV namespace、创建 Durable Object、构建并部署。

部署后需手动设置密钥：

```bash
bunx wrangler secret put AUTH_TOKEN        # 管理台认证（必须）
bunx wrangler secret put ANTHROPIC_API_KEY  # AI 密钥
```

## License

MIT

---

智能选择模式（family）思路来源于 [Agemily](https://github.com/sofish/agemily) — 根据问题复杂度自动切换轻量/复杂模型。
