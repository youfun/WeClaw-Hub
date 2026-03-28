/** @jsxImportSource hono/jsx */

import { Section, renderPage } from "./layout.tsx";

export function guidePage(): Response {
  return renderPage({
    title: "使用说明",
    subtitle: "在微信中与 Bot 对话，支持以下命令与交互方式。",
    children: (
      <>
        <Section title="对话命令" description="直接在微信聊天窗口发送，Bot 会即时响应。">
          <div class="grid">
            <CommandRow cmd="（直接输入文字）" desc="与 AI 对话，Bot 自动选模回复" example="帮我写一段 Python 读取 CSV 文件的代码" />
            <CommandRow cmd="/claude [消息]" desc="同上，显式调用 AI 对话" example="/claude 解释一下 Cloudflare Workers 的执行模型" />
            <CommandRow cmd="/clear" desc="清空对话历史，开始新对话（记忆不受影响）" />
            <CommandRow cmd="/help" desc="显示支持的命令列表" />
            <CommandRow cmd="/status" desc="查看当前 Bot 运行状态（模型、模式、轮询状态）" />
          </div>
          <div class="callout">
            <strong>对话历史 vs 记忆</strong>
            <p>
              <strong style="font-weight:600">对话历史</strong>是上下文窗口，保留最近 100 条消息（约 50 轮）供 AI 参考，发送 <span class="code">/clear</span> 即可清空，开启全新对话。<br />
              <strong style="font-weight:600">记忆</strong>是长期存储，自动提取的用户偏好与事实，<span class="code">/clear</span> 不会清除，需在管理台手动删除。
            </p>
          </div>
        </Section>

        <Section title="模型与模式" description="控制 AI 使用哪个模型以及选模逻辑。">
          <div class="grid">
            <CommandRow cmd="/model" desc="列出所有可用模型，显示当前激活的模型" />
            <CommandRow cmd="/model [名称或编号]" desc="手动切换到指定模型" example="/model 2  或  /model Sonnet" />
            <CommandRow cmd="/mode" desc="查看当前模式（family / manual）" />
            <CommandRow cmd="/mode family" desc="切换到 family 模式 — 根据问题复杂度自动选模（推荐）" />
            <CommandRow cmd="/mode manual" desc="切换到 manual 模式 — 固定使用当前选中的模型" />
          </div>
          <div class="callout">
            <strong>Family 模式说明</strong>
            <p>普通问题使用标记为 <span class="code">daily</span> 的模型，复杂问题自动切换到 <span class="code">complex</span> 模型。在管理台的模型页面为每个模型设置角色标记。</p>
          </div>
        </Section>

        <Section title="记忆" description="Bot 会自动从对话中提取并持久化用户偏好与事实，无需手动操作。">
          <div class="grid">
            <div class="card stack">
              <strong>工作原理</strong>
              <ol class="guide-steps">
                <li>每次 AI 回复后，Bot 在后台异步调用 Claude 分析对话</li>
                <li>自动提取关键事实（偏好、习惯、背景信息等）存入数据库</li>
                <li>下次对话时，排名靠前的记忆条目被注入到系统提示词中</li>
                <li>Bot 因此能"记住"你，对话越多理解越准确</li>
              </ol>
            </div>
            <div class="card stack">
              <strong>存储规格</strong>
              <div class="grid" style="margin-top:4px">
                <MemoryStatRow label="最大存储条数" value="40 条 / Bot" />
                <MemoryStatRow label="每次对话注入" value="得分最高的 20 条" />
                <MemoryStatRow label="命令查看上限" value="最近 10 条" />
                <MemoryStatRow label="存储位置" value="Durable Object SQLite" />
              </div>
            </div>
          </div>

          <div class="callout" style="margin-top:14px">
            <strong>得分机制</strong>
            <p>每条记忆有一个动态得分：<span class="code">命中次数 × 2 + 最近 14 天内距上次命中的天数差</span>。得分越高越优先注入上下文，长期未被用到的记忆会自然降权。</p>
          </div>

          <div style="height:14px" />
          <div class="grid">
            <CommandRow cmd="/memory" desc="查看当前存储的记忆条目（最多显示 10 条）" />
          </div>
          <p class="muted" style="font-size:13px;margin-top:10px">也可在管理台 → Bot 配置页面查看全部记忆、删除单条或一键清空。</p>
        </Section>

        <Section title="定时任务" description="Bot 支持在指定时间自动发送消息。">
          <div class="grid">
            <CommandRow cmd="/tasks" desc="列出所有定时任务及下次触发时间" />
          </div>
          <p class="muted" style="font-size:13px;margin-top:10px">定时任务在管理台 → Bot 配置页面创建和管理。</p>
        </Section>

        <Section title="Webhook 通知" description="把外部服务的事件推送到微信。">
          <div class="grid">
            <div class="card stack">
              <strong>配置流程</strong>
              <ol class="guide-steps">
                <li>在管理台 → Webhooks 创建一条配置，设置路径与验证方式</li>
                <li>将生成的 Webhook URL 填入第三方服务（GitHub、Stripe 等）</li>
                <li>第三方触发事件后，消息自动推送到绑定的微信 Bot</li>
              </ol>
            </div>
            <div class="card stack">
              <strong>支持的来源</strong>
              <div class="grid" style="margin-top:4px">
                <SourceRow name="github" desc="Push、PR、Issue、Release 等事件，格式化展示" />
                <SourceRow name="generic" desc="任意 JSON/文本 payload，原样转发" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="管理台操作" description="浏览器端管理配置，无需修改代码。">
          <div class="grid">
            <div class="card stack">
              <strong>供应商 → 模型</strong>
              <ol class="guide-steps">
                <li>在「供应商」区域添加 Provider（填写 API Key 与 Base URL）</li>
                <li>点击「拉取模型」从 Provider 获取可用模型列表</li>
                <li>勾选需要的模型点击「导入」，或在「模型」区域手动添加</li>
                <li>给每个模型设置 <span class="code">daily</span> / <span class="code">complex</span> 角色供 family 模式使用</li>
              </ol>
            </div>
            <div class="card stack">
              <strong>Bot 配置</strong>
              <ol class="guide-steps">
                <li>在「绑定账号」页面扫码，完成微信账号绑定</li>
                <li>进入管理台 → 机器人总览 → 点击「进入配置」</li>
                <li>设置 AI 模式、指定模型、开启/关闭接收 Webhook</li>
              </ol>
            </div>
          </div>
        </Section>

        <style>{`
          .callout {
            margin-top: 14px;
            padding: 16px 18px;
            border: 1px solid var(--line);
            border-radius: 16px;
            background: rgba(182, 84, 45, 0.04);
          }
          .callout strong { display: block; margin-bottom: 6px; }
          .callout p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
          .guide-steps {
            margin: 0;
            padding-left: 20px;
            color: var(--muted);
            font-size: 14px;
            line-height: 2;
          }
          .cmd-example {
            font-size: 12px;
            color: var(--muted);
            font-style: italic;
            margin-top: 2px;
          }
        `}</style>
      </>
    ),
  });
}

function CommandRow({ cmd, desc, example }: { cmd: string; desc: string; example?: string }) {
  return (
    <div class="row">
      <div>
        <span class="code">{cmd}</span>
        {example ? <p class="cmd-example">例：{example}</p> : null}
      </div>
      <div style="text-align:right;color:var(--muted);font-size:14px;max-width:55%">{desc}</div>
    </div>
  );
}

function MemoryStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div class="row" style="padding:10px 14px">
      <span style="color:var(--muted);font-size:13px">{label}</span>
      <span class="code" style="font-size:13px">{value}</span>
    </div>
  );
}

function SourceRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div class="row" style="padding:10px 14px">
      <span class="code">{name}</span>
      <span style="color:var(--muted);font-size:13px">{desc}</span>
    </div>
  );
}
