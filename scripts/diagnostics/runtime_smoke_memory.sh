#!/usr/bin/env bash
# Smoke test de baseline de memória — somente leitura.
#
# Uso:
#   ./scripts/diagnostics/runtime_smoke_memory.sh
#
# Variáveis de ambiente:
#   REDIS_URL     — URL do Redis de app (padrão: redis://localhost:6379/0)
#   API_BASE_URL  — Base da API local (padrão: http://localhost:8000)
#   API_TOKEN     — JWT de admin para endpoints autenticados (opcional)
#
# Este script não altera dados, não apaga cache e não cria resources.
# Usa apenas GET e comandos de leitura.

set -euo pipefail

REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
API_BASE="${API_BASE_URL:-http://localhost:8000}"
REDIS_HOST=$(echo "$REDIS_URL" | sed 's|redis://||' | cut -d: -f1)
REDIS_PORT=$(echo "$REDIS_URL" | sed 's|redis://||' | cut -d: -f2 | cut -d/ -f1)
REDIS_DB=$(echo "$REDIS_URL" | cut -d/ -f4)

BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"

log_section() { echo -e "\n${BOLD}▸ $1${RESET}"; }
log_ok()  { echo -e "  ${GREEN}✓${RESET} $1"; }
log_warn(){ echo -e "  ${YELLOW}⚠${RESET}  $1"; }
log_err() { echo -e "  ${RED}✗${RESET} $1"; }

echo "======================================================"
echo "RUNTIME SMOKE MEMORY — somente leitura"
echo "======================================================"
echo "API:        $API_BASE"
echo "Redis:      $REDIS_HOST:$REDIS_PORT db=$REDIS_DB"
echo "Timestamp:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ─── 1. Redis info ─────────────────────────────────────────────────────────

log_section "Redis — info de memória"

if command -v redis-cli &>/dev/null; then
    REDIS_INFO=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "${REDIS_DB:-0}" INFO memory 2>/dev/null || echo "")
    if [[ -n "$REDIS_INFO" ]]; then
        USED=$(echo "$REDIS_INFO" | grep "^used_memory:" | cut -d: -f2 | tr -d ' \r')
        USED_MB=$(awk "BEGIN {printf \"%.1f\", $USED/1048576}")
        PEAK=$(echo "$REDIS_INFO" | grep "^used_memory_peak:" | cut -d: -f2 | tr -d ' \r')
        PEAK_MB=$(awk "BEGIN {printf \"%.1f\", $PEAK/1048576}")
        DBSIZE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "${REDIS_DB:-0}" DBSIZE 2>/dev/null || echo "?")
        log_ok "Memória usada: ${USED_MB} MB | Pico: ${PEAK_MB} MB | Chaves: $DBSIZE"

        # Chaves sem TTL na DB de app
        NO_TTL=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "${REDIS_DB:-0}" \
            EVAL "local ks=redis.call('KEYS','*'); local c=0; for _,k in ipairs(ks) do if redis.call('TTL',k)==-1 then c=c+1 end end return c" 0 2>/dev/null || echo "?")
        if [[ "$NO_TTL" != "?" && "$NO_TTL" -gt 0 ]]; then
            log_warn "Chaves sem TTL: $NO_TTL — verificar manualmente"
        else
            log_ok "Chaves sem TTL: $NO_TTL"
        fi
    else
        log_warn "redis-cli não conectou a $REDIS_HOST:$REDIS_PORT"
    fi
else
    log_warn "redis-cli não encontrado — pulando checagem Redis"
fi

# ─── 2. Healthcheck API ────────────────────────────────────────────────────

log_section "API — healthcheck"

if command -v curl &>/dev/null; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/health" --max-time 5 2>/dev/null || echo "000")
    if [[ "$HTTP_STATUS" == "200" ]]; then
        log_ok "GET /health → $HTTP_STATUS"
    else
        log_warn "GET /health → $HTTP_STATUS (API pode estar offline)"
    fi
else
    log_warn "curl não encontrado — pulando healthcheck"
fi

# ─── 3. System health endpoint ─────────────────────────────────────────────

log_section "API — system health (memória pool)"

if command -v curl &>/dev/null && [[ -n "${API_TOKEN:-}" ]]; then
    HEALTH=$(curl -s -H "Authorization: Bearer $API_TOKEN" \
        "$API_BASE/admin/system-health/overview" --max-time 5 2>/dev/null || echo "")
    if [[ -n "$HEALTH" ]]; then
        log_ok "GET /admin/system-health/overview → OK"
        echo "    $(echo "$HEALTH" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get("database",{}), indent=2))' 2>/dev/null | head -10)"
    else
        log_warn "Falha ou sem resposta (token inválido?)"
    fi
else
    log_warn "API_TOKEN não configurado — pulando inspeção de pool"
fi

# ─── 4. Contagem de análises travadas ──────────────────────────────────────

log_section "API — análises em estado de risco"

if command -v curl &>/dev/null && [[ -n "${API_TOKEN:-}" ]]; then
    STATUS_RESP=$(curl -s -H "Authorization: Bearer $API_TOKEN" \
        "$API_BASE/analyses?page=1&page_size=1&status=processing" --max-time 5 2>/dev/null || echo "")
    if [[ -n "$STATUS_RESP" ]]; then
        PROCESSING=$(echo "$STATUS_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("total_items", "?"))' 2>/dev/null || echo "?")
        if [[ "$PROCESSING" != "?" && "$PROCESSING" -gt 50 ]]; then
            log_warn "Análises em 'processing': $PROCESSING — potencial backlog grande"
        else
            log_ok "Análises em 'processing': $PROCESSING"
        fi
    else
        log_warn "Falha ao consultar /analyses"
    fi
else
    log_warn "API_TOKEN não configurado — pulando checagem de análises"
fi

# ─── 5. Docker stats (se disponível) ──────────────────────────────────────

log_section "Docker — consumo de memória (se disponível)"

if command -v docker &>/dev/null; then
    STATS=$(docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | grep -E "backend|worker|celery|redis" || echo "")
    if [[ -n "$STATS" ]]; then
        echo "$STATS" | while IFS= read -r line; do
            echo "    $line"
        done
    else
        log_warn "Nenhum container encontrado ou Docker não disponível"
    fi
else
    log_warn "Docker não encontrado"
fi

echo ""
echo "======================================================"
echo "Smoke test concluído. Nenhum dado modificado."
echo "======================================================"
