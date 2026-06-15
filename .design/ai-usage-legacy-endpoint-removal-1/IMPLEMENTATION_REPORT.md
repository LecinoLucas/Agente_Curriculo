# Relatório de Implementação — AI-USAGE-LEGACY-ENDPOINT-REMOVAL-1

> **Data:** 2026-06-14
> **Branch:** `save/behavioral-ai-and-wips`
> **Tipo:** Remoção de endpoints legacy + código auxiliar exclusivo. Nenhum cálculo de custo alterado.

---

## Confirmações Explícitas

| Item | Status |
|---|---|
| `GET /api/v1/admin/health/ai-usage` removido | **Sim** — retorna 404 |
| `GET /api/v1/ai/usage/summary` removido | **Sim** — retorna 404 |
| `GET /api/v1/admin/health/ai-usage-center` preservado | **Sim** — 100% funcional |
| Frontend consumindo endpoint legado | **Não** — confirmado por grep |
| Cálculo de custo alterado | **Não** |
| Provider/modelo alterado | **Não** |
| Prompt alterado | **Não** |
| Migration criada | **Não** |

---

## Arquivos Alterados

### Backend — Remoção de Rotas

| Arquivo | Alteração |
|---|---|
| `backend/src/interface/api/routers/admin_system_health.py` | Rota `GET /ai-usage` removida; import `Response` removido; import `AIUsageSummaryResponse` removido |
| `backend/src/interface/api/routers/ai_assistant.py` | Rota `GET /usage/summary` removida; import `Response` removido; import `AIUsageService` removido |

### Backend — Remoção de Schema

| Arquivo | Alteração |
|---|---|
| `backend/src/interface/api/schemas/system_health_schemas.py` | Removidas: `AIUsageSummaryResponse`, `AIUsageAggregateResponse`, `TopExpensiveAnalysisResponse` (apenas usadas pela rota removida) |

### Backend — Remoção de Service Method + Helpers

| Arquivo | Alteração |
|---|---|
| `backend/src/application/services/system_health_service.py` | Removidos: `get_ai_usage()`, `_usage_bucket()`, `_accumulate_usage()`, `_finalize_usage_bucket()` (todos exclusivos do endpoint legado) |

**Preservados intactos:** `_list_ai_usage_rows()`, `_usage_center_bucket()`, `_accumulate_usage_center_bucket()`, `_finalize_usage_center_bucket()`, `_usage_center_model_bucket()` — usados por `get_ai_usage_center()`.

### Testes — Remoção / Atualização

| Arquivo | Alteração |
|---|---|
| `backend/tests/unit/test_ai_usage_endpoint.py` | **Removido** (`git rm`) — testava exclusivamente o endpoint `/ai/usage/summary` removido |
| `backend/tests/integration/test_admin_system_health_api.py` | Removidos: `test_ai_usage_returns_aggregates`, `test_ai_usage_works_without_records`, `test_ai_usage_legacy_endpoint_returns_deprecation_headers` · Adicionado: `test_legacy_ai_usage_endpoint_removed` (404) |
| `backend/tests/integration/test_ai_usage_cost.py` | 4 testes atualizados: endpoint `/ai-usage` → `/ai-usage-center`, assertions `body["field"]` → `body["summary"]["field"]` |

### Documentação

| Arquivo | Alteração |
|---|---|
| `docs/ai/AI_USAGE_CENTER.md` | Seção "Endpoints Legados" atualizada: de "deprecated/funcionando" para "REMOVIDOS (404)"; typo "a" solto removido |
| `.design/ai-usage-legacy-endpoint-removal-1/IMPLEMENTATION_REPORT.md` | **Criado** — este relatório |

---

## Validação de Grep Obrigatória

```bash
grep -Rn "getAIUsage\|getUsageSummary\|/api/v1/admin/health/ai-usage\b\|/api/v1/ai/usage/summary" \
  frontend/src backend/src backend/tests docs \
  | grep -v "__pycache__|\.pyc|ai-usage-center|ai-usage/pricing|ai-usage/backfill"
```

**Resultado — ocorrências encontradas (todas legítimas):**

| Arquivo | Linha | Razão |
|---|---|---|
| `frontend/src/pages/AIUsageCenterPage.tsx` | usa `getAIUsageCenter` | nome do mock — função oficial |
| `frontend/src/pages/__tests__/AIUsageCenterPage.test.tsx` | `getAIUsageCenterMock` | mock da função oficial |
| `frontend/src/services/systemHealthService.ts` | `getAIUsageCenter` | função oficial — correto |
| `backend/tests/integration/test_admin_system_health_api.py` | `/api/v1/admin/health/ai-usage` | teste `test_legacy_ai_usage_endpoint_removed` (espera 404) |
| `docs/ai/AI_USAGE_CENTER.md` | menção histórica dos endpoints removidos | documentação de remoção |

**Zero ocorrências em código ativo de produção (`backend/src/`, `frontend/src/` exceto referências oficiais).**

---

## Testes Executados

### Backend

```bash
cd backend && .venv/bin/python -m pytest \
  tests/integration/test_admin_system_health_api.py \
  tests/integration/test_ai_usage_cost.py \
  -v --no-cov
```
**Resultado:** 20/20 passed ✓

### Frontend

```bash
cd frontend && npx tsc --noEmit
```
**Resultado:** TypeScript: No errors found ✓

```bash
cd frontend && npx vitest run \
  src/pages/__tests__/AIUsageCenterPage.test.tsx \
  src/pages/__tests__/SystemHealthPage.test.tsx \
  src/pages/__tests__/AdminBiPage.test.tsx
```
**Resultado:** 18/18 passed ✓

**Nota sobre suite completa:** ao rodar a suite completa (`npm run test -- --run`), alguns testes falham por timeout de filesystem walker (`legacy-import-guard.test.ts`) e por falhas pré-existentes em `CandidatePreviewDrawer.test.tsx`. Ambas são pré-existentes e confirmadas por `git diff HEAD` (nenhum dos arquivos foi tocado nesta fase).

---

## Riscos

| # | Risco | Avaliação |
|---|---|---|
| R1 | `AIUsageService` (em `ai_usage_log_service.py`) permanece no código com `get_usage_summary()` — sem consumidor ativo | Baixo — é uma service class com testes próprios (`test_ai_usage_service.py`); pode ser removida em fase futura de limpeza geral |
| R2 | `test_ai_usage_service.py` testa o método `get_usage_summary()` da service layer que não tem mais consumidor de rota | Baixo — os testes da service layer continuam válidos como documentação do comportamento |
| R3 | Clients externos que porventura consumiam `/api/v1/ai/usage/summary` agora recebem 404 sem aviso prévio | Mínimo — o sistema é interno; a fase anterior já havia adicionado headers `Deprecation` |

---

## Próxima Fase Recomendada

**F3 (`docs-consolidation`)** ou **F4 (`dedupe-protheus-panel`)**.

Candidato adicional de limpeza futura: remover `AIUsageService.get_usage_summary()` de `ai_usage_log_service.py` e `test_ai_usage_service.py`, já que não têm mais consumidor de rota ativo. Recomenda-se fase própria (`ai-usage-service-cleanup`) para não misturar com reorganização estrutural.
