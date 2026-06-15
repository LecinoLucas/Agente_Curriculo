#!/usr/bin/env bash
# docker-full.sh — Sobe o stack Docker local completo para desenvolvimento.
# Uso: npm run docker:full
#      bash scripts/docker-full.sh [--build] [--fresh] [--skip-bootstrap] [--logs]

set -Eeuo pipefail

node "$(dirname -- "${BASH_SOURCE[0]}")/validate-repo-root.js"

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"
ENV_FILE="$ROOT_DIR/.env.docker.local"

OPT_BUILD=false
OPT_FRESH=false
OPT_SKIP_BOOTSTRAP=false
OPT_LOGS=false

usage() {
  cat <<'EOF'
Uso:
  npm run docker:full
  bash scripts/docker-full.sh [opcoes]

Opcoes:
  --build           Rebuild das imagens Docker antes de subir
  --fresh           Para containers, apaga volumes e recria do zero (pede confirmacao)
  --skip-bootstrap  Nao executa migrations + seed (bootstrap_dev.py)
  --logs            Mostra logs ao vivo apos subir (Ctrl+C para sair)
  -h, --help        Exibe este texto

Variaveis de ambiente:
  CONFIRM_FRESH=1   Pula confirmacao do --fresh (para CI/automacao)

Exemplos:
  bash scripts/docker-full.sh
  bash scripts/docker-full.sh --build
  bash scripts/docker-full.sh --fresh
  CONFIRM_FRESH=1 bash scripts/docker-full.sh --fresh
  bash scripts/docker-full.sh --skip-bootstrap --logs
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --build)          OPT_BUILD=true;          shift ;;
    --fresh)          OPT_FRESH=true;          shift ;;
    --skip-bootstrap) OPT_SKIP_BOOTSTRAP=true; shift ;;
    --logs)           OPT_LOGS=true;           shift ;;
    -h|--help)        usage; exit 0 ;;
    *)
      printf '[ERROR] Opcao desconhecida: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

_green()  { printf '\033[0;32m%s\033[0m' "$*"; }
_yellow() { printf '\033[0;33m%s\033[0m' "$*"; }
_red()    { printf '\033[0;31m%s\033[0m' "$*"; }

print_section() { printf '\n\033[1;34m== %s ==\033[0m\n' "$*"; }
print_ok()      { printf '%s %s\n' "$(_green  '[ok]')" "$*"; }
print_info()    { printf '\033[0;36m[..]\033[0m %s\n' "$*"; }
print_warn()    { printf '%s %s\n' "$(_yellow '[!!]')" "$*"; }

COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# ── 1. Verificar/criar .env.docker.local ──────────────────────────────────────
print_section "Verificando .env.docker.local"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ROOT_DIR/.env.docker" ]; then
    cp "$ROOT_DIR/.env.docker" "$ENV_FILE"
    print_warn ".env.docker.local ausente — copiado de .env.docker (configuracao anterior)"
  elif [ -f "$ROOT_DIR/.env.docker.example" ]; then
    cp "$ROOT_DIR/.env.docker.example" "$ENV_FILE"
    print_warn ".env.docker.local ausente — copiado de .env.docker.example"
    print_warn "Edite $ENV_FILE com secrets reais antes de usar."
  else
    printf '%s .env.docker.local nao encontrado e nenhum template disponivel.\n' "$(_red '[ERROR]')" >&2
    exit 1
  fi
else
  print_ok ".env.docker.local encontrado"
fi

# ── 2. Fresh: derrubar containers e volumes ───────────────────────────────────
if [ "$OPT_FRESH" = "true" ]; then
  print_section "Modo --fresh: removendo containers e volumes"
  if [ "${CONFIRM_FRESH:-}" != "1" ]; then
    printf '%s Isso vai apagar todos os dados locais do banco. Continuar? [s/N] ' "$(_yellow 'AVISO:')"
    read -r _reply
    case "$_reply" in
      [sS]|[sS][iI][mM]) ;;
      *) printf 'Cancelado.\n'; exit 0 ;;
    esac
  fi
  $COMPOSE down -v --remove-orphans 2>/dev/null || true
  print_ok "Volumes removidos"
fi

# ── 3. Build opcional ─────────────────────────────────────────────────────────
if [ "$OPT_BUILD" = "true" ]; then
  print_section "Rebuild das imagens"
  $COMPOSE build
  print_ok "Build concluido"
fi

# ── 4. Garantir diretório de uploads compartilhado ───────────────────────────
mkdir -p "$ROOT_DIR/uploads"

# ── 5. Infraestrutura: postgres + redis ───────────────────────────────────────
print_section "Subindo infraestrutura (postgres + redis)"
$COMPOSE up -d --wait postgres redis
print_ok "postgres e redis healthy"

# ── 5. Bootstrap: migrations + seed ──────────────────────────────────────────
if [ "$OPT_SKIP_BOOTSTRAP" = "false" ]; then
  print_section "Bootstrap: migrations + seed"
  $COMPOSE run --rm backend-api python scripts/bootstrap_dev.py
  print_ok "Bootstrap concluido"
else
  print_info "Bootstrap ignorado (--skip-bootstrap)"
fi

# ── 6. Stack completa ─────────────────────────────────────────────────────────
print_section "Subindo stack completa"
$COMPOSE up -d
print_ok "Todos os servicos iniciados"

# ── 7. Aguardar backend API ───────────────────────────────────────────────────
print_section "Aguardando backend API"
_attempts=0
_max=30
until curl -fsS "http://localhost:8000/health/live" > /dev/null 2>&1; do
  if [ "$_attempts" -ge "$_max" ]; then
    print_warn "Backend nao respondeu apos ${_max} tentativas — verifique os logs:"
    printf '  %s logs backend-api\n' "$COMPOSE"
    break
  fi
  sleep 2
  _attempts=$((_attempts + 1))
done
[ "$_attempts" -lt "$_max" ] && print_ok "Backend API pronto (http://localhost:8000)"

# ── 8. Sumario ────────────────────────────────────────────────────────────────
print_section "Stack Docker local pronta"
printf '  %-24s %s\n' "Backend API:"      "http://localhost:8000"
printf '  %-24s %s\n' "Staff frontend:"   "http://localhost:5173"
printf '  %-24s %s\n' "Candidate portal:" "http://localhost:5174"
printf '\nComandos uteis:\n'
printf '  %s ps\n'       "$COMPOSE"
printf '  %s logs -f\n'  "$COMPOSE"
printf '  %s down\n'     "$COMPOSE"
printf '  %s down -v\n'  "$COMPOSE"

if [ "$OPT_LOGS" = "true" ]; then
  print_section "Logs ao vivo (Ctrl+C para sair)"
  $COMPOSE logs -f
fi
