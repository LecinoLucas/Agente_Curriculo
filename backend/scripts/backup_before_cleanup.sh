#!/bin/bash

##
# Script de Backup Seguro Antes da Limpeza
#
# Cria um backup completo do PostgreSQL antes de executar reset_db.py
#
# Uso:
#   bash scripts/backup_before_cleanup.sh
#   bash scripts/backup_before_cleanup.sh --dir /caminho/customizado
##

set -e  # Exit on error

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Diretório de backup
BACKUP_DIR="${1:-.backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/resume_ai_backup_$TIMESTAMP.sql"

# Database info (do .env ou padrão)
DB_NAME="${DATABASE_NAME:-resume_ai}"
DB_USER="${DATABASE_USER:-LecinoLucas}"
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_PASSWORD="${DATABASE_PASSWORD:-020219}"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   📦 Backup Antes da Limpeza Nuclear   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Criar diretório se não existir
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}⏳ Iniciando backup...${NC}"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Destino: $BACKUP_FILE"
echo ""

# Contar registros antes
echo -e "${YELLOW}📊 Coletando informações antes do backup...${NC}"
export PGPASSWORD="$DB_PASSWORD"
BEFORE_CANDIDATES=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM candidates;" 2>/dev/null || echo "?")
BEFORE_JOBS=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM jobs;" 2>/dev/null || echo "?")
BEFORE_USERS=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "?")
BEFORE_ANALYSES=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM analyses;" 2>/dev/null || echo "?")

echo "   Candidatos: $BEFORE_CANDIDATES"
echo "   Vagas: $BEFORE_JOBS"
echo "   Usuários: $BEFORE_USERS"
echo "   Análises: $BEFORE_ANALYSES"
echo ""

# Fazer o backup (com senha)
export PGPASSWORD="$DB_PASSWORD"
if pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup concluído com sucesso!${NC}"
    echo "   Arquivo: $BACKUP_FILE"
    echo "   Tamanho: $BACKUP_SIZE"
    echo ""

    # Mostrar como restaurar
    echo -e "${BLUE}💡 Para restaurar este backup:${NC}"
    echo ""
    echo -e "   ${YELLOW}PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME < $BACKUP_FILE${NC}"
    echo ""

    # Listar backups existentes
    echo -e "${BLUE}📂 Backups disponíveis:${NC}"
    ls -lh "$BACKUP_DIR"/resume_ai_backup_*.sql 2>/dev/null | tail -5 | awk '{print "   " $9 " (" $5 ")"}'
    echo ""

    # Pergunta se quer continuar com a limpeza
    echo -e "${YELLOW}❓ Deseja prosseguir com a limpeza nuclear agora?${NC}"
    read -p "   Digite 'sim' para continuar: " response

    if [ "$response" = "sim" ]; then
        echo -e "${YELLOW}Executando reset...${NC}"
        cd "$(dirname "$0")/.."
        python scripts/reset_db.py --confirm
    else
        echo -e "${YELLOW}Backup criado. Execute a limpeza manualmente quando estiver pronto:${NC}"
        echo ""
        echo -e "   ${YELLOW}python scripts/reset_db.py${NC}"
        echo ""
    fi
else
    echo -e "${RED}❌ Erro ao fazer backup!${NC}"
    exit 1
fi
