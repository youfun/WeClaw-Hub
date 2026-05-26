#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_VARS_FILE="${DEV_VARS_FILE:-$ROOT_DIR/.dev.vars}"
BASE_URL="${BASE_URL:-http://localhost:8787}"

if [[ ! -f "$DEV_VARS_FILE" ]]; then
  echo "Missing $DEV_VARS_FILE" >&2
  echo "Create it first: cp .dev.vars.example .dev.vars" >&2
  exit 1
fi

read_dev_var() {
  local key="$1"
  awk -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line=$0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      split(line, parts, "=")
      name=parts[1]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name == key) {
        sub(/^[^=]*=/, "", line)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if ((substr(line,1,1) == "\"" && substr(line,length(line),1) == "\"") || (substr(line,1,1) == "'\''" && substr(line,length(line),1) == "'\''")) {
          line=substr(line,2,length(line)-2)
        }
        print line
        exit
      }
    }
  ' "$DEV_VARS_FILE"
}

AUTH_TOKEN="${AUTH_TOKEN:-$(read_dev_var AUTH_TOKEN)}"
if [[ -z "$AUTH_TOKEN" ]]; then
  echo "AUTH_TOKEN is missing in $DEV_VARS_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "Starting wrangler dev at $BASE_URL ..."
bun run dev &
DEV_PID=$!

cleanup() {
  if kill -0 "$DEV_PID" >/dev/null 2>&1; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

echo "Waiting for $BASE_URL/health ..."
for i in $(seq 1 60); do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    echo "Worker is ready. Resuming bound bot polling ..."
    curl -fsS -X POST "$BASE_URL/api/bots/start-all" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      || echo "Warning: start-all request failed; check wrangler logs above." >&2
    echo
    echo "Dev server is running. Press Ctrl+C to stop."
    wait "$DEV_PID"
    exit $?
  fi

  if ! kill -0 "$DEV_PID" >/dev/null 2>&1; then
    echo "bun run dev exited before becoming ready" >&2
    wait "$DEV_PID"
    exit $?
  fi

  sleep 1
done

echo "Timed out waiting for $BASE_URL/health" >&2
exit 1
