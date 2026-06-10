# JOB-CANDIDATES-SMART-REFRESH-FAILED-RETRY-1

Data: 2026-06-10

---

## Problema identificado

Candidatos com análise em status `failed` ou `cancelled` em estágios avançados do pipeline
(`hr_interview`, `offer`, etc.) não eram reprocessados pelo Smart Refresh. O sistema:

1. Classificava corretamente esses candidatos como `ai_analysis` em `_classify()`
2. Mas o `AnalysisRequestPolicy.decide()` bloqueava o dispatch com `auto_analysis_blocked_after_screening`
   para qualquer trigger diferente de `"manual"` em estágio fora de `{"entry", "screening"}`

O resultado: `decision.created = False`, o candidato era silenciosamente ignorado e o recrutador
precisava reprocessar manualmente um a um.

---

## Causa raiz

`AnalysisRequestPolicy.decide()` em `analysis_dispatch_service.py`:

```python
# ANTES (bug):
if stage not in _AUTO_ALLOWED_STAGES:
    return AnalysisDispatchDecision(..., blocked=True, reason="auto_analysis_blocked_after_screening")
```

A condição não distinguia `smart_refresh` de `automatic`, bloqueando ambos em estágios avançados.

---

## Correção implementada

### Backend: `analysis_dispatch_service.py`

Adicionada exceção explícita para `smart_refresh`, que é uma ação bulk confirmada pelo usuário via modal:

```python
# smart_refresh bypasses the post-screening stage restriction so failed/cancelled
# analyses can be retried at any active non-terminal stage.
if trigger_source != "smart_refresh" and stage not in _AUTO_ALLOWED_STAGES:
    return AnalysisDispatchDecision(..., blocked=True, reason="auto_analysis_blocked_after_screening")
```

A restrição de pipeline terminal (`pipeline_status == "terminal"`) ainda bloqueia `smart_refresh`,
pois candidatos terminais (rejeitados, contratados, etc.) não devem receber nova análise.

### Backend: `smart_refresh_use_case.py`

1. **Constante `_FAILED_STATUSES`** adicionada: `frozenset({"failed", "cancelled"})`
2. **`_classify()`** agora retorna `("ai_analysis", "failed_analysis_retry")` para análises em erro:
   ```python
   if row.analysis_status in _FAILED_STATUSES:
       return "ai_analysis", "failed_analysis_retry"
   ```
3. **`SmartRefreshPreviewData`** ganhou `ai_analysis_failed_retry_count: int`
4. **`SmartRefreshExecuteData`** ganhou `failed_analysis_retried: int`
5. **`ai_candidates`** no execute agora armazena `list[tuple[UUID, str]]` com o motivo,
   permitindo rastrear `failed_analysis_retried` ao final do loop
6. **Warnings** incluem aviso específico quando `ai_analysis_failed_retry > 0`:
   `"N candidato(s) com análise em erro serão reenfileirados para nova tentativa."`
7. **Mensagem do execute** inclui `"(N retry de erro)"` quando aplicável

### Backend: `ranking_schemas.py`

- `_SmartRefreshAiAnalysis`: campo `failed_retry_count: int = 0`
- `SmartRefreshExecuteResponse`: campo `failed_analysis_retried: int = 0`

### Backend: `routers/jobs.py`

- `smart_refresh_preview`: calcula `ai_description` contextualizado incluindo contagem de failed retries;
  passa `"failed_retry_count": data.ai_analysis_failed_retry_count` no dict `ai_analysis`
- `smart_refresh_execute`: passa `failed_analysis_retried=data.failed_analysis_retried` na resposta

### Frontend: `jobsService.ts`

- `SmartRefreshPreview.ai_analysis`: campo `failed_retry_count?: number`
- `SmartRefreshResult`: campo `failed_analysis_retried?: number`

### Frontend: `SmartRefreshModal.tsx`

Row condicional "Reprocessar análises com erro" exibida quando `failed_retry_count > 0`:
```tsx
{(preview.ai_analysis.failed_retry_count ?? 0) > 0 && (
  <div className="flex items-center justify-between">
    <span className="text-text-muted">Reprocessar análises com erro</span>
    <span className="font-medium text-[hsl(var(--warning))]">
      {preview.ai_analysis.failed_retry_count}
    </span>
  </div>
)}
```

---

## Fluxo corrigido para candidato em `hr_interview` com `failed` analysis

1. Smart Refresh preview: `_classify()` → `("ai_analysis", "failed_analysis_retry")`
2. `ai_analysis_failed_retry_count` incrementado; warning adicionado
3. Modal exibe row "Reprocessar análises com erro" com contagem
4. Usuário confirma → execute loop
5. `dispatcher.request_auto_analysis(..., trigger_source="smart_refresh")`
6. `AnalysisRequestPolicy.decide()`: `trigger_source == "smart_refresh"` → bypassa restrição de estágio
7. `RequestAnalysisUseCase` detecta `status in ("failed", "cancelled")` → adiciona suffix `:force:{ts}` na idempotency key
8. Nova análise criada e enfileirada; `decision.created = True`
9. `failed_analysis_retried` incrementado; `ai_analysis_enqueued` incrementado
10. Resposta inclui `failed_analysis_retried` para log/UI

---

## Testes

### Backend: `tests/unit/test_smart_refresh_use_case.py`

Testes adicionados/corrigidos (53 total, eram 42):

**TestClassify:**
- `test_failed_reason_is_failed_analysis_retry` (corrigido: era `no_valid_analysis`)
- `test_cancelled_reason_is_failed_analysis_retry` (novo)
- `test_failed_without_resume_is_skipped_no_resume` (novo)

**TestPreview:**
- `test_p3b_failed_retry_count_tracked_in_preview` (novo)
- `test_p3c_failed_retry_warning_present_when_count_positive` (novo)

**TestExecute:**
- `test_e9_failed_analysis_dispatched_and_counted_in_failed_retried` (novo)
- `test_e10_cancelled_analysis_dispatched_and_counted_in_failed_retried` (novo)
- `test_e11_failed_without_resume_not_dispatched` (novo)
- `test_e12_failed_analysis_retried_zero_when_dispatcher_not_created` (novo)

### Backend: `tests/unit/test_analysis_request_policy.py`

Testes adicionados (7 total, eram 5):
- `test_smart_refresh_allowed_at_post_screening_stage` — verifica bypass para `hr_interview`
- `test_smart_refresh_still_blocked_for_terminal_pipeline` — verifica que pipeline terminal ainda bloqueia

### Frontend: `SmartRefreshModal.test.tsx`

Testes adicionados (14 total, eram 12):
- `shows failed retry row when failed_retry_count > 0`
- `does not show failed retry row when failed_retry_count is 0 or absent`

---

## Escopo preservado

- Sem alteração ao algoritmo de scoring
- Sem alteração ao Gemini/prompt/provider
- Sem migration de banco de dados
- Sem alteração ao Vite/dev scripts
- Sem alteração ao PipelinePage/tema/navbar/Protheus
- Sem git add . / sem commit
