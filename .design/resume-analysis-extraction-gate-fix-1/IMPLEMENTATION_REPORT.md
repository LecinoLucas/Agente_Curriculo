# Relatório de Implementação — resume-analysis-extraction-gate-fix-1

> **Data:** 2026-06-14
> **Branch:** `save/behavioral-ai-and-wips`
> **Tipo:** Correção de bug — gate de extração antes da análise IA

---

## Problema

Quando o worker Celery `process_analysis` era acionado antes da extração de texto do PDF terminar, o fluxo levava a:

1. `_process_analysis_with_session` detectava `resume_text` vazio/placeholder
2. Lançava `RuntimeError("Resume text vazio. Extração de PDF ainda não concluída.")`
3. O handler de exceção em `process_analysis` chamava `_classify_analysis_exception(exc)`
4. Nenhum classifier específico captura `RuntimeError` → catch-all retorna `provider_error_type="unexpected_error"`, `is_temporary=False`
5. `_mark_analysis_failed_async` era chamado: análise ficava `failed` com `provider_error_type="unexpected_error"`
6. Frontend: `SAFE_FAILURE_BY_TYPE["unexpected_error"]` exibia **"Falha inesperada na IA comportamental."** — incorreto, a IA comportamental nunca foi chamada

---

## Confirmações Explícitas

| Item | Status |
|---|---|
| IA nunca é chamada quando `resume_text` vazio/placeholder | **Sim** — return antes de qualquer chamada ao provider |
| Status `waiting_extraction` persiste no DB corretamente | **Sim** — via `session.commit()` dentro do `async with session:` |
| Claim de worker é liberado ao retornar `waiting_extraction` | **Sim** — `worker_claim_id`, `claimed_at`, `stale_at` zerados |
| Evento de auditoria `analysis_waiting_for_extraction` criado | **Sim** |
| Retry manual de análise `waiting_extraction` permitido | **Sim** — router atualizado |
| Mensagem `unexpected_error` no frontend corrigida | **Sim** — removida referência a "IA comportamental" |
| Provider/modelo/prompt/custo alterado | **Não** |
| Migration criada | **Não** — `waiting_extraction` já existia no enum |
| Endpoints de IA alterados | **Não** |

---

## Arquivos Alterados

### Backend — Worker

| Arquivo | Alteração |
|---|---|
| `backend/src/interface/workers/analysis_tasks.py` | Linhas 505-513: substituição dos dois `raise RuntimeError(...)` por bloco controlado que persiste `waiting_extraction`, libera o claim e retorna `{"status": "waiting_extraction"}` sem chamar AI |

**Antes:**
```python
if not resume_text or not resume_text.strip():
    raise RuntimeError("Resume text vazio. Extração de PDF ainda não concluída.")

if resume_text.strip() == _PLACEHOLDER_RESUME:
    raise RuntimeError("Resume text contém placeholder. O PDF ainda não foi extraído.")
```

**Depois:**
```python
if not resume_text or not resume_text.strip() or resume_text.strip() == _PLACEHOLDER_RESUME:
    now = datetime.now(UTC)
    analysis.status = "waiting_extraction"
    analysis.worker_claim_id = None
    analysis.claimed_at = None
    analysis.stale_at = None
    analysis.updated_at = now
    await record_analysis_audit_event(
        session,
        action="analysis_waiting_for_extraction",
        resource_id=analysis_uuid,
        user_id=analysis.requested_by,
        metadata={"task_id": task_id, "worker_id": worker_id},
    )
    await session.commit()
    logger.info("analysis.waiting_for_extraction", ...)
    return {"analysis_id": str(analysis_uuid), "status": "waiting_extraction"}
```

### Backend — Router

| Arquivo | Alteração |
|---|---|
| `backend/src/interface/api/routers/analyses.py` | Endpoint `POST /{analysis_id}/retry`: adicionado `"waiting_extraction"` ao set de statuses permitidos (linha 656) |
| `backend/src/interface/api/routers/analyses.py` | Endpoint `POST /bulk-retry`: adicionado `"waiting_extraction"` ao filtro de status (linha 593) |

### Frontend

| Arquivo | Alteração |
|---|---|
| `frontend/src/features/analyses/utils/analysisFormatters.ts` | `unexpected_error`: `"Falha inesperada na IA comportamental."` → `"Falha inesperada."` |

---

## Testes

### Backend — Novos testes

**`backend/tests/integration/test_analysis_retry_resilience.py`**

Adicionado `test_worker_sets_waiting_extraction_when_text_not_ready` com três casos parametrizados:

| ID | `extracted_text` | O que verifica |
|---|---|---|
| `none` | `None` | Status → `waiting_extraction`, claim liberado, audit criado |
| `whitespace_only` | `"   "` | Idem |
| `placeholder_string` | `_PLACEHOLDER_RESUME` | Idem |

Todos os casos verificam:
- Retorno `{"analysis_id": ..., "status": "waiting_extraction"}`
- `analysis.status == "waiting_extraction"` no DB
- `analysis.worker_claim_id is None`
- `analysis.claimed_at is None`
- `analysis.stale_at is None`
- Evento de auditoria `analysis_waiting_for_extraction` criado

### Resultados

```
tests/integration/test_analysis_retry_resilience.py — 21/21 PASSED ✓
tests/integration/test_worker_tasks.py — 4/4 PASSED ✓
```

### Frontend

```
npx tsc --noEmit → TypeScript: No errors found ✓
```

---

## Fluxo Após a Correção

```
upload PDF → extração pendente
    │
    ▼
process_analysis Celery task acionado (race condition original)
    │
    ▼
_process_analysis_with_session detecta resume_text vazio
    │
    ▼ (ANTES: RuntimeError → unexpected_error → failed)
    ▼ (AGORA: status="waiting_extraction", claim liberado, return)
    │
    ▼
resume_extraction_tasks detecta análises "waiting_extraction" após extração concluída
    │
    ▼
Promove análise para "pending" → enfileira novamente → AI chamada com texto real
```

O status `waiting_extraction` já era consumido por `resume_extraction_tasks.py` (linhas 91, 269) que promove análises em espera para `pending` após a extração completar — o ciclo de retry natural já existia.

---

## Riscos

| # | Risco | Avaliação |
|---|---|---|
| R1 | Análise pode ficar presa em `waiting_extraction` se extração nunca completar | Baixo — o retry manual via `/{analysis_id}/retry` agora aceita esse status; admins podem forçar reprocessamento |
| R2 | Race condition inversa: extração completa entre o check e o `session.commit()` | Muito baixo — `resume_extraction_tasks` agenda para `pending` independentemente; a análise seria reprocessada na próxima rodada |
