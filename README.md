# WeClaw Hub

微信消息中枢 — 三种方式部署，灵活选择。

| 方式 | 适用场景 | 命令 |
|------|---------|------|
| ☁️ **Cloudflare Workers** | 零成本、免运维 | `wrangler deploy` |
| 🐳 **Docker** | VPS/NAS 自托管 | `docker compose up -d` |
| 🥟 **Bun 直接运行** | 开发调试、快速尝鲜 | `bun run src/local/server.ts` |


[![CI](https://github.com/youfun/WeClaw-Hub/actions/workflows/ci.yml/badge.svg)](https://github.com/youfun/WeClaw-Hub/actions/workflows/ci.yml)
[![Docker Build](https://github.com/youfun/WeClaw-Hub/actions/workflows/docker-build.yml/badge.svg)](https://github.com/youfun/WeClaw-Hub/actions/workflows/docker-build.yml)

## 功能

### AI 对话
微信里直接和 Claude / GPT / Deepseek 对话，24h 在线。

- **智能选择模式**：根据问题复杂度自动切换轻量 / 复杂模型，省 token
- **手动指定模式**：固定使用某个模型，支持 `/model` 命令随时切换
- **多对话**：`/conv` 创建和管理独立对话，不同话题互不干扰
- **对话压缩**：`/compress` 自动摘要旧消息，减少 token 消耗
- **记忆系统**：AI 自动提取用户偏好和事实，跨对话持久化
- **生图**：`/draw` 命令生成图片（需配置支持 Images API 的供应商）
- **流式回复**：AI 回复逐字生成，降低等待感

### 定时任务
到了设定时间自动执行，无需手动触发。

- **每天定时**：选择时间，每天准时发送
- **间隔执行**：每 N 分钟 / 小时 / 天触发一次
- **自定义 Cron**：兼容标准 cron 表达式
- **失败重试**：自动指数退避，不影响其他任务

### Webhook 通知
把其他渠道推送的 webhook 消息转发到微信。

- GitHub / 通用 JSON — 内置解析器
- Bearer Token 验证
- 消息模板支持 `${字段路径}` 提取 JSON 字段

### 多账号管理
- 支持多个微信号同时在线，每个 Bot 独立配置
- 统一管理台：供应商、模型、Webhook 集中配置
- Bot 配置：AI 模式、模型选择、保活、定时任务、记忆管理
- Bot 启停：管理台一键启动/停止轮询

### Bridge 模式
WebSocket 连接本地服务到 Bot，实现自定义消息处理。

```
wss://你的域名/api/bridge/connect?bot_id=xxx
Authorization: Bearer 你的AUTH_TOKEN
```

## 部署

### 方式一：Cloudflare Workers（零成本）

> [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/youfun/weclaw-hub)
>
> 一键部署后仍需 `wrangler secret put AUTH_TOKEN` 设置管理台密钥。

也可手动部署：

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
# 或 OpenAI 兼容：
bunx wrangler secret put LLM_API_KEY
bunx wrangler secret put LLM_BASE_URL

# 6. 部署
bun run deploy
```

> [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/youfun/weclaw-hub)
>
> 一键部署后仍需 `wrangler secret put AUTH_TOKEN` 设置管理台密钥。

### 方式二：Docker（自托管）

```bash
# 1. 直接运行（推荐）
docker run -d -p 8787:8787 -e AUTH_TOKEN=your-secret-token -v ./data:/app/data ghcr.io/youfun/weclaw-hub:latest

# 2. 访问管理台
open http://localhost:8787/admin
```

**配置 AI 模型**（可选，使用环境变量）：

```bash
# Anthropic 原生
docker run -d -p 8787:8787 \
  -e AUTH_TOKEN=xxx \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  -v ./data:/app/data \
  ghcr.io/youfun/weclaw-hub:latest

# OpenAI 兼容（OpenRouter / StepFun 等）
docker run -d -p 8787:8787 \
  -e AUTH_TOKEN=xxx \
  -e LLM_BASE_URL=https://api.openai.com/v1 \
  -e LLM_API_KEY=sk-xxx \
  -e LLM_MODEL=gpt-4o \
  -v ./data:/app/data \
  ghcr.io/youfun/weclaw-hub:latest
```

> 也可先启动再登录管理台 → 供应商 → 手动添加 Provider，支持环境变量 `${VAR}` 插值。

**数据持久化**：SQLite 数据库保存在 `./data/weclaw.db`（Volume 挂载）。

**镜像来源**：GitHub Container Registry（[ghcr.io/youfun/weclaw-hub](https://github.com/youfun/WeClaw-Hub/pkgs/container/weclaw-hub)）。

**可用 Tag**：
- `latest` — main 分支或正式 release
- `dev` — dev 分支
- `0.4.0` — 指定版本

**从源码构建**（不推荐，除非需要自定义）：

```bash
# 1. 克隆仓库
git clone https://github.com/youfun/WeClaw-Hub.git
cd WeClaw-Hub

# 2. 启动
AUTH_TOKEN=your-secret-token docker compose up -d
```

### 方式三：Bun 直接运行

```bash
# 需要 Bun ≥ 1.0
bun install
AUTH_TOKEN=your-token bun run src/local/server.ts
```

使用 Bun 原生 SQLite，无需 Docker，一个命令启动。适合本地开发和快速验证。

### 本地开发

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars；至少需要 AUTH_TOKEN
bun run dev:local    # wrangler dev + 自动恢复轮询
bun run dev          # 仅启动 wrangler dev，不自动恢复
```

本地开发时 KV 和 DO 数据保存在本地（`--local` 模式）。

## 配置

### 必须配置

| 变量 | 说明 | CF 设置方式 | Docker/Bun |
|------|------|------------|------------|
| `AUTH_TOKEN` | 管理 API 认证密钥 | `wrangler secret put AUTH_TOKEN` | `-e AUTH_TOKEN=xxx` |

### AI 模型配置

**方式一（推荐）：管理台配置。** 登录后进入管理台 → 供应商 → 添加 Provider，填写 API Key 和接口地址。支持 Anthropic 和 OpenAI 兼容协议。添加后点「获取模型列表」自动拉取可用模型并导入。

**方式二：环境变量。**

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API 密钥 |
| `ANTHROPIC_BASE_URL` | 自定义 Anthropic 兼容端点（StepFun / OpenRouter 等） |
| `LLM_BASE_URL` | OpenAI 兼容接口地址 |
| `LLM_API_KEY` | OpenAI 兼容接口的 API 密钥 |
| `LLM_MODEL` | 覆盖默认模型 |

### 可选配置

| 变量 | 说明 |
|------|------|
| `SYSTEM_PROMPT` | 自定义系统提示词 |
| `WECLAW_HUB_VERSION` | 版本标识（Docker 版自动设为 `0.4.0-local`） |

## 使用

### 登录绑定

1. 访问管理台 → 绑定账号，进入扫码页面
2. 点击「刷新二维码」，用微信扫描
3. 确认授权，Bot 自动上线

支持绑定多个微信账号，每个独立管理。

### 微信对话命令

| 命令 | 说明 |
|------|------|
| 直接输入文字 | 与 AI 对话 |
| `/help` | 查看命令列表 |
| `/status` | 查看 Bot 状态 |
| `/clear` | 清空当前对话历史 |
| `/conv` | 查看对话列表 |
| `/conv new [标题]` | 新建对话 |
| `/conv <序号>` | 切换对话 |
| `/conv rename <序号> <标题>` | 重命名对话 |
| `/conv delete <序号>` | 删除对话 |
| `/compress` | 压缩当前对话历史 |
| `/mode` | 查看当前模式（智能/手动） |
| `/mode family` | 切换到智能选择 |
| `/mode manual` | 切换到手动指定 |
| `/model list` | 查看可用模型 |
| `/model <名称或编号>` | 切换模型 |
| `/memory` | 查看 Bot 记忆 |
| `/tasks` | 查看定时任务 |
| `/draw <描述>` | AI 生图 |

### 管理台

访问 `/admin`，用 `AUTH_TOKEN` 认证后进入：

- **机器人**：查看所有已登录 Bot 状态，启动/停止轮询
- **供应商**：管理 API 密钥和接口地址，自动拉取模型列表
- **模型**：为模型设置角色（日常 / 复杂 / 记忆提取）
- **生图**：配置图片生成模型
- **Webhook**：创建和管理 Webhook 配置
- **Bot 配置**：进入单个 Bot 设置页面，管理 AI 模式、定时任务、记忆

## 架构

```
                    ┌──────────────────────────┐
  GitHub ──webhook──┤                          │
                    │   Cloudflare / Docker     │──── iLink API ──── 微信
  自定义 ───webhook──┤   Worker / Bun Server     │
                    │   (src/app.ts)            │
  Bridge ──ws──────►│                          │
                    │   ┌──────────────────┐   │
                    │   │ BotSession         │   │    KV / SQLite
                    │   │ (per bot)          │◄──┼──► (BACKENDS)
                    │   │                    │   │
                    │   └──────────────────┘   │
                    └──────────────────────────┘

  CF 版：DurableObject + KV (Cloudflare)
  本地版：Bun SQLite + Adapter (~300 行，接口对齐)
```

- **入口**：Hono App（`src/app.ts`），共享于 CF 和本地
- **BotSession**：每个 Bot 一个实例，Alarm 驱动长轮询，消息分派（Bridge → Backend → Agent）
- **适配器层**：`src/adapter-interfaces.ts` 定义抽象接口，`src/local/adapters/` 实现本地版本
- **存储**：CF 用 KV + DO SQLite，本地用 Bun SQLite

## API

所有管理端点需要 `Authorization: Bearer <AUTH_TOKEN>`。

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `POST /webhooks/:path` | 接收 Webhook 事件 |
| `GET /admin` | 管理台 |
| `GET /admin/bot/:id` | Bot 配置页 |
| `POST /bot/:id/start` | 启动 Bot 轮询 |
| `POST /bot/:id/stop` | 停止 Bot 轮询 |
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
| `GET /api/providers/:id/models` | 拉取供应商模型列表 |
| `PUT /api/providers/:id` | 更新供应商 |
| `DELETE /api/providers/:id` | 删除供应商 |
| `GET /api/models` | 列出模型 |
| `POST /api/models` | 添加模型 |
| `PATCH /api/image-config` | 修改生图配置 |
| `ALL /bot/:id/*` | Bot DO 代理（任务、记忆、设置等） |

## 路线图

- [ ] **定时任务 Agent 动作**：`AI 生成`（让 AI 按提示词生成消息）和 `抓取并分析`（定时抓取网页，AI 总结后推送）
- [ ] **MCP 端点**：支持接入外部工具，扩展机器人能力
- [ ] **Webhook 增强**：支持更多内置解析器（Stripe、PagerDuty 等）

## License

MIT

---

智能选择模式（family）思路来源于 [Agemily](https://github.com/sofish/agemily) — 根据问题复杂度自动切换轻量/复杂模型。