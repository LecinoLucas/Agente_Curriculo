#!/usr/bin/env bash
# Health check para dev:full local (sem Docker).
#
# Uso:
#   bash scripts/diagnostics/dev_full_local_health.sh
#
# Variaveis de ambiente opcionais:
#   BACKEND_PORT   — porta do backend FastAPI (padrao: 8000)
#   FRONTEND_PORT  — porta do frontend staff (padrao: 5173)
#   REDIS_HOST     — host Redis (padrao: localhost)
#   REDIS_PORT     — porta Redis (padrao: 6379)
#
# Este script e somente leitura. Nao altera dados, processos ou configuracoes.

set -uo pipefail

BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
BACKEND_ENV="$ROOT_DIR/backend/.env"

PASS=0
WARN=0
FAIL=0

_ok()   { printf '  \033[32m[ok]\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
_warn() { printf '  \033[33m[!!]\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
_fail() { printf '  \033[31m[xx]\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
_section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

echo "======================================================"
echo "DEV FULL LOCAL — health check"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "======================================================"

# ── 1. Backend ─────────────────────────────────────────────────────────────────
_section "Backend (porta $BACKEND_PORT)"

if ! command -v curl >/dev/null 2>&1; then
  _warn "curl nao encontrado — pulando checagem de backend"
else
  _resp=$(curl -fsS --max-time 5 "http://localhost:${BACKEND_PORT}/health" 2>/dev/null || true)
  if [ -z "$_resp" ]; then
    _fail "Backend nao respondeu em http://localhost:${BACKEND_PORT}/health"
    _warn "Inicie com: npm run dev:backend (ou npm run dev:full)"
  else
    if echo "$_resp" | grep -q '"status":"ok"'; then
      _ok "Backend respondeu com status ok"
    else
      _warn "Backend respondeu mas status nao e ok: $_resp"
    fi
    if echo "$_resp" | grep -q '"connected":true'; then
      _ok "Database conectado (relatado pelo backend)"
    else
      _fail "Database NAO conectado (relatado pelo backend)"
    fi
    if echo "$_resp" | grep -q '"redis".*"connected":true'; then
      _ok "Redis conectado (relatado pelo backend)"
    else
      _warn "Redis pode nao estar conectado (checar /health resposta)"
    fi
  fi
fi

# ── 2. Frontend ────────────────────────────────────────────────────────────────
_section "Frontend staff (porta $FRONTEND_PORT)"

if ! command -v curl >/dev/null 2>&1; then
  _warn "curl nao encontrado — pulando checagem de frontend"
else
  _fstatus=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:${FRONTEND_PORT}/" 2>/dev/null || echo "000")
  if [ "$_fstatus" = "200" ] || [ "$_fstatus" = "304" ]; then
    _ok "Frontend respondeu com HTTP $_fstatus em http://localhost:${FRONTEND_PORT}"
  elif [ "$_fstatus" = "000" ]; then
    _fail "Frontend nao acessivel em http://localhost:${FRONTEND_PORT}"
    _warn "Inicie com: npm run dev:staff (ou npm run dev:full)"
  else
    _warn "Frontend respondeu com HTTP $_fstatus (esperado 200/304)"
  fi
fi

# ── 3. Redis ───────────────────────────────────────────────────────────────────
_section "Redis ($REDIS_HOST:$REDIS_PORT)"

if ! command -v redis-cli >/dev/null 2>&1; then
  _warn "redis-cli nao encontrado — pulando checagem de Redis"
  _warn "Instale: brew install redis"
else
  _ping=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING 2>/dev/null || true)
  if [ "$_ping" = "PONG" ]; then
    _ok "Redis respondeu PONG"
    _dbsize=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE 2>/dev/null || echo "?")
    _ok "DB0 chaves: $_dbsize"
  else
    _fail "Redis nao respondeu em $REDIS_HOST:$REDIS_PORT"
    _warn "Inicie com: redis-server --daemonize yes"
    _warn "Ou via Homebrew: brew services start redis"
  fi
fi

# ── 4. Configuracao .env ───────────────────────────────────────────────────────
_section "Configuracao (backend/.env)"

if [ ! -f "$BACKEND_ENV" ]; then
  _fail "Arquivo backend/.env nao encontrado"
  _warn "Crie com base em backend/.env.example"
else
  _ok "backend/.env existe"

  # DATABASE_URL
  _db_url=$(grep -E "^DATABASE_URL=" "$BACKEND_ENV" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
  if [ -z "$_db_url" ]; then
    _fail "DATABASE_URL nao definida em backend/.env"
  elif echo "$_db_url" | grep -qiE "supabase|neon|planetscale|railway|render|heroku|aws|azure|cloud"; then
    _warn "DATABASE_URL aponta para servico externo/nuvem — confirme que nao e producao"
    _warn "  $( echo "$_db_url" | sed 's|//[^:]*:[^@]*@|//***:***@|')"
  elif echo "$_db_url" | grep -qiE "localhost|127\.0\.0\.1|0\.0\.0\.0|::1"; then
    _ok "DATABASE_URL aponta para banco local"
  else
    _warn "DATABASE_URL com host desconhecido — verifique se e banco de dev"
  fi

  # REDIS_URL
  _redis_url=$(grep -E "^REDIS_URL=" "$BACKEND_ENV" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
  if [ -z "$_redis_url" ]; then
    _warn "REDIS_URL nao definida em backend/.env (padrao: redis://localhost:6379/0)"
  elif echo "$_redis_url" | grep -qiE "localhost|127\.0\.0\.1"; then
    _ok "REDIS_URL aponta para Redis local"
  else
    _warn "REDIS_URL com host remoto: $_redis_url"
  fi
fi

# ── 5. Seguranca — flags ERP/Protheus ─────────────────────────────────────────
_section "Seguranca — flags Protheus/ERP"

if [ ! -f "$BACKEND_ENV" ]; then
  _warn "backend/.env nao encontrado — nao foi possivel verificar flags ERP"
else
  _real_send=$(grep -E "^PROTHEUS_REAL_SEND_ENABLED=" "$BACKEND_ENV" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || true)
  _erp_allow=$(grep -E "^ERP_ALLOW_REAL_SEND=" "$BACKEND_ENV" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || true)

  if [ "${_real_send:-false}" = "false" ] || [ -z "$_real_send" ]; then
    _ok "PROTHEUS_REAL_SEND_ENABLED=false (seguro)"
  else
    _fail "PROTHEUS_REAL_SEND_ENABLED=$_real_send — ALERTA: envio real habilitado"
  fi

  if [ "${_erp_allow:-false}" = "false" ] || [ -z "$_erp_allow" ]; then
    _ok "ERP_ALLOW_REAL_SEND=false (seguro)"
  else
    _fail "ERP_ALLOW_REAL_SEND=$_erp_allow — ALERTA: envio real habilitado"
  fi
fi

# ── 6. Processos locais ────────────────────────────────────────────────────────
_section "Processos locais"

if command -v pgrep >/dev/null 2>&1; then
  _uvicorn_pids=$(pgrep -f "uvicorn.*main:app" 2>/dev/null | tr '\n' ' ' || true)
  if [ -n "$_uvicorn_pids" ]; then
    _ok "Uvicorn rodando (PIDs: $_uvicorn_pids)"
  else
    _warn "Uvicorn nao encontrado entre processos locais"
  fi

  _celery_pids=$(pgrep -f "celery.*worker" 2>/dev/null | tr '\n' ' ' || true)
  if [ -n "$_celery_pids" ]; then
    _ok "Celery worker rodando (PIDs: $_celery_pids)"
  else
    _warn "Celery worker nao rodando"
  fi
else
  _warn "pgrep nao disponivel — pulando checagem de processos"
fi

# ── Resumo ─────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
printf 'RESULTADO: %d ok | %d avisos | %d falhas\n' "$PASS" "$WARN" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "STATUS: FAIL"
  echo "======================================================"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "STATUS: WARN"
  echo "======================================================"
  exit 0
else
  echo "STATUS: PASS"
  echo "======================================================"
  exit 0
fi
