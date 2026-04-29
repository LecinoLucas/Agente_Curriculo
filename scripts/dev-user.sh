#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

get_local_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || printf '127.0.0.1'
    return 0
  fi

  if command -v hostname >/dev/null 2>&1; then
    host_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "${host_ip:-}" ]; then
      printf '%s\n' "$host_ip"
      return 0
    fi
  fi

  if command -v ip >/dev/null 2>&1; then
    host_ip=$(ip route get 1 2>/dev/null | awk '/src/ {for (i = 1; i <= NF; i++) if ($i == "src") {print $(i + 1); exit}}')
    if [ -n "${host_ip:-}" ]; then
      printf '%s\n' "$host_ip"
      return 0
    fi
  fi

  printf '127.0.0.1\n'
}

get_host_label() {
  if command -v scutil >/dev/null 2>&1; then
    name=$(scutil --get LocalHostName 2>/dev/null || true)
    if [ -n "${name:-}" ]; then
      printf '%s\n' "$name"
      return 0
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    name=$(hostname -s 2>/dev/null || hostname 2>/dev/null || true)
    if [ -n "${name:-}" ]; then
      printf '%s\n' "$name"
      return 0
    fi
  fi

  printf 'localhost\n'
}

FRONTEND_PORT=${FRONTEND_PORT:-5173}
BACKEND_PORT=${BACKEND_PORT:-8000}
HOST=${HOST:-0.0.0.0}

LOCAL_IP=$(get_local_ip)
HOST_LABEL=$(get_host_label)
HOST_LOCAL="${HOST_LABEL}.local"

printf '\n== Acesso para usuários ==\n\n'
printf 'Frontend:\n'
printf 'http://%s:%s\n' "$LOCAL_IP" "$FRONTEND_PORT"
printf 'http://%s:%s\n\n' "$HOST_LOCAL" "$FRONTEND_PORT"
printf 'Backend:\n'
printf 'http://%s:%s/docs\n' "$LOCAL_IP" "$BACKEND_PORT"
printf 'http://%s:%s/docs\n\n' "$HOST_LOCAL" "$BACKEND_PORT"

export FRONTEND_PORT
export BACKEND_PORT
export HOST

cd "$ROOT_DIR"
exec npm run dev:full
