# WeClaw-Hub Deploy Service

一键部署服务 — 用户通过 OAuth 授权 Cloudflare 后，自动创建 Worker/KV/DO 并部署 WeClaw Hub。

## 架构

```
用户浏览器                      Deploy Service                  Cloudflare API
    │                                │                               │
    ├─ GET /deploy ─────────────────►│                               │
    │◄── 部署向导页                   │                               │
    │                                │                               │
    ├─ POST /api/deploy/session ────►│                               │
    │◄── authorize_url               │                               │
    │                                │                               │
    ├─ 跳转 Cloudflare OAuth ────────────────────────────────────────►│
    │◄── 回调 /deploy?code=... ─────────────────────────────────────── │
    │                                │                               │
    ├─ POST /api/deploy/oauth/cb ───►│                               │
    │                                ├─ 交换 token ─────────────────►│
    │                                │◄── access_token               │
    │                                ├─ 获取 accounts ──────────────►│
    │◄── accounts, session_id        │◄── accounts                   │
    │                                │                               │
    ├─ POST /api/deploy/execute ────►│                               │
    │                                ├─ 创建 KV ────────────────────►│
    │                                ├─ 上传 Worker ────────────────►│
    │                                ├─ 设置 Secrets ───────────────►│
    │◄── worker_url, admin_url       │                               │
```

## 前置条件

1. **Cloudflare OAuth Client**：在 Cloudflare 创建 self-managed OAuth client
   - 获取 `CLOUDFLARE_OAUTH_CLIENT_ID` 和 `CLOUDFLARE_OAUTH_CLIENT_SECRET`
   - Redirect URI：`https://<deploy-service-domain>/deploy`
   - Scopes：`account:read`, `workers:write`, `workers:routes`, `workers:kv:write`

2. **Worker Bundle**：构建并发布 WeClaw-Hub Worker 脚本
   ```bash
   # 在项目根目录
   bun run build:worker-bundle
   # 输出 dist/weclaw-hub.js
   # 上传到 GitHub Releases 作为 release asset
   ```

## 部署

```bash
# 1. 安装依赖
cd deploy-service
bun install

# 2. 设置 OAuth 密钥
bunx wrangler secret put CLOUDFLARE_OAUTH_CLIENT_ID
bunx wrangler secret put CLOUDFLARE_OAUTH_CLIENT_SECRET

# 3. 部署
bun run deploy
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `CLOUDFLARE_OAUTH_CLIENT_ID` | Cloudflare OAuth client ID |
| `CLOUDFLARE_OAUTH_CLIENT_SECRET` | Cloudflare OAuth client secret |

## API

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /deploy` | 部署向导页面 |
| `POST /api/deploy/session` | 创建部署会话，返回 authorize_url |
| `POST /api/deploy/oauth/callback` | OAuth 回调，交换 token |
| `POST /api/deploy/execute` | 执行部署 |

## 开发

```bash
cd deploy-service
bun run dev    # 本地开发（wrangler dev）
```

## 限制

- 会话存储在内存中（Worker 重启后丢失）
- Worker bundle 从 GitHub Releases 获取（需提前发布）
- 最多支持部署到 workers.dev 子域名（自定义域名需后续配置）