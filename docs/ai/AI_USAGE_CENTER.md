# AI Usage Center — Documentação Oficial

## Visão Geral

A **Central de Uso de IA** é o ponto oficial para monitoramento operacional de consumo,
custo e saúde dos modelos de IA no sistema. Ela consolida métricas de tokens, custo
estimado, distribuição por operação/modelo, eventos recentes e gaps de dados.

**Rota frontend:** `/admin/ia/uso`
**Componente:** `frontend/src/pages/AIUsageCenterPage.tsx`

---

## Endpoints Oficiais

### Central de Uso (endpoint canônico)

```
GET /api/v1/admin/health/ai-usage-center
```

Retorna o payload operacional completo:
- `summary` — totais de chamadas, tokens, custo estimado, status breakdown
- `by_operation` — métricas agrupadas por operação (job_ai_draft, resume_analysis, etc.)
- `by_model` — métricas agrupadas por provider/modelo
- `recent_events` — eventos recentes com mensagens de erro sanitizadas
- `pricing` — catálogo de preços configurado
- `gaps` — análise de dados ausentes (operações sem label, tokens zerados, etc.)

**Query params opcionais:** `date_from`, `date_to`, `provider`, `model`
**Autenticação:** ADMIN only

---

### Catálogo de Preços

```
GET /api/v1/admin/health/ai-usage/pricing
```

Retorna os itens de preço configurados por `(provider, model)` e lista os pares
observados nos logs que ainda não têm preço cadastrado.

---

### Backfill de Custos

```
POST /api/v1/admin/health/ai-usage/backfill-costs
```

Recomputa `estimated_cost_usd` para registros em `ai_usage_logs` onde o campo é NULL
e existe preço configurado para o `(provider, model)`. Idempotente; não chama o provider
de IA nem altera tokens/status.

---

## Endpoints Legados — DEPRECATED

Os endpoints abaixo continuam funcionando, mas estão **marcados como deprecated** e
**não devem ser usados em novas telas ou integrações**.

Ambos retornam os headers:
```
Deprecation: true
X-Deprecated-Endpoint: true
X-Replacement-Endpoint: /api/v1/admin/health/ai-usage-center
```

E aparecem como `deprecated: true` no schema OpenAPI (Swagger UI).

### Legado 1 — Admin Health AI Usage

```
GET /api/v1/admin/health/ai-usage
```

Retornava aggregates simples (total_calls, successful_calls, failed_calls, tokens,
by_provider, by_model, daily_usage). Substituído pela central oficial.

**Implementação:** `backend/src/interface/api/routers/admin_system_health.py`

### Legado 2 — AI Status Summary

```
GET /api/v1/ai/usage/summary
```

Retornava um resumo simplificado por feature (rag_synthesis, job_ai_draft, etc.) com
período configurável (`today`, `7d`, `30d`). Substituído pela central oficial.

**Implementação:** `backend/src/interface/api/routers/ai_assistant.py`

---

## Regra para Novas Telas

> Novas telas ou painéis que precisem exibir consumo/custo de IA **devem usar apenas**
> `GET /api/v1/admin/health/ai-usage-center` via `systemHealthService.getAIUsageCenter()`.
>
> Não recriar visão operacional de IA em: SystemHealthPage, AiGovernancePanel,
> AdminBiPage ou AiSettingsPage. Essas telas já têm links ou cards resumidos que
> apontam para a central.

---

## Consumo no Frontend

```typescript
import { systemHealthService } from "@/services/systemHealthService";

// Correto — endpoint canônico
const data = await systemHealthService.getAIUsageCenter({ date_from: "2026-01-01" });

// Catálogo de preços
const pricing = await systemHealthService.getAIPricingCatalog();

// Backfill de custos ausentes
await systemHealthService.backfillAICosts();
```

---

## Service Backend

`backend/src/application/services/system_health_service.py` — método `get_ai_usage_center(query: AIUsageQuery)`.

Dados source: tabela `ai_usage_logs` via `backend/src/infrastructure/repositories/`.

---

## Testes

| Arquivo | O que cobre |
|---|---|
| `backend/tests/integration/test_admin_system_health_api.py` | Payload da central, isolamento de dados, headers de deprecated, auth |
| `backend/tests/integration/test_ai_usage_cost.py` | Cálculo de custo estimado, backfill |
| `backend/tests/unit/test_ai_usage_endpoint.py` | Endpoint legado `/ai/usage/summary`, headers de deprecated, auth |
| `frontend/src/pages/__tests__/AIUsageCenterPage.test.tsx` | Renderização da central no frontend |
