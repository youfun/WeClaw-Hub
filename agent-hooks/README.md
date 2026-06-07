# WeClaw Agent Hooks

> 让 AI Coding Agent（pi / droid / amp / codex）在任务完成时自动发送通知到微信

## 工作原理

```
Agent 完成任务
  │
  ├─ pi agent  ──► TypeScript Extension ──► fetch()
  ├─ droid      ──► Shell Hook         ──► curl     ──► POST /webhooks/:path
  ├─ amp        ──► Shell Hook         ──► curl          │
  └─ codex      ──► Shell Hook         ──► curl          ▼
                                                    WeClaw-Hub
                                                       │
                                                    iLink API
                                                       ▼
                                                    微信 Bot
```

## 快速开始

### 1. 在 WeClaw-Hub 管理后台创建 Webhook

访问 WeClaw-Hub 管理后台 `/admin`，创建 webhook 配置：

- **Source**: `generic`
- **Verify**: `bearer`
- **Bot IDs**: 选择目标微信 bot
- **Template**（可选）:
  ```
  [${source}] ${title}
  ${summary}
  ⏱ ${duration_ms / 1000}s | 🔧 ${tool_calls} | 📊 ${status}
  ```

创建后获得：
- Webhook URL: `https://<your-domain>/webhooks/<path>`
- Bearer Token: `<secret>`

### 2. 安装

```bash
# 克隆/下载本项目后
cd agent-hooks
bash install.sh
```

交互式安装会：
1. 检测已安装的 AI Agent
2. 让你选择要配置的 Agent
3. 写入对应的 hook 配置文件
4. 设置环境变量到 `~/.zshrc`

或者指定安装特定 Agent：

```bash
bash install.sh --agent droid    # 仅 Claude Code
bash install.sh --agent amp      # 仅 Cursor
bash install.sh --agent codex    # 仅 Codex CLI
bash install.sh --agent pi       # 仅 pi agent
bash install.sh --all            # 全部安装
```

### 3. 手动配置（可选）

设置环境变量（secret 是否必需取决于 webhook 的 verify 模式，见下文）：

```bash
export WECLAW_WEBHOOK_URL="https://<your-domain>/webhooks/<path>"
# 仅当 webhook 的 verify 为 "bearer" 时需要：
export WECLAW_WEBHOOK_SECRET="<bearer-token>"
```

## 各 Agent 配置详情

### pi agent

**安装位置**: `~/.pi/agent/extensions/weclaw-notify.ts`

```bash
cp agent-hooks/pi-extension/weclaw-notify.ts ~/.pi/agent/extensions/
```

- 事件：`agent_end` — 任务完成时自动发送
- pi 重启自动加载，或 `/reload` 手动重载
- 内部使用 Node.js `fetch()` 发送 webhook
- 静默失败，不影响 pi 正常工作

> 可选：启用 `notify_weclaw` 工具后，LLM 可手动调用发送自定义通知（编辑 `weclaw-notify.ts` 取消注释）

### Claude Code (droid)

**安装位置**: `~/.claude/settings.json`

有两种方式：

**方式 A: Command Hook**（统一脚本方式）

```bash
cp agent-hooks/configs/droid-settings.json ~/.claude/settings.json
# 修改脚本路径为实际路径
```

**方式 B: HTTP Hook**（内置，无需脚本文件，推荐）

```bash
cp agent-hooks/configs/droid-http.json ~/.claude/settings.json
# 修改 URL 和 Token
```

- 使用 `/hooks` 命令在 Claude Code 中查看并**信任** hook
- `Stop` 事件：Claude 完成响应时触发
- `Notification` 事件：等待用户输入时触发

### Cursor (amp)

**安装位置**: `~/.cursor/hooks.json` （全局）或 `.cursor/hooks.json` （项目）

```bash
cp agent-hooks/configs/amp-hooks.json ~/.cursor/hooks.json
# 修改脚本路径为实际路径
```

- Cursor 自动检测并加载 hooks
- `stop` 事件：Agent 循环结束时触发
- `sessionEnd` 事件：对话结束，含总耗时统计
- `subagentStop` 事件：子 Agent 完成

### Codex CLI (codex)

**安装位置**: `~/.codex/hooks.json` 或 `~/.codex/config.toml`

**JSON 格式**:

```bash
cp agent-hooks/configs/codex-hooks.json ~/.codex/hooks.json
# 修改脚本路径为实际路径
```

**TOML 格式**:

```bash
cat agent-hooks/configs/codex-config.toml >> ~/.codex/config.toml
# 修改脚本路径为实际路径
```

- 使用 `/hooks` 命令查看并**信任** hook
- `Stop` 事件：对话轮次结束时触发
- `SubagentStop` 事件：子 Agent 完成

## 目录结构

```
agent-hooks/
├── README.md                          # 本文档
├── .env.example                       # 环境变量示例
├── install.sh                         # 一键安装脚本
├── notify-weclaw.sh                   # 统一 Shell Hook 脚本
│                                      #   → droid/amp/codex 共用
├── pi-extension/
│   └── weclaw-notify.ts               # pi agent TypeScript 扩展
└── configs/
    ├── droid-settings.json            # Claude Code Command Hook
    ├── droid-http.json                # Claude Code HTTP Hook (推荐)
    ├── amp-hooks.json                 # Cursor Hook
    ├── codex-hooks.json               # Codex CLI Hook (JSON)
    ├── codex-config.toml              # Codex CLI Hook (TOML)
    └── project-level/                 # 项目级配置示例
        ├── droid-settings.json
        └── amp-hooks.json
```

## 环境变量参考

| 变量 | 必需 | 说明 |
|------|------|------|
| `WECLAW_WEBHOOK_URL` | ✅ | WeClaw-Hub webhook 完整 URL |
| `WECLAW_WEBHOOK_SECRET` | ⚠️ | Bearer token — webhook 设为 `verify: "none"` 时可省略 |
| `WECLAW_AGENT_NAME` | ❌ | 覆盖 agent 名称（多实例区分） |
| `WECLAW_SUPPRESS_DUPS` | ❌ | 防重复通知间隔（秒） |

## 故障排查

### Hook 没有触发

1. **环境变量未生效**: `echo $WECLAW_WEBHOOK_URL`
2. **Claude Code / Codex**: 运行 `/hooks` 查看 hook 状态，确认已**信任**
3. **Cursor**: 检查 `~/.cursor/hooks.json` 存在且 JSON 有效
4. **pi agent**: 运行 `/reload` 重载，检查控制台是否有错误
5. **路径问题**: 确认 `notify-weclaw.sh` 路径正确且可执行 (`chmod +x`)

### Webhook 返回 401

- 确认 `WECLAW_WEBHOOK_SECRET` 与 WeClaw-Hub 管理后台中 webhook 配置的 `secret` 一致
- 确认 `verify` 模式为 `bearer`

### 微信收到空消息

- 检查 WeClaw-Hub 管理后台中 webhook 的 `template` 配置
- 确认 `bot_ids` 中至少有一个已登录的 bot
- 确认 bot 在微信中是活跃状态

## 设计参考

- [Muxy.app](https://muxy.app) — 多 Agent 通知聚合终端（参考其 hook 实现模式）
- Claude Code [Hooks 文档](https://code.claude.com/docs/en/hooks-guide)
- Cursor [Hooks 文档](https://cursor.com/docs/hooks)
- Codex CLI [Hooks 文档](https://developers.openai.com/codex/hooks)
- pi agent [Extensions 文档](https://github.com/earendil-works/pi-coding-agent) (随 pi 内置)