#!/bin/bash
# 🧪 Script de Validação - v_job_candidate_ranking Migration
# Uso: bash validate_migration.sh

set -e

echo "🔍 Validando Migration v_job_candidate_ranking..."
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar se Alembic está instalado
echo -n "1. Verificando Alembic... "
if command -v alembic &> /dev/null; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Alembic não encontrado. Instale com: pip install alembic${NC}"
    exit 1
fi

# 2. Verificar se arquivo da migration existe
echo -n "2. Verificando arquivo da migration... "
MIGRATION_FILE="alembic/versions/a7f2b8c3d4e5_create_v_job_candidate_ranking.py"
if [ -f "$MIGRATION_FILE" ]; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Arquivo não encontrado: $MIGRATION_FILE${NC}"
    exit 1
fi

# 3. Verificar conteúdo da migration
echo -n "3. Validando conteúdo da migration... "
if grep -q "v_job_candidate_ranking" "$MIGRATION_FILE"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ VIEW name não encontrada na migration${NC}"
    exit 1
fi

# 4. Verificar se DOWN migration existe
echo -n "4. Validando downgrade... "
if grep -q "DROP VIEW" "$MIGRATION_FILE"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Downgrade não implementado${NC}"
    exit 1
fi

# 5. Verificar status do Alembic
echo -n "5. Verificando histórico de migrations... "
CURRENT=$(alembic current 2>/dev/null | tail -1 || echo "")
if [ ! -z "$CURRENT" ]; then
    echo -e "${GREEN}✅${NC}"
    echo "   Revision atual: $CURRENT"
else
    echo -e "${YELLOW}⚠️${NC} Banco não inicializado"
fi

# 6. Aplicar migration (dry-run)
echo ""
echo "6. Testando upgrade (sem confirmar)..."
echo "   Execute: alembic upgrade head"
echo ""

# 7. Validações SQL
echo "7. Validações SQL (execute no psql):"
echo ""
echo "   -- Verificar se VIEW foi criada"
echo "   SELECT EXISTS ("
echo "       SELECT 1 FROM information_schema.views"
echo "       WHERE table_name = 'v_job_candidate_ranking'"
echo "   ) as view_exists;"
echo ""
echo "   -- Testar query básica"
echo "   SELECT * FROM v_job_candidate_ranking LIMIT 1;"
echo ""
echo "   -- Contar matches por vaga"
echo "   SELECT job_id, COUNT(*) FROM v_job_candidate_ranking GROUP BY job_id LIMIT 5;"
echo ""

# 8. Resumo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ VALIDAÇÕES BÁSICAS PASSARAM${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Próximas ações:"
echo "   1. cd backend && alembic upgrade head"
echo "   2. Validar no banco: SELECT * FROM v_job_candidate_ranking LIMIT 5;"
echo "   3. Executar testes: pytest tests/integration/test_job_endpoints.py -v"
echo ""
echo "📚 Documentação:"
echo "   - docs/migration_v_job_candidate_ranking.md"
echo "   - docs/migration_tests.md"
echo "   - docs/MIGRATION_SUMMARY.md"
echo ""
