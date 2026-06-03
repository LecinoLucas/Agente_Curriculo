#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
CANDIDATE_PORTAL_DIR="$ROOT_DIR/candidate-portal"
ROOT_DEPS_STAMP="$ROOT_DIR/node_modules/.deps-stamp"
FRONTEND_DEPS_STAMP="$FRONTEND_DIR/node_modules/.deps-stamp"
BACKEND_DEPS_STAMP="$BACKEND_DIR/.venv/.deps-stamp"
CANDIDATE_PORTAL_DEPS_STAMP="$CANDIDATE_PORTAL_DIR/node_modules/.deps-stamp"

DEV_MODE=${DEV_MODE:-local}
DEV_HOST=${DEV_HOST:-}
DEV_PUBLIC_HOST=${DEV_PUBLIC_HOST:-}
INCLUDE_CANDIDATE_PORTAL=${INCLUDE_CANDIDATE_PORTAL:-true}
INCLUDE_CELERY=${INCLUDE_CELERY:-true}
BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
CANDIDATE_PORTAL_PORT=${CANDIDATE_PORTAL_PORT:-5174}

usage() {
  cat <<'EOF'
Uso:
  npm run dev:full
  npm run dev:full -- --network
  npm run dev:full -- --host 0.0.0.0
  DEV_HOST=0.0.0.0 npm run dev:full

Opcoes:
  --local              Bind local em 127.0.0.1 (padrao)
  --network           Bind em 0.0.0.0 e usa o IP da LAN para URLs/API
  --host <host>       127.0.0.1 para local ou 0.0.0.0 para network
  --public-host <ip>  IP/host mostrado para outros dispositivos na LAN
  --no-candidate      Nao sobe candidate-portal
  --no-celery         Nao sobe worker Celery

Este modo network e somente para LAN/desenvolvimento, nao para producao.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --local)
      DEV_MODE=local
      shift
      ;;
    --network)
      DEV_MODE=network
      DEV_HOST=0.0.0.0
      shift
      ;;
    --host)
      DEV_HOST=${2:-}
      if [ -z "$DEV_HOST" ]; then
        echo "[ERROR] --host exige um valor." >&2
        exit 1
      fi
      shift 2
      ;;
    --host=*)
      DEV_HOST=${1#--host=}
      shift
      ;;
    --public-host)
      DEV_PUBLIC_HOST=${2:-}
      if [ -z "$DEV_PUBLIC_HOST" ]; then
        echo "[ERROR] --public-host exige um valor." >&2
        exit 1
      fi
      shift 2
      ;;
    --public-host=*)
      DEV_PUBLIC_HOST=${1#--public-host=}
      shift
      ;;
    --no-candidate)
      INCLUDE_CANDIDATE_PORTAL=false
      shift
      ;;
    --no-celery)
      INCLUDE_CELERY=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Opcao desconhecida: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -n "$DEV_HOST" ] && [ "$DEV_HOST" != "127.0.0.1" ] && [ "$DEV_HOST" != "localhost" ]; then
  DEV_MODE=network
fi

if [ "$DEV_MODE" = "network" ]; then
  BIND_HOST=${DEV_HOST:-0.0.0.0}
else
  BIND_HOST=${DEV_HOST:-127.0.0.1}
fi

print_section() {
  printf '\n== %s ==\n' "$1"
}

print_ok() {
  printf '[ok] %s\n' "$1"
}

print_info() {
  printf '[..] %s\n' "$1"
}

print_error() {
  printf '[ERROR] %s\n' "$1" >&2
}

get_local_ip() {
  if [ -n "$DEV_PUBLIC_HOST" ]; then
    printf '%s\n' "$DEV_PUBLIC_HOST"
    return 0
  fi

  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1 en2; do
      ipconfig getifaddr "$iface" 2>/dev/null && return 0
    done
  fi

  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' && return 0
    ip -4 addr show scope global 2>/dev/null | awk '/inet / {sub("/.*", "", $2); print $2; exit}' && return 0
  fi

  if command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}' && return 0
  fi

  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}' && return 0
  fi

  return 1
}

needs_install() {
  local stamp_file=$1
  shift

  if [ ! -f "$stamp_file" ]; then
    return 0
  fi

  local dependency_file
  for dependency_file in "$@"; do
    if [ -f "$dependency_file" ] && [ "$dependency_file" -nt "$stamp_file" ]; then
      return 0
    fi
  done

  return 1
}

ensure_root_dependencies() {
  if [ ! -d "$ROOT_DIR/node_modules" ] || needs_install "$ROOT_DEPS_STAMP" "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json"; then
    print_info "Instalando dependencias da raiz"
    cd "$ROOT_DIR"
    npm ci --prefer-offline --no-audit
    mkdir -p "$ROOT_DIR/node_modules"
    touch "$ROOT_DEPS_STAMP"
    print_ok "Dependencias da raiz instaladas"
    return 0
  fi

  print_ok "Dependencias da raiz prontas"
}

ensure_frontend_dependencies() {
  if [ ! -d "$FRONTEND_DIR/node_modules" ] || needs_install "$FRONTEND_DEPS_STAMP" "$FRONTEND_DIR/package.json" "$FRONTEND_DIR/package-lock.json"; then
    print_info "Instalando dependencias do frontend"
    cd "$FRONTEND_DIR"
    npm ci --prefer-offline --no-audit
    mkdir -p "$FRONTEND_DIR/node_modules"
    touch "$FRONTEND_DEPS_STAMP"
    print_ok "Dependencias do frontend instaladas"
    return 0
  fi

  print_ok "Dependencias do frontend prontas"
}

ensure_candidate_portal_dependencies() {
  if [ "$INCLUDE_CANDIDATE_PORTAL" != "true" ]; then
    print_info "Candidate portal omitido por INCLUDE_CANDIDATE_PORTAL=false"
    return 0
  fi

  if [ ! -d "$CANDIDATE_PORTAL_DIR/node_modules" ] || needs_install "$CANDIDATE_PORTAL_DEPS_STAMP" "$CANDIDATE_PORTAL_DIR/package.json" "$CANDIDATE_PORTAL_DIR/package-lock.json"; then
    print_info "Instalando dependencias do candidate-portal"
    cd "$CANDIDATE_PORTAL_DIR"
    npm ci --prefer-offline --no-audit
    mkdir -p "$CANDIDATE_PORTAL_DIR/node_modules"
    touch "$CANDIDATE_PORTAL_DEPS_STAMP"
    print_ok "Dependencias do candidate-portal instaladas"
    return 0
  fi

  print_ok "Dependencias do candidate-portal prontas"
}

ensure_backend_dependencies() {
  if [ ! -d "$BACKEND_DIR/.venv" ]; then
    print_info "Criando ambiente virtual do backend"
    cd "$BACKEND_DIR"
    python3 -m venv .venv
  fi

  if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
    print_error "Falha ao preparar Python em $BACKEND_DIR/.venv/bin/python"
    exit 1
  fi

  if [ ! -x "$BACKEND_DIR/.venv/bin/pip" ] || needs_install "$BACKEND_DEPS_STAMP" "$BACKEND_DIR/pyproject.toml"; then
    print_info "Instalando dependencias do backend"
    cd "$BACKEND_DIR"
    .venv/bin/pip install -q --disable-pip-version-check -e .
    touch "$BACKEND_DEPS_STAMP"
    print_ok "Dependencias do backend instaladas"
    return 0
  fi

  print_ok "Dependencias do backend prontas"
}

port_is_free() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    [ -z "$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)" ]
    return $?
  fi
  return 0
}

print_port_owner() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  else
    printf 'Instale lsof para diagnosticar a porta %s.\n' "$port"
  fi
}

require_port_free() {
  local port=$1
  local label=$2

  if ! port_is_free "$port"; then
    print_error "$label precisa da porta $port, mas ela ja esta em uso."
    print_port_owner "$port" >&2
    print_error "Pare esse processo explicitamente ou use portas alternativas por BACKEND_PORT/FRONTEND_PORT/CANDIDATE_PORTAL_PORT."
    exit 1
  fi
}

wait_for_http() {
  local url=$1
  local label=$2
  local timeout=${3:-30}
  local elapsed=0

  print_info "Verificando $label em $url..."
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      print_ok "$label acessivel: $url"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  print_error "$label nao acessivel em $url."
  print_error "Verifique host, porta, firewall ou CORS."
  exit 1
}

wait_for_backend_health() {
  local url=$1
  local timeout=${2:-30}
  local elapsed=0
  local response=""

  print_info "Verificando backend em $url..."
  while [ "$elapsed" -lt "$timeout" ]; do
    response=$(curl -fsS "$url" 2>/dev/null || true)
    if [[ "$response" == *'"status":"ok"'* && "$response" == *'"connected":true'* ]]; then
      print_ok "Backend saudavel: $url"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  print_error "Backend nao acessivel na rede. Verifique host, porta, firewall ou CORS."
  [ -n "$response" ] && print_error "Ultima resposta: $response"
  exit 1
}

check_redis() {
  if [ "$INCLUDE_CELERY" != "true" ]; then
    print_info "Redis/Celery omitidos por INCLUDE_CELERY=false"
    return 0
  fi

  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    print_ok "Redis disponivel"
    return 0
  fi

  print_error "Redis nao esta rodando. Inicie com: redis-server --daemonize yes"
  exit 1
}

json_origin_list() {
  local json="["
  local sep=""
  local origin
  for origin in "$@"; do
    json="${json}${sep}\"${origin}\""
    sep=","
  done
  json="${json}]"
  printf '%s\n' "$json"
}

CHILD_PIDS=()
CLEANUP_DONE=0

kill_tree() {
  local signal=$1
  local root=$2
  local descendants child

  if ! kill -0 "$root" 2>/dev/null; then
    return 0
  fi

  if command -v pgrep >/dev/null 2>&1; then
    descendants=$(pgrep -P "$root" 2>/dev/null || true)
    for child in $descendants; do
      kill_tree "$signal" "$child"
    done
  fi

  kill "-$signal" "$root" 2>/dev/null || true
}

cleanup() {
  if [ "$CLEANUP_DONE" -eq 1 ]; then
    return 0
  fi
  CLEANUP_DONE=1
  print_info "Encerrando servicos..."
  local pid
  for pid in "${CHILD_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      printf '[..] SIGTERM em PID %s e descendentes\n' "$pid"
      kill_tree TERM "$pid"
    fi
  done
  sleep 2
  for pid in "${CHILD_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      printf '[!!] SIGKILL fallback em PID %s\n' "$pid"
      kill_tree KILL "$pid"
    fi
  done
  print_ok "Shutdown concluido."
}

if [ ! -f "$BACKEND_DIR/.env" ]; then
  print_error "Arquivo $BACKEND_DIR/.env nao encontrado."
  echo "Crie esse arquivo antes de rodar o ambiente completo."
  exit 1
fi

LAN_HOST=""
if [ "$DEV_MODE" = "network" ]; then
  print_info "Modo network ativado. Detectando IP da LAN..."
  LAN_HOST=$(get_local_ip || true)
  if [ -z "$LAN_HOST" ] || [ "$LAN_HOST" = "127.0.0.1" ] || [ "$LAN_HOST" = "localhost" ]; then
    print_error "Nao foi possivel detectar um IP de rede valido."
    print_error "Informe manualmente: DEV_PUBLIC_HOST=192.168.x.x npm run dev:full -- --network"
    exit 1
  fi
  print_ok "IP da LAN: $LAN_HOST"
fi

PUBLIC_HOST="127.0.0.1"
if [ "$DEV_MODE" = "network" ]; then
  PUBLIC_HOST="$LAN_HOST"
fi

BACKEND_LOCAL_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_LOCAL_URL="http://127.0.0.1:${FRONTEND_PORT}"
PORTAL_LOCAL_URL="http://127.0.0.1:${CANDIDATE_PORTAL_PORT}"
BACKEND_PUBLIC_URL="http://${PUBLIC_HOST}:${BACKEND_PORT}"
FRONTEND_PUBLIC_URL="http://${PUBLIC_HOST}:${FRONTEND_PORT}"
PORTAL_PUBLIC_URL="http://${PUBLIC_HOST}:${CANDIDATE_PORTAL_PORT}"
API_V1_URL="${BACKEND_PUBLIC_URL}/api/v1"

print_section "Ambiente"
printf 'Modo             : %s\n' "$DEV_MODE"
printf 'Bind host        : %s\n' "$BIND_HOST"
printf 'Backend local    : %s\n' "$BACKEND_LOCAL_URL"
printf 'Frontend local   : %s\n' "$FRONTEND_LOCAL_URL"
printf 'Portal local     : %s\n' "$PORTAL_LOCAL_URL"
if [ "$DEV_MODE" = "network" ]; then
  printf 'Backend network  : %s\n' "$BACKEND_PUBLIC_URL"
  printf 'Frontend network : %s\n' "$FRONTEND_PUBLIC_URL"
  printf 'Portal network   : %s\n' "$PORTAL_PUBLIC_URL"
fi
printf 'VITE_API_URL     : %s\n' "$API_V1_URL"
printf 'Uso              : LAN/dev apenas; nao exponha estas portas na internet.\n'

print_section "Dependencias"
ensure_root_dependencies
ensure_frontend_dependencies
ensure_candidate_portal_dependencies
ensure_backend_dependencies

if [ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]; then
  print_error "uvicorn nao encontrado em $BACKEND_DIR/.venv/bin/uvicorn."
  exit 1
fi

print_section "Redis"
check_redis

print_section "Portas"
require_port_free "$BACKEND_PORT" "Backend"
require_port_free "$FRONTEND_PORT" "Frontend staff/admin"
if [ "$INCLUDE_CANDIDATE_PORTAL" = "true" ]; then
  require_port_free "$CANDIDATE_PORTAL_PORT" "Candidate portal"
fi
print_ok "Portas necessarias estao livres."

ORIGINS=(
  "http://localhost:${FRONTEND_PORT}"
  "http://127.0.0.1:${FRONTEND_PORT}"
  "http://localhost:${CANDIDATE_PORTAL_PORT}"
  "http://127.0.0.1:${CANDIDATE_PORTAL_PORT}"
)
if [ "$DEV_MODE" = "network" ]; then
  ORIGINS+=(
    "http://${LAN_HOST}:${FRONTEND_PORT}"
    "http://${LAN_HOST}:${CANDIDATE_PORTAL_PORT}"
  )
fi

export BACKEND_PORT
export FRONTEND_PORT
export CANDIDATE_PORTAL_PORT
export BACKEND_HOST="$BIND_HOST"
export VITE_API_URL="$API_V1_URL"
export VITE_API_BASE_URL="$BACKEND_PUBLIC_URL"
export VITE_PUBLIC_API_BASE_URL="${API_V1_URL}/public"
export VITE_CANDIDATE_PORTAL_URL="$PORTAL_PUBLIC_URL"
export CORS_ORIGINS
CORS_ORIGINS=$(json_origin_list "${ORIGINS[@]}")

print_section "Config dinamica"
printf 'CORS_ORIGINS     : %s\n' "$CORS_ORIGINS"
printf 'VITE_API_BASE_URL: %s\n' "$VITE_API_BASE_URL"
printf 'VITE_PUBLIC_API_BASE_URL: %s\n' "$VITE_PUBLIC_API_BASE_URL"

trap cleanup EXIT INT TERM HUP

print_section "Servicos"
print_info "Subindo backend FastAPI..."
(
  cd "$BACKEND_DIR"
  .venv/bin/uvicorn src.interface.api.main:app \
    --reload \
    --reload-dir src \
    --reload-dir scripts \
    --reload-exclude ".venv/*" \
    --reload-exclude "tests/*" \
    --host "$BIND_HOST" \
    --port "$BACKEND_PORT" \
    --no-access-log \
    --log-level warning
) &
BACKEND_PID=$!
CHILD_PIDS+=("$BACKEND_PID")
print_ok "Backend iniciado (PID $BACKEND_PID)"

print_info "Subindo frontend staff/admin..."
(
  cd "$FRONTEND_DIR"
  npm run --silent dev -- --host "$BIND_HOST" --port "$FRONTEND_PORT" --strictPort
) &
STAFF_PID=$!
CHILD_PIDS+=("$STAFF_PID")
print_ok "Frontend staff iniciado (PID $STAFF_PID)"

if [ "$INCLUDE_CANDIDATE_PORTAL" = "true" ]; then
  print_info "Subindo candidate-portal..."
  (
    cd "$CANDIDATE_PORTAL_DIR"
    npm run --silent dev -- --host "$BIND_HOST" --port "$CANDIDATE_PORTAL_PORT" --strictPort
  ) &
  CANDIDATE_PORTAL_PID=$!
  CHILD_PIDS+=("$CANDIDATE_PORTAL_PID")
  print_ok "Candidate portal iniciado (PID $CANDIDATE_PORTAL_PID)"
else
  print_info "Candidate portal nao incluido."
fi

if [ "$INCLUDE_CELERY" = "true" ]; then
  print_info "Subindo worker Celery..."
  (
    cd "$BACKEND_DIR"
    .venv/bin/celery -A src.infrastructure.queue.celery_app worker \
      --queues=analysis,matching,document_ai,extraction,behavioral_ai \
      --loglevel=warning \
      --concurrency=2
  ) &
  CELERY_PID=$!
  CHILD_PIDS+=("$CELERY_PID")
  print_ok "Worker Celery iniciado (PID $CELERY_PID)"
fi

print_section "Verificacao"
wait_for_backend_health "${BACKEND_PUBLIC_URL}/health" 45
wait_for_http "$FRONTEND_PUBLIC_URL" "Frontend staff/admin" 45
if [ "$INCLUDE_CANDIDATE_PORTAL" = "true" ]; then
  wait_for_http "$PORTAL_PUBLIC_URL" "Candidate portal" 45
fi

print_section "Pronto"
printf 'Backend          : %s\n' "$BACKEND_LOCAL_URL"
printf 'Frontend         : %s\n' "$FRONTEND_LOCAL_URL"
printf 'Candidate Portal : %s\n' "$PORTAL_LOCAL_URL"
if [ "$DEV_MODE" = "network" ]; then
  printf 'Backend network  : %s\n' "$BACKEND_PUBLIC_URL"
  printf 'Frontend network : %s\n' "$FRONTEND_PUBLIC_URL"
  printf 'Portal network   : %s\n' "$PORTAL_PUBLIC_URL"
fi
printf 'API dos frontends: %s\n' "$API_V1_URL"

while true; do
  for pid in "${CHILD_PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      print_error "Processo filho PID $pid encerrou inesperadamente. Encerrando o ambiente..."
      exit 1
    fi
  done
  sleep 5
done
