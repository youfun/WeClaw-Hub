#!/usr/bin/env bash
# install.sh — WeClaw Agent Hooks 一键安装脚本
#
# 用法:
#   bash install.sh                          # 交互式安装
#   bash install.sh --agent pi               # 仅安装 pi agent 扩展
#   bash install.sh --agent droid            # 仅安装 Claude Code hook
#   bash install.sh --agent amp              # 仅安装 Cursor hook
#   bash install.sh --agent codex            # 仅安装 Codex CLI hook
#   bash install.sh --all                    # 安装全部
#
# 环境变量（可预设，跳过交互）:
#   WECLAW_WEBHOOK_URL     — WeClaw-Hub webhook 完整 URL
#   WECLAW_WEBHOOK_SECRET  — Bearer token

set -euo pipefail

# ── 颜色输出 ────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${GREEN}[✓]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[!]${NC} %s\n" "$*"; }
error() { printf "${RED}[✗]${NC} %s\n" "$*"; }
title() { printf "\n${CYAN}═══ %s ═══${NC}\n" "$*"; }

# ── 检测已安装的 Agent ──────────────────────────────

detect_agents() {
    echo ""
    info "检测已安装的 AI Agent..."
    echo ""

    AGENTS_FOUND=""

    if command -v claude &>/dev/null || [ -d "$HOME/.claude" ]; then
        info "Claude Code (droid) — 已检测到"
        AGENTS_FOUND="${AGENTS_FOUND} droid"
    else
        warn "Claude Code (droid) — 未检测到，可手动安装配置"
    fi

    if [ -d "/Applications/Cursor.app" ] || command -v cursor &>/dev/null || [ -d "$HOME/.cursor" ]; then
        info "Cursor (amp) — 已检测到"
        AGENTS_FOUND="${AGENTS_FOUND} amp"
    else
        warn "Cursor (amp) — 未检测到，可手动安装配置"
    fi

    if command -v codex &>/dev/null || [ -d "$HOME/.codex" ]; then
        info "Codex CLI (codex) — 已检测到"
        AGENTS_FOUND="${AGENTS_FOUND} codex"
    else
        warn "Codex CLI (codex) — 未检测到，可手动安装配置"
    fi

    if command -v pi &>/dev/null || [ -d "$HOME/.pi/agent" ]; then
        info "pi agent — 已检测到"
        AGENTS_FOUND="${AGENTS_FOUND} pi"
    else
        warn "pi agent — 未检测到，可手动安装配置"
    fi

    echo ""
}

# ── 获取 Webhook 配置 ────────────────────────────────

get_webhook_config() {
    if [ -n "${WECLAW_WEBHOOK_URL:-}" ] && [ -n "${WECLAW_WEBHOOK_SECRET:-}" ]; then
        info "使用预设环境变量"
        return
    fi

    echo ""
    echo "请输入 WeClaw-Hub Webhook 配置（在管理后台 /admin 创建）:"
    echo ""

    if [ -z "${WECLAW_WEBHOOK_URL:-}" ]; then
        printf "Webhook URL: "
        read -r WECLAW_WEBHOOK_URL
    fi

    if [ -z "${WECLAW_WEBHOOK_SECRET:-}" ]; then
        printf "Bearer Token: "
        read -r WECLAW_WEBHOOK_SECRET
    fi

    echo ""
}

# ── 获取脚本所在目录 ────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/notify-weclaw.sh"

ensure_hook_script_executable() {
    chmod +x "$HOOK_SCRIPT"
}

# ── 安装: Claude Code (droid) ────────────────────────

install_droid() {
    title "安装 Claude Code (droid) Hook"

    local config_dir="${HOME}/.claude"
    mkdir -p "$config_dir"

    local config_file="${config_dir}/settings.json"

    # 检查是否已有 hooks 配置
    if [ -f "$config_file" ]; then
        warn "已存在 ~/.claude/settings.json"
        printf "是否覆盖 hooks 部分？(合并/覆盖/跳过) [m/o/s]: "
        read -r choice
        case "$choice" in
            o|O) ;; # 覆盖，继续
            s|S) info "已跳过"; return ;;
            *)    info "请手动将以下配置合并到 ~/.claude/settings.json:"; cat "${SCRIPT_DIR}/configs/droid-settings.json"; return ;;
        esac
    fi

    # 生成配置
    ESCAPED_HOOK=$(printf '%s' "$HOOK_SCRIPT" | sed 's/\\/\\\\/g; s/"/\\"/g')

    cat > "$config_file" <<ENDJSON
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${ESCAPED_HOOK} droid stop",
            "timeout": 10
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "${ESCAPED_HOOK} droid notification",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
ENDJSON

    info "已写入 ~/.claude/settings.json"
    info "使用 /hooks 命令在 Claude Code 中查看并信任 hook"
}

# ── 安装: Cursor (amp) ──────────────────────────────

install_amp() {
    title "安装 Cursor (amp) Hook"

    local config_dir="${HOME}/.cursor"
    mkdir -p "$config_dir"

    local config_file="${config_dir}/hooks.json"

    if [ -f "$config_file" ]; then
        warn "已存在 ~/.cursor/hooks.json"
        printf "是否覆盖？(y/n): "
        read -r choice
        case "$choice" in y|Y) ;; *) info "已跳过"; return ;; esac
    fi

    ESCAPED_HOOK=$(printf '%s' "$HOOK_SCRIPT" | sed 's/\\/\\\\/g; s/"/\\"/g')

    cat > "$config_file" <<ENDJSON
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "${ESCAPED_HOOK} amp stop",
        "timeout": 10
      }
    ],
    "sessionEnd": [
      {
        "command": "${ESCAPED_HOOK} amp session_end",
        "timeout": 10
      }
    ]
  }
}
ENDJSON

    info "已写入 ~/.cursor/hooks.json"
    info "Cursor 会自动检测并加载 hooks"
}

# ── 安装: Codex CLI ──────────────────────────────────

install_codex() {
    title "安装 Codex CLI (codex) Hook"

    local config_dir="${HOME}/.codex"
    mkdir -p "$config_dir"

    local config_file="${config_dir}/hooks.json"

    if [ -f "$config_file" ]; then
        warn "已存在 ~/.codex/hooks.json"
        printf "是否覆盖？(y/n): "
        read -r choice
        case "$choice" in y|Y) ;; *) info "已跳过"; return ;; esac
    fi

    ESCAPED_HOOK=$(printf '%s' "$HOOK_SCRIPT" | sed 's/\\/\\\\/g; s/"/\\"/g')

    cat > "$config_file" <<ENDJSON
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${ESCAPED_HOOK} codex stop",
            "timeout": 30
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${ESCAPED_HOOK} codex subagent_stop",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
ENDJSON

    info "已写入 ~/.codex/hooks.json"
    info "使用 /hooks 命令在 Codex 中查看并信任 hook"
}

# ── 安装: pi agent ───────────────────────────────────

install_pi() {
    title "安装 pi agent 扩展"

    local ext_dir="${HOME}/.pi/agent/extensions"
    mkdir -p "$ext_dir"

    local ext_file="${ext_dir}/weclaw-notify.ts"

    if [ -f "$ext_file" ]; then
        warn "已存在 ~/.pi/agent/extensions/weclaw-notify.ts"
        printf "是否覆盖？(y/n): "
        read -r choice
        case "$choice" in y|Y) ;; *) info "已跳过"; return ;; esac
    fi

    cp "${SCRIPT_DIR}/pi-extension/weclaw-notify.ts" "$ext_file"

    info "已安装到 ~/.pi/agent/extensions/weclaw-notify.ts"
    info "pi agent 重启后自动加载，或用 /reload 手动重载"
}

# ── 写入环境变量配置 ─────────────────────────────────

write_env_config() {
    title "写入环境变量配置"

    local shell_rc=""
    if [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    fi

    if [ -n "$shell_rc" ]; then
        if grep -q "WECLAW_WEBHOOK_URL" "$shell_rc" 2>/dev/null; then
            info "环境变量已存在于 ${shell_rc}"
        else
            cat >> "$shell_rc" <<ENDENV

# WeClaw Agent Hooks
export WECLAW_WEBHOOK_URL="${WECLAW_WEBHOOK_URL}"
export WECLAW_WEBHOOK_SECRET="${WECLAW_WEBHOOK_SECRET}"
ENDENV
            info "已追加到 ${shell_rc}"
            info "请执行 source ${shell_rc} 或重新打开终端"
        fi
    else
        warn "未检测到 .zshrc 或 .bashrc，请手动设置环境变量:"
        echo "  export WECLAW_WEBHOOK_URL=\"${WECLAW_WEBHOOK_URL}\""
        echo "  export WECLAW_WEBHOOK_SECRET=\"${WECLAW_WEBHOOK_SECRET}\""
    fi
}

# ── 主流程 ───────────────────────────────────────────

main() {
    echo ""
    printf "${CYAN}"
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║   WeClaw Agent Hooks — 一键安装     ║"
    echo "  ║   将 AI Agent 任务通知接入微信       ║"
    echo "  ╚══════════════════════════════════════╝"
    printf "${NC}"

    AGENT_FILTER="${1:-}"

    # 如果指定了 --all，安装全部
    if [ "$AGENT_FILTER" = "--all" ]; then
        AGENT_FILTER="droid amp codex pi"
    elif [ "$AGENT_FILTER" = "--agent" ]; then
        AGENT_FILTER="${2:-}"
    fi

    # 确保 hook 脚本可执行
    ensure_hook_script_executable

    # 获取 webhook 配置
    get_webhook_config

    # 写入环境变量
    write_env_config

    echo ""

    if [ -n "$AGENT_FILTER" ] && [ "$AGENT_FILTER" != "--all" ]; then
        # 指定了特定 agent
        for agent in $AGENT_FILTER; do
            case "$agent" in
                droid|claude) install_droid ;;
                amp|cursor)   install_amp ;;
                codex)        install_codex ;;
                pi)           install_pi ;;
                *)            error "未知 agent: $agent"; exit 1 ;;
            esac
        done
    else
        # 交互模式
        detect_agents

        printf "选择要安装的 Agent（多选用空格分隔，all=全部）: "
        read -r choices

        for choice in $choices; do
            case "$choice" in
                all)    install_droid; install_amp; install_codex; install_pi; break ;;
                droid)  install_droid ;;
                amp)    install_amp ;;
                codex)  install_codex ;;
                pi)     install_pi ;;
                *)      warn "跳过: $choice" ;;
            esac
        done
    fi

    title "安装完成"
    echo ""
    info "下一步:"
    echo "  1. 确认环境变量已生效: echo \$WECLAW_WEBHOOK_URL"
    echo "  2. 在 WeClaw-Hub 管理后台 /admin 创建 webhook 配置"
    echo "  3. 重启对应的 AI Agent 使 hook 生效"
    echo "  4. 执行一个简单任务进行测试"
    echo ""
}

main "$@"