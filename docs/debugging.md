# WeClaw-Hub 调试指南

## 本地开发环境

```bash
# 启动 dev server（带日志输出）
bash scripts/dev-local.sh

# 或手动启动
bun run dev
```

`.dev.vars` 中配置 `AUTH_TOKEN` 和 AI 密钥。

## tmux 调试流程

当需要反复测试并查看服务端日志时，用 tmux 运行 dev server，从另一个终端发送请求。

### 1. 启动 tmux 会话

```bash
tmux new-session -d -s weclaw "cd /Users/box/dev-code/WeClaw-Hub && bash scripts/dev-local.sh 2>&1"
```

### 2. 等待服务就绪

```bash
while ! curl -sf http://localhost:8787/health; do sleep 2; done
echo "Ready"
```

### 3. 发送测试请求

```bash
# 通用 API 请求模板
curl -s -X POST http://localhost:8787/API路径 \
  -H "Authorization: Bearer dev-test-token" \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'
```

### 4. 读取日志

```bash
tmux capture-pane -t weclaw -p | tail -30
```

### 5. 重启服务（代码改动后）

```bash
tmux kill-session -t weclaw
# 重新执行步骤 1-2
```

## 模拟微信消息

`/api/send` 直接发文本给用户，**不走 Agent**（不处理命令、不触发 Agent 逻辑）。

要触发 Agent 处理（如 `/draw`），需要加一个测试路由：

```ts
// 在 BotSession.fetch() 的 switch 中添加
case "/test-msg":
  return this.handleTestMessage(request);

// 实现
private async handleTestMessage(request: Request): Promise<Response> {
  const creds = this.getCredentials();
  if (!creds) return json({ error: "not logged in" }, 401);
  const body = await request.json() as { text?: string };
  const text = body.text || "";
  const userId = creds.ilink_user_id;
  if (!userId) return json({ error: "no ilink_user_id" }, 400);
  const contextToken = this.getContextToken(userId) || "";
  // 直接调用内部处理方法
  await this.handleWithAgent(creds, userId, text, contextToken);
  return json({ ok: true });
}
```

调用方式：

```bash
curl -s -X POST http://localhost:8787/bot/BOT_ID/test-msg \
  -H "Authorization: Bearer dev-test-token" \
  -H "Content-Type: application/json" \
  -d '{"text":"/draw 一只猫"}'
```

## 常用调试命令

```bash
# 查看 bot 列表
curl -s http://localhost:8787/api/bots -H "Authorization: Bearer dev-test-token"

# 启动 bot 轮询
curl -s -X POST http://localhost:8787/api/bots/start-all \
  -H "Authorization: Bearer dev-test-token"

# 查看 bot 状态
curl -s http://localhost:8787/bot/BOT_ID/status \
  -H "Authorization: Bearer dev-test-token"

# 查看 bot 设置
curl -s http://localhost:8787/bot/BOT_ID/settings \
  -H "Authorization: Bearer dev-test-token"

# 设置生图配置
curl -s -X PATCH http://localhost:8787/api/image-config \
  -H "Authorization: Bearer dev-test-token" \
  -H "Content-Type: application/json" \
  -d '{"image_provider_id":"step","image_model":"step-image-edit-2"}'

# 查看供应商
curl -s http://localhost:8787/api/providers \
  -H "Authorization: Bearer dev-test-token"
```

## 调试技巧

### 加日志

在关键路径加 `console.log`，通过 tmux 日志查看：

```ts
console.log(`[draw] image generated, url=${!!result.url} b64=${!!result.b64Json}`);
console.log(`[draw] getUploadUrl fullResp=${JSON.stringify(uploadResp).slice(0, 300)}`);
```

### 对比官方 SDK

```bash
# 下载官方 SDK 到 /tmp
cd /tmp && curl -sL "https://registry.npmjs.org/@tencent-weixin/openclaw-weixin/-/openclaw-weixin-2.4.4.tgz" | tar -xz

# 对比关键实现
find /tmp/package/src -name "*.ts" | xargs grep -l "upload\|encrypt\|send.*image"
```

### AWS/Workerd 兼容性注意

Workerd 的 `node:crypto` 和 Node.js 有细微差异：

- `createCipheriv("aes-128-ecb", key, null)` — Workerd 不接受 `null` 作为 IV，需用 `Buffer.alloc(0)`
- `createCipheriv` 的 key 参数需要是 `Buffer` 而非 `Uint8Array`
- `Buffer` 来自 `node:buffer`（Workerd 内置），无需额外 import

### CDN 上传 / 图片发送调试

完整流程：图片生成 → CDN 上传 → 微信消息发送。任一环节失败图片都无法显示。

**常见错误**：

| 错误 | 原因 | 修复 |
|------|------|------|
| CDN upload HTTP 500 | AES 加密结果与服务端预期不匹配 | 使用 `node:crypto` 的 `createCipheriv` 代替手写 AES |
| CDN upload HTTP 404 | 请求方法或 URL 不正确 | CDN 用 `POST`（非 `PUT`），URL 优先用 `upload_full_url` |
| 图片已过期 / 已被清理 | `aes_key` 编码格式错误 | 要传 **hex 字符串的 base64**，不是原始字节的 base64 |

**aes_key 编码（关键）**：

官方 SDK 的做法：

```ts
// 生成 16 字节 AES key
const aeskey = crypto.randomBytes(16);
// 传给 getUploadUrl 的是 hex 字符串
aeskey: aeskey.toString("hex"),
// 放入消息 image_item 的是 hex 字符串 → base64
// 错误：Buffer.from(aeskey).toString("base64")     // 16字节 → 24字符
// 正确：Buffer.from(aeskey.toString("hex")).toString("base64")  // 32字符hex → 44字符
```

验证：

```bash
node -e "
const k = require('crypto').randomBytes(16);
console.log('hex:', k.toString('hex'), 'len:', k.toString('hex').length);
console.log('SDK base64:', Buffer.from(k.toString('hex')).toString('base64'));
console.log('raw base64:', k.toString('base64'));
"
# SDK base64 是 44 字符，raw base64 是 24 字符
```

**调试日志**：在 CDN 上传失败时读 `x-error-message` 响应头：

```ts
const errHeader = res.headers.get("x-error-message");
```
