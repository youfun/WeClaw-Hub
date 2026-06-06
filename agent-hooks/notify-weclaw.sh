#!/usr/bin/env bash
# notify-weclaw.sh — AI Agent → WeClaw-Hub 统一 Webhook 通知脚本
#
# 适用 Agent: droid (Claude Code) / amp (Cursor) / codex (Codex CLI)
#
# 用法（在 agent 的 hooks 配置中调用）:
#   notify-weclaw.sh <agent_name> <event_type>
#
# 环境变量:
#   WECLAW_WEBHOOK_URL     — WeClaw-Hub webhook 完整 URL（必需）
#   WECLAW_WEBHOOK_SECRET  — Bearer token（必需，与 webhook 配置一致）
#   WECLAW_AGENT_NAME      — [可选] 覆盖 agent 名称，用于区分多实例
#   WECLAW_SUPPRESS_DUPS   — [可选] 短时间内同一 agent 不重复通知 (秒)
#
# 参考: Muxy.app muxy-{claude,cursor,codex}-hook.sh

set -euo pipefail

# ── 参数 ─────────────────────────────────────────────
AGENT="${WECLAW_AGENT_NAME:-${1:-unknown}}"
EVENT="${2:-stop}"
INPUT=$(cat)

# ── 未配置时静默退出（不影响 agent 正常工作）─────────
if [ -z "${WECLAW_WEBHOOK_URL:-}" ]; then
    exit 0
fi

# ── 防重复通知（可选）────────────────────────────────
if [ -n "${WECLAW_SUPPRESS_DUPS:-}" ] && [ "${EVENT}" = "stop" ]; then
    STAMP_FILE="${TMPDIR:-/tmp}/weclaw-notify-${AGENT}.stamp"
    NOW=$(date +%s)
    if [ -f "$STAMP_FILE" ]; then
        LAST=$(cat "$STAMP_FILE" 2>/dev/null || echo 0)
        if [ $((NOW - LAST)) -lt "${WECLAW_SUPPRESS_DUPS:-60}" ]; then
            exit 0
        fi
    fi
    echo "$NOW" > "$STAMP_FILE"
fi

# ── 数据提取函数 ─────────────────────────────────────

# 提取最后一条 assistant 消息作为摘要
extract_summary() {
    local msg

    # 方式 1: last_assistant_message (codex / cursor 兼容)
    msg=$(printf '%s' "$INPUT" \
        | grep -o '"last_assistant_message":"[^"]*"' \
        | head -1 | cut -d'"' -f4)

    # 方式 2: tool_response / content 文本
    if [ -z "$msg" ]; then
        msg=$(printf '%s' "$INPUT" \
            | grep -o '"text":"[^"]*"' \
            | head -1 | cut -d'"' -f4)
    fi

    # 方式 3: summary 字段
    if [ -z "$msg" ]; then
        msg=$(printf '%s' "$INPUT" \
            | grep -o '"summary":"[^"]*"' \
            | head -1 | cut -d'"' -f4)
    fi

    if [ -n "$msg" ]; then
        printf '%s' "$msg" | tr '|' ' ' | head -c 300
        return
    fi

    printf '任务已完成'
}

# 提取状态
extract_status() {
    local status
    status=$(printf '%s' "$INPUT" \
        | grep -o '"status":"[^"]*"' \
        | head -1 | cut -d'"' -f4)
    case "${status:-}" in
        completed|finished) printf 'completed' ;;
        aborted|cancelled)  printf 'aborted' ;;
        error|failed)       printf 'error' ;;
        *)                  printf 'completed' ;;
    esac
}

# 提取耗时 (ms)
extract_duration() {
    local d
    d=$(printf '%s' "$INPUT" \
        | grep -o '"duration_ms":[0-9]*' \
        | head -1 | cut -d: -f2)
    printf '%s' "${d:-0}"
}

# 提取 session_id
extract_session_id() {
    local sid
    sid=$(printf '%s' "$INPUT" \
        | grep -o '"session_id":"[^"]*"' \
        | head -1 | cut -d'"' -f4)
    printf '%s' "${sid:-unknown}"
}

# 提取 conversation_id (cursor 兼容)
extract_conversation_id() {
    local cid
    cid=$(printf '%s' "$INPUT" \
        | grep -o '"conversation_id":"[^"]*"' \
        | head -1 | cut -d'"' -f4)
    printf '%s' "${cid:-unknown}"
}

# 提取修改文件列表
extract_files() {
    printf '%s' "$INPUT" \
        | grep -o '"modified_files":\[[^]]*\]' \
        | head -1 \
        | sed 's/"modified_files"://' \
        || printf '[]'
}

# 提取 tool 调用次数
extract_tool_calls() {
    local count
    count=$(printf '%s' "$INPUT" \
        | grep -o '"tool_call_count":[0-9]*' \
        | head -1 | cut -d: -f2)
    printf '%s' "${count:-0}"
}

# ── 按事件类型处理 ───────────────────────────────────

case "$EVENT" in
    stop|Stop)
        TITLE="${AGENT} · 任务完成"
        ;;
    session_end|sessionEnd|SessionEnd)
        TITLE="${AGENT} · 会话结束"
        ;;
    notification|Notification)
        TITLE="${AGENT} · 需要关注"
        ;;
    subagent_stop|subagentStop|SubagentStop)
        TITLE="${AGENT} · 子任务完成"
        ;;
    *)
        TITLE="${AGENT} · ${EVENT}"
        ;;
esac

# ── 构建 JSON payload ───────────────────────────────

SUMMARY=$(extract_summary)
STATUS=$(extract_status)
DURATION=$(extract_duration)
SESSION_ID=$(extract_session_id)
CONV_ID=$(extract_conversation_id)
TOOL_CALLS=$(extract_tool_calls)
FILES=$(extract_files)

PAYLOAD=$(cat <<ENDJSON
{
  "source": "${AGENT}",
  "event": "${EVENT}",
  "title": "${TITLE}",
  "summary": "${SUMMARY}",
  "status": "${STATUS}",
  "duration_ms": ${DURATION},
  "tool_calls": ${TOOL_CALLS},
  "modified_files": ${FILES},
  "session_id": "${SESSION_ID}",
  "conversation_id": "${CONV_ID}",
  "timestamp": $(date +%s000)
}
ENDJSON
)

# ── 发送 Webhook ─────────────────────────────────────

AUTH_VALUE="${WECLAW_WEBHOOK_SECRET:-}"
if [ -z "$AUTH_VALUE" ]; then
    # 无密钥时也尝试发送（如果 webhook 配置为 verify: none）
    curl -s -X POST "${WECLAW_WEBHOOK_URL}" \
        -H "Content-Type: application/json" \
        -d "${PAYLOAD}" \
        --connect-timeout 5 --max-time 10 \
        > /dev/null 2>&1 || true
else
    curl -s -X POST "${WECLAW_WEBHOOK_URL}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AUTH_VALUE}" \
        -d "${PAYLOAD}" \
        --connect-timeout 5 --max-time 10 \
        > /dev/null 2>&1 || true
fi