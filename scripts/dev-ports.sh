#!/bin/sh

set -eu

ports="${*:-8000 5173 5174}"

for port in $ports; do
  printf 'port %s: ' "$port"
  if command -v lsof >/dev/null 2>&1; then
    output=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -z "$output" ]; then
      printf 'free\n'
    else
      printf '\n%s\n' "$output"
    fi
  elif [ "$(uname)" != "Darwin" ] && command -v ss >/dev/null 2>&1; then
    output=$(ss -ltnp "sport = :$port" 2>/dev/null || true)
    if [ -z "$output" ] || [ "$(printf '%s\n' "$output" | wc -l | tr -d ' ')" -le 1 ]; then
      printf 'free\n'
    else
      printf '\n%s\n' "$output"
    fi
  else
    printf 'cannot inspect; install lsof or ss\n'
  fi
done
