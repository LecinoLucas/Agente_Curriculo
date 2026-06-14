# Relatório de Implementação — AI-USAGE-ENDPOINT-DEPRECATION-1

> **Data:** 2026-06-14
> **Branch:** `save/behavioral-ai-and-wips`
> **Tipo:** Deprecação de endpoints + documentação. Nenhum endpoint removido. Nenhum cálculo alterado.

---

## Confirmações Explícitas

| Item | Status |
|---|---|
| Endpoint legado removido | **Não** — mantido funcionando |
| Endpoint legado marcado como deprecated | **Sim** — ambos os endpoints |
| Frontend consumindo endpoint legado | **Não** — auditoria confirmou ausência |
| Central oficial preservada | **Sim** — `GET /api/v1/admin/health/ai-usage-center` intocado |

---

## Arquivos Alterados

### Backend

| Arquivo | Alteração |
|---|---|
| `backend/src/interface/api/routers/admin_system_health.py` | `Response` importado; `GET /ai-usage` marcado `deprecated=True`; docstring; headers de deprecação |
| `backend/src/interface/api/routers/ai_assistant.py` | `Response` importado; `GET /usage/summary` marcado `deprecated=True`; docstring; headers de deprecação |

### Testes

| Arquivo | Alteração |
|---|---|
| `backend/tests/integration/test_admin_system_health_api.py` | Novo teste: `test_ai_usage_legacy_endpoint_returns_deprecation_headers` |
| `backend/tests/unit/test_ai_usage_endpoint.py` | Novo teste: `test_ai_usage_summary_returns_deprecation_headers` |

### Documentação

| Arquivo | Alteração |
|---|---|
| `docs/ai/AI_USAGE_CENTER.md` | **Criado** — documentação oficial da central |
| `.design/ai-usage-endpoint-deprecation-1/IMPLEMENTATION_REPORT.md` | **Criado** — este relatório |

---

## Detalhes da Deprecação

### Estratégia Usada

O projeto não tinha padrão prévio de deprecação. Foram adotadas as três camadas padrão da indústria:

1. **OpenAPI / Swagger** — `deprecated=True` no decorator `@router.get(...)` marca o endpoint como deprecated no schema e no Swagger UI (aparece riscado).
2. **Headers de resposta** — retornados em toda chamada ao endpoint legado:
   ```
   Deprecation: true
   X-Deprecated-Endpoint: true
   X-Replacement-Endpoint: /api/v1/admin/health/ai-usage-center
   ```
3. **Docstring** — prefixada com `[DEPRECATED]` e link para o replacement, visível em IDEs e no Swagger.

### Endpoints Deprecados

| Endpoint | Router | Tipo |
|---|---|---|
| `GET /api/v1/admin/health/ai-usage` | `admin_system_health.py` | Integração |
| `GET /api/v1/ai/usage/summary` | `ai_assistant.py` | Unidade/Integração |

### Endpoint Oficial (não alterado)

```
GET /api/v1/admin/health/ai-usage-center
```

---

## Auditoria Frontend

### Grep de consumo legado no frontend

```bash
grep -rn "getAIUsage\|getUsageSummary\|/api/v1/admin/health/ai-usage\b\|/api/v1/ai/usage/summary" \
  frontend/src/ --include="*.ts" --include="*.tsx" \
  | grep -v "ai-usage-center\|ai-usage/pricing\|ai-usage/backfill\|__tests__\|\.test\."
```

**Resultado:** 0 ocorrências. O frontend não consome nenhum endpoint legado.

### Funções presentes em `systemHealthService.ts`

| Função | Endpoint | Status |
|---|---|---|
| `getAIUsageCenter` | `/api/v1/admin/health/ai-usage-center` | Oficial — mantido |
| `getAIPricingCatalog` | `/api/v1/admin/health/ai-usage/pricing` | Oficial — mantido |
| `backfillAICosts` | `/api/v1/admin/health/ai-usage/backfill-costs` | Oficial — mantido |
| `getAIUsage` | — | **Não existe** (removido em fase anterior) |
| `getUsageSummary` | — | **Não existe** (removido em fase anterior) |

---

## Testes Executados

### Backend

```bash
cd backend && .venv/bin/python -m pytest tests/integration/test_admin_system_health_api.py -v --no-cov
```
**Resultado:** 12/12 passed ✓

```bash
cd backend && .venv/bin/python -m pytest tests/unit/test_ai_usage_endpoint.py -v --no-cov
```
**Resultado:** 4/4 passed ✓

### Frontend

```bash
cd frontend && npx tsc --noEmit
```
**Resultado:** TypeScript: No errors found ✓

```bash
cd frontend && npm run test -- --run
```
**Resultado:** 1403 passed (6 falhas pré-existentes em `CandidatePreviewDrawer.test.tsx`, sem relação com esta fase — confirmado via `git diff HEAD`) ✓

Testes específicos do escopo, todos passando:
- `AIUsageCenterPage` ✓
- `SystemHealthPage` (8 testes) ✓
- `AdminBiPage` (5 testes) ✓
- `AiSettingsPage` (10 testes) ✓
- `AiGovernancePanel` (via AiSettingsPage) ✓

---

## Riscos

| # | Risco | Avaliação |
|---|---|---|
| R1 | Consumidores externos (integrações de terceiros) dos endpoints legados não serão notificados automaticamente | Baixo — o sistema é interno; os headers `Deprecation` e `X-Replacement-Endpoint` servem de sinalização |
| R2 | Testes em `test_ai_usage_cost.py` chamam `/admin/health/ai-usage` e podem falhar se alguém adicionar assert de ausência de headers | Mínimo — os headers adicionais não quebram asserts existentes |
| R3 | A ordem do parâmetro `response: Response` entre `_current_user` e os query params é não-convencional | Aceitável — FastAPI injeta `Response` por tipo, não por posição; não afeta funcionamento |

---

## Próxima Fase Recomendada

**F4 (`dedupe-protheus-panel`)** — unificar `AdmissionProtheusIntegrationPanel.tsx`,
que existe em dois lugares (`admission-workspace/` e `candidates/drawer/components/`),
eliminando a duplicação de regra de negócio. Requer cobertura de teste antes da remoção.

Alternativamente, **F3 (`docs-consolidation`)** se o objetivo for continuar com
higiene estrutural antes de tocar componentes de produção.
