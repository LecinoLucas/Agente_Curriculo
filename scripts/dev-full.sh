#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
ROOT_DEPS_STAMP="$ROOT_DIR/node_modules/.deps-stamp"
FRONTEND_DEPS_STAMP="$FRONTEND_DIR/node_modules/.deps-stamp"
BACKEND_DEPS_STAMP="$BACKEND_DIR/.venv/.deps-stamp"

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

# Verifica se arquivo foi modificado desde o stamp
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

# ===== INSTALAÇÃO DE DEPENDÊNCIAS (OTIMIZADO) =====

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

  print_ok "Dependencias da raiz prontas (cache valido)"
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

  print_ok "Dependencias do frontend prontas (cache valido)"
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

  print_ok "Dependencias do backend prontas (cache valido)"
}

# ===== LEITURA DE CONFIGURAÇÃO (OTIMIZADO) =====

read_frontend_api_url() {
  for file in \
    "$FRONTEND_DIR/.env.development.local" \
    "$FRONTEND_DIR/.env.local" \
    "$FRONTEND_DIR/.env.development" \
    "$FRONTEND_DIR/.env"
  do
    if [ -f "$file" ]; then
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
  port=$(grep "port:[[:space:]]*[0-9]" "$FRONTEND_DIR/vite.config.ts" 2>/dev/null | sed -E 's/.*port:[[:space:]]*([0-9]+).*/\1/' | head -n 1)
  if [ -n "$port" ]; then
    printf '%s\n' "$port"
    return 0
  fi

  printf '%s\n' "5173"
}

extract_port() {
  url=$1
  port=$(printf '%s\n' "$url" | sed -E 's#^[a-zA-Z]+://[^/:]+:([0-9]+).*$#\1#')
  [ "$port" != "$url" ] && printf '%s\n' "$port" || printf '%s\n' "8000"
}

# ===== LIMPEZA DE PORTAS (OTIMIZADO) =====

kill_port() {
  port=$1
  
  # Usar fuser é mais rápido que lsof em alguns sistemas
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "$port/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      kill $pids 2>/dev/null || true
      sleep 0.5
      
      remaining=$(lsof -ti tcp:"$port" 2>/dev/null || true)
      if [ -n "$remaining" ]; then
        kill -9 $remaining 2>/dev/null || true
      fi
    fi
  fi
}

kill_port_range() {
  start_port=$1
  end_port=$2
  
  # Matar portas em paralelo (melhor performance)
  for port in $(seq "$start_port" "$end_port"); do
    kill_port "$port" &
  done
  wait
}

# ===== INICIALIZAÇÃO DO BANCO (OTIMIZADO) =====

bootstrap_database() {
  cd "$ROOT_DIR"
  
  # Executar seeds em paralelo quando possível
  print_info "Preparando schema do banco para desenvolvimento"
  npm run --silent backend:bootstrap
  print_ok "Schema pronto"

  # Paralelizar se houver múltiplas seeds
  (
    (print_info "Garantindo usuario admin de desenvolvimento" && npm run --silent backend:seed-admin && print_ok "Usuario admin pronto") &
    (print_info "Inserindo vagas de desenvolvimento" && npm run --silent backend:seed-jobs && print_ok "Vagas de desenvolvimento prontas") &
    wait
  )
}

# ===== MAIN =====

# Validações iniciais (rápidas)
if [ ! -f "$BACKEND_DIR/.env" ]; then
  print_error "Arquivo $BACKEND_DIR/.env nao encontrado."
  echo "Crie esse arquivo antes de rodar o ambiente completo."
  exit 1
fi

if [ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ] 2>/dev/null; then
  # Apenas aviso, será criado nas dependências
  :
fi

# Ler configurações uma única vez
EXPECTED_API_URL=$(read_frontend_api_url)
BACKEND_PORT=$(extract_port "$EXPECTED_API_URL")
FRONTEND_PORT=$(read_frontend_port)
EXPECTED_API_URL="http://127.0.0.1:$BACKEND_PORT"

print_section "Ambiente"
printf 'frontend: http://localhost:%s\n' "$FRONTEND_PORT"
printf 'backend : http://127.0.0.1:%s\n' "$BACKEND_PORT"
printf 'api url : %s\n' "$EXPECTED_API_URL"

# Instalar dependências (pode executar raiz + frontend em paralelo)
print_section "Dependencias"
(
  ensure_root_dependencies &
  ensure_frontend_dependencies &
  wait
)
ensure_backend_dependencies

# Verificar uvicorn após instalar dependências
if [ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]; then
  print_error "uvicorn nao encontrado em $BACKEND_DIR/.venv/bin/uvicorn mesmo apos instalar dependencias."
  exit 1
fi

# Liberar portas (paralelizado)
print_section "Portas"
kill_port_range "$FRONTEND_PORT" "$((FRONTEND_PORT + 4))"
kill_port "$BACKEND_PORT" &
wait

# Setup do banco
print_section "Banco"
bootstrap_database

# Iniciar serviços
export FRONTEND_PORT
export BACKEND_PORT
export VITE_API_BASE_URL="$EXPECTED_API_URL"

print_section "Servicos"
print_info "Subindo frontend e backend"
cd "$ROOT_DIR"
exec npm run --silent dev