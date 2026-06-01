#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
CANDIDATE_PORTAL_DIR="$ROOT_DIR/candidate-portal"
ROOT_DEPS_STAMP="$ROOT_DIR/node_modules/.deps-stamp"
FRONTEND_DEPS_STAMP="$FRONTEND_DIR/node_modules/.deps-stamp"
BACKEND_DEPS_STAMP="$BACKEND_DIR/.venv/.deps-stamp"
CANDIDATE_PORTAL_DEPS_STAMP="$CANDIDATE_PORTAL_DIR/node_modules/.deps-stamp"

# Comandos manuais (rodar apenas quando necessario):
# Migrations:  cd backend && alembic upgrade head
# Reset banco: npm run backend:bootstrap
# Seed admin:  cd backend && python scripts/seed_admin.py
# Seed vagas:  cd backend && python scripts/seed_jobs.py
# Seed AI:     cd backend && python scripts/seed_ai_models.py
# Seed score:  cd backend && python scripts/seed_scoring.py

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
  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || printf '127.0.0.1'
  elif command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  else
    printf '127.0.0.1'
  fi
}

needs_install() {
  stamp_file=$1
  shift

  if [ ! -f "$stamp_file" ]; then
    return 0
  fi

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

ensure_candidate_portal_dependencies() {
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

read_frontend_api_url() {
  if [ -n "${VITE_API_URL:-}" ]; then
    printf '%s\n' "$VITE_API_URL"
    return 0
  fi

  if [ -n "${VITE_API_BASE_URL:-}" ]; then
    printf '%s\n' "$VITE_API_BASE_URL"
    return 0
  fi

  for file in \
    "$FRONTEND_DIR/.env.development.local" \
    "$FRONTEND_DIR/.env.local" \
    "$FRONTEND_DIR/.env.development" \
    "$FRONTEND_DIR/.env"
  do
    if [ -f "$file" ]; then
      value=$(grep "^VITE_API_URL=" "$file" 2>/dev/null | tail -n 1 | cut -d'=' -f2)
      if [ -n "$value" ]; then
        printf '%s\n' "$value"
        return 0
      fi

      value=$(grep "^VITE_API_BASE_URL=" "$file" 2>/dev/null | tail -n 1 | cut -d'=' -f2)
      if [ -n "$value" ]; then
        printf '%s\n' "$value"
        return 0
      fi
    fi
  done

  printf '%s\n' "http://127.0.0.1:8000"
}

read_frontend_port() {
  if [ -n "${FRONTEND_PORT:-}" ]; then
    printf '%s\n' "$FRONTEND_PORT"
    return 0
  fi

  port=$(grep "port:[[:space:]]*[0-9]" "$FRONTEND_DIR/vite.config.ts" 2>/dev/null | sed -E 's/.*port:[[:space:]]*([0-9]+).*/\1/' | head -n 1)
  if [ -n "$port" ]; then
    printf '%s\n' "$port"
    return 0
  fi

  printf '%s\n' "5173"
}

read_candidate_portal_port() {
  if [ -n "${CANDIDATE_PORTAL_PORT:-}" ]; then
    printf '%s\n' "$CANDIDATE_PORTAL_PORT"
    return 0
  fi

  port=$(grep "port:[[:space:]]*[0-9]" "$CANDIDATE_PORTAL_DIR/vite.config.ts" 2>/dev/null | sed -E 's/.*port:[[:space:]]*([0-9]+).*/\1/' | head -n 1)
  if [ -n "$port" ]; then
    printf '%s\n' "$port"
    return 0
  fi

  printf '%s\n' "5174"
}

extract_port() {
  url=$1
  port=$(printf '%s\n' "$url" | sed -E 's#^[a-zA-Z]+://[^/:]+:([0-9]+).*$#\1#')
  [ "$port" != "$url" ] && printf '%s\n' "$port" || printf '%s\n' "8000"
}

port_is_free() {
  port=$1

  if command -v lsof >/dev/null 2>&1; then
    [ -z "$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)" ]
    return $?
  fi

  if [ "$(uname)" != "Darwin" ] && command -v fuser >/dev/null 2>&1; then
    ! fuser "$port/tcp" >/dev/null 2>&1
    return $?
  fi

  return 0
}

print_port_owner() {
  port=$1

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  elif [ "$(uname)" != "Darwin" ] && command -v fuser >/dev/null 2>&1; then
    fuser -v "$port/tcp" 2>/dev/null || true
  else
    printf 'Instale lsof ou fuser para diagnosticar a porta %s.\n' "$port"
  fi
}

require_port_free() {
  port=$1
  label=$2

  if ! port_is_free "$port"; then
    print_error "$label precisa da porta $port, mas ela ja esta em uso."
    print_port_owner "$port" >&2
    print_error "Pare esse processo explicitamente ou use: npm run dev:ports"
    exit 1
  fi
}

wait_for_port_listening() {
  port=$1
  timeout=${2:-30}
  elapsed=0

  while [ "$elapsed" -lt "$timeout" ]; do
    if ! port_is_free "$port"; then
      return 0
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  print_error "Porta $port nao abriu dentro de ${timeout}s"
  exit 1
}

check_redis() {
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping >/dev/null 2>&1; then
      print_ok "Redis disponivel"
      return 0
    fi
  fi
  print_error "Redis nao esta rodando. Inicie com: redis-server --daemonize yes"
  exit 1
}

CHILD_PIDS=""
CLEANUP_DONE=0

# Mata o PID + descendentes recursivamente. Bottom-up: filhos primeiro,
# depois o pai. Sinal configurável (TERM ou KILL).
kill_tree() {
  signal=$1
  root=$2

  if ! kill -0 "$root" 2>/dev/null; then
    return 0
  fi

  if command -v pgrep >/dev/null 2>&1; then
    descendants=$(pgrep -P "$root" 2>/dev/null || true)
    for child in $descendants; do
      kill_tree "$signal" "$child"
    done
  fi
  kill -"$signal" "$root" 2>/dev/null || true
}

cleanup() {
  # Idempotente: trap pode disparar várias vezes (EXIT depois de INT, etc.).
  if [ "$CLEANUP_DONE" -eq 1 ]; then
    return 0
  fi
  CLEANUP_DONE=1

  print_info "Encerrando servicos..."

  # 1) SIGTERM nos filhos rastreados + descendentes (Celery prefork,
  #    concurrently → vite/uvicorn). Targeting por PID é mais confiável que
  #    pattern matching: cobre workers cujo cmdline não inclui "-A ...".
  for pid in $CHILD_PIDS; do
    if kill -0 "$pid" 2>/dev/null; then
      printf '[..] SIGTERM em PID %s e descendentes\n' "$pid"
      kill_tree TERM "$pid"
    fi
  done

  # 2) Aguarda até 5s pelo encerramento gracioso.
  elapsed=0
  while [ "$elapsed" -lt 5 ]; do
    still_alive=""
    for pid in $CHILD_PIDS; do
      if kill -0 "$pid" 2>/dev/null; then
        still_alive="$still_alive $pid"
      fi
    done
    if [ -z "$still_alive" ]; then
      break
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  # 3) SIGKILL fallback nos remanescentes (PIDs rastreados).
  for pid in $CHILD_PIDS; do
    if kill -0 "$pid" 2>/dev/null; then
      printf '[!!] SIGKILL fallback em PID %s\n' "$pid"
      kill_tree KILL "$pid"
    fi
  done

  print_ok "Shutdown concluido."
}

# ─────────────────────────────────────────
# ENTRYPOINT
# ─────────────────────────────────────────

if [ ! -f "$BACKEND_DIR/.env" ]; then
  print_error "Arquivo $BACKEND_DIR/.env nao encontrado."
  echo "Crie esse arquivo antes de rodar o ambiente completo."
  exit 1
fi

RAW_API_URL=$(read_frontend_api_url)
BACKEND_PORT=$(extract_port "$RAW_API_URL")
FRONTEND_PORT=$(read_frontend_port)
CANDIDATE_PORTAL_PORT=$(read_candidate_portal_port)
LOCAL_IP=$(get_local_ip)

EXPECTED_API_URL="http://localhost:$BACKEND_PORT"

print_section "Ambiente"
printf 'frontend local       : http://localhost:%s\n' "$FRONTEND_PORT"
printf 'frontend rede        : http://%s:%s\n' "$LOCAL_IP" "$FRONTEND_PORT"
printf 'candidate portal local : http://localhost:%s\n' "$CANDIDATE_PORTAL_PORT"
printf 'candidate portal rede  : http://%s:%s\n' "$LOCAL_IP" "$CANDIDATE_PORTAL_PORT"
printf 'backend local        : http://127.0.0.1:%s\n' "$BACKEND_PORT"
printf 'backend rede         : http://%s:%s\n' "$LOCAL_IP" "$BACKEND_PORT"
printf 'api url              : %s\n' "$EXPECTED_API_URL"

print_section "Dependencias"
(
  ensure_root_dependencies &
  ensure_frontend_dependencies &
  ensure_candidate_portal_dependencies &
  wait
)

ensure_backend_dependencies

if [ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]; then
  print_error "uvicorn nao encontrado em $BACKEND_DIR/.venv/bin/uvicorn mesmo apos instalar dependencias."
  exit 1
fi

print_section "Redis"
check_redis

print_section "Portas"
require_port_free "$BACKEND_PORT" "Backend"
require_port_free "$FRONTEND_PORT" "Frontend staff/admin"
require_port_free "$CANDIDATE_PORTAL_PORT" "Candidate portal"
print_ok "Portas 8000/5173/5174 verificadas sem encerrar processos existentes"

export FRONTEND_PORT
export BACKEND_PORT
export CANDIDATE_PORTAL_PORT
export HOST="0.0.0.0"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-$EXPECTED_API_URL}"
export VITE_API_URL="${VITE_API_URL:-$EXPECTED_API_URL/api/v1}"
export VITE_PUBLIC_API_BASE_URL="${VITE_PUBLIC_API_BASE_URL:-$EXPECTED_API_URL/api/v1/public}"
DEV_FULL_FAIL_ON_WORKER_EXIT="${DEV_FULL_FAIL_ON_WORKER_EXIT:-false}"
export DEV_FULL_FAIL_ON_WORKER_EXIT

# EXIT garante limpeza em qualquer saída (inclusive set -e ou wait
# retornando porque algum filho morreu). HUP cobre o caso do terminal
# fechar sem propagar TERM via concurrently.
trap cleanup EXIT INT TERM HUP

print_section "Servicos"
print_info "Subindo frontend, candidate-portal, backend e worker Celery"
if [ "$DEV_FULL_FAIL_ON_WORKER_EXIT" = "true" ]; then
  print_info "Worker Celery esta configurado como CRITICO (falha no worker derruba o ambiente)."
else
  print_info "Worker Celery esta configurado como AUXILIAR (falha no worker NAO derruba o ambiente)."
fi

cd "$BACKEND_DIR"
.venv/bin/celery -A src.infrastructure.queue.celery_app worker \
  --queues=analysis,matching,document_ai,extraction,behavioral_ai \
  --loglevel=warning \
  --concurrency=2 &
CELERY_PID=$!
CHILD_PIDS="$CHILD_PIDS $CELERY_PID"
print_ok "Worker Celery iniciado (PID $CELERY_PID)"

cd "$ROOT_DIR"
npm run --silent dev:backend &
BACKEND_PID=$!
CHILD_PIDS="$CHILD_PIDS $BACKEND_PID"
print_ok "Backend iniciado (PID $BACKEND_PID)"

npm run --silent dev:staff &
STAFF_PID=$!
CHILD_PIDS="$CHILD_PIDS $STAFF_PID"
print_ok "Frontend staff iniciado (PID $STAFF_PID)"

cd "$ROOT_DIR"
npm run --silent dev:candidate &
CANDIDATE_PORTAL_PID=$!
CHILD_PIDS="$CHILD_PIDS $CANDIDATE_PORTAL_PID"
print_ok "Candidate portal iniciado (PID $CANDIDATE_PORTAL_PID)"

wait_for_port_listening "$BACKEND_PORT" 30
wait_for_port_listening "$FRONTEND_PORT" 30
wait_for_port_listening "$CANDIDATE_PORTAL_PORT" 30
print_ok "Servicos respondendo nas portas configuradas"

# Loop de monitoramento: frontend/backend são críticos; Celery é auxiliar por
# padrão para que falhas operacionais da fila de IA não derrubem o dev-full.
while true; do
  for pid in $CHILD_PIDS; do
    if ! kill -0 "$pid" 2>/dev/null; then
      if [ "$pid" = "$CELERY_PID" ] && [ "$DEV_FULL_FAIL_ON_WORKER_EXIT" != "true" ]; then
        print_error "Worker Celery PID $pid encerrou; frontend/backend continuam ativos."
        new_child_pids=""
        for other_pid in $CHILD_PIDS; do
          if [ "$other_pid" != "$pid" ]; then
            new_child_pids="$new_child_pids $other_pid"
          fi
        done
        CHILD_PIDS="$new_child_pids"
        continue
      fi
      print_error "Filho PID $pid encerrou prematuramente; iniciando shutdown."
      exit 1
    fi
  done
  sleep 1
done
