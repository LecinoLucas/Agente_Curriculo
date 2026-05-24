#!/usr/bin/env bash
# reset_dev_db.sh — Reinicia banco de dados de desenvolvimento do zero.
#
# USO:
#   CONFIRM_RESET=1 ./scripts/reset_dev_db.sh
#   CONFIRM_RESET=1 DB_NAME=agente_curriculo_bootstrap_test ./scripts/reset_dev_db.sh
#
# VARIÁVEIS:
#   CONFIRM_RESET=1   (obrigatório) — proteção contra execução acidental
#   DB_NAME           banco alvo (default: agente_curriculo_dev)
#   DB_USER           usuário postgres (default: detectado do DATABASE_URL ou $USER)
#   SKIP_SEED         se "1", pula bootstrap_dev.py após o upgrade
#
# SEGURANÇA:
#   - Bloqueia nomes de banco que sugerem produção
#   - Requer confirmação explícita via variável de ambiente
#   - Nunca usa --force sem aviso

set -euo pipefail

# ── Configuração ────────────────────────────────────────────────────────────
DB_NAME="${DB_NAME:-agente_curriculo_dev}"
SKIP_SEED="${SKIP_SEED:-0}"

# Detecta diretório do projeto (pai de scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Proteções ───────────────────────────────────────────────────────────────

# 1. Confirmação explícita
if [[ "${CONFIRM_RESET:-}" != "1" ]]; then
    echo ""
    echo "ERRO: Este script destrói e recria o banco '${DB_NAME}'."
    echo "Para confirmar, execute com:"
    echo "  CONFIRM_RESET=1 DB_NAME=${DB_NAME} $0"
    echo ""
    exit 1
fi

# 2. Bloqueio por nome de banco que sugere produção
PRODUCTION_PATTERNS=("prod" "production" "live" "staging" "amazonaws" "render" "railway" "heroku")
DB_LOWER="${DB_NAME,,}"
for pattern in "${PRODUCTION_PATTERNS[@]}"; do
    if [[ "$DB_LOWER" == *"$pattern"* ]]; then
        echo "ERRO: Nome do banco '${DB_NAME}' parece ser de produção (contém '${pattern}')."
        echo "Este script só deve ser usado em desenvolvimento local."
        exit 1
    fi
done

# 3. Garante que está em localhost
DB_HOST="${PGHOST:-localhost}"
if [[ "$DB_HOST" != "localhost" && "$DB_HOST" != "127.0.0.1" ]]; then
    echo "ERRO: PGHOST='${DB_HOST}' não é localhost."
    echo "Este script só deve ser executado contra banco local."
    exit 1
fi

# ── Execução ────────────────────────────────────────────────────────────────

echo ""
echo "================================================"
echo "  Reset Dev DB: ${DB_NAME}"
echo "================================================"
echo ""

cd "$PROJECT_DIR"

echo "[1/5] Encerrando conexões existentes..."
psql -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

echo "[2/5] Dropando banco '${DB_NAME}'..."
dropdb "${DB_NAME}" --if-exists
echo "      OK."

echo "[3/5] Criando banco '${DB_NAME}'..."
createdb "${DB_NAME}"
echo "      OK."

echo "[4/5] Aplicando migrations (alembic upgrade head)..."
DATABASE_URL="postgresql+asyncpg://${PGUSER:-$USER}:${PGPASSWORD:-}@${DB_HOST}:${PGPORT:-5432}/${DB_NAME}" \
    .venv/bin/python -m alembic upgrade head
echo "      OK."

if [[ "${SKIP_SEED}" != "1" ]]; then
    echo "[5/5] Rodando bootstrap dev (seeds)..."
    DATABASE_URL="postgresql+asyncpg://${PGUSER:-$USER}:${PGPASSWORD:-}@${DB_HOST}:${PGPORT:-5432}/${DB_NAME}" \
        .venv/bin/python scripts/bootstrap_dev.py
else
    echo "[5/5] Seeds pulados (SKIP_SEED=1)."
fi

echo ""
echo "[VALIDAÇÃO] Verificando schema..."
DATABASE_URL="postgresql+asyncpg://${PGUSER:-$USER}:${PGPASSWORD:-}@${DB_HOST}:${PGPORT:-5432}/${DB_NAME}" \
    .venv/bin/python scripts/validate_baseline_schema.py

echo ""
echo "================================================"
echo "  Reset concluído: ${DB_NAME}"
echo "================================================"
echo ""
