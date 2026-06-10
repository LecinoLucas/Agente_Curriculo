# JOB-CANDIDATES-SMART-REFRESH-BACKEND-1 — Implementation Report

## Por que esta fase foi necessária

O frontend já implementava o botão "Atualizar candidatos" com preview e confirmação. Ambas as chamadas retornavam 404 porque os endpoints de backend não existiam.

## Estado anterior

- Frontend: funcional (modal, botão, hook, service)
- Backend: sem endpoints → 404

## O que foi implementado

### Endpoints criados

| Método | URL | Status |
|--------|-----|--------|
| POST | `/api/v1/jobs/{job_id}/candidates/smart-refresh/preview` | 200 |
| POST | `/api/v1/jobs/{job_id}/candidates/smart-refresh/execute` | 202 |

### Arquivos alterados

| Arquivo | Tipo |
|---------|------|
| `backend/src/interface/api/schemas/ranking_schemas.py` | Adicionados 5 schemas |
| `backend/src/application/use_cases/smart_refresh_use_case.py` | Criado (novo) |
| `backend/src/interface/api/routers/jobs.py` | 2 endpoints + imports |
| `backend/tests/unit/test_smart_refresh_use_case.py` | Criado (novo, 28 testes) |

## Lógica de classificação de candidatos

Cada candidato ativo na pipeline da vaga (`relationship_status='active'`, `is_terminal=false`) é classificado em exatamente um grupo:

```
1. sem currículo           → skipped_no_resume
2. pending/processing/     → skipped_already_processing
   retry_scheduled/
   waiting_extraction
3. analysis_status=        → ranking_recalculation
   'completed'
4. demais (failed,         → ai_analysis
   cancelled, discarded,
   None)
```

A classificação é feita via query SQL com:
- LEFT JOIN em `analyses` via `current_analysis_id`
- EXISTS correlacionado em `resume_versions → resumes` por `candidate_id`

## Garantias de custo

### Preview
- `provider_calls_now = 0` (implícito — não chama nada)
- Não cria análises
- Não enfileira tasks
- Apenas lê e classifica

### Execute
- `provider_calls_now = 0` sempre
- Candidatos `completed` → `enqueue_job_match_recompute(job_id)` chamado no máximo uma vez
  - Usa análises persistidas, zero chamadas a provedor de IA
- Candidatos `ai_analysis` → `CandidateJobAnalysisDispatcher.request_auto_analysis()` por candidato
  - Enfileira para worker; provedor pode ser chamado depois (`may_use_provider_later=true`)
  - Não chama Gemini diretamente na request HTTP
- `pending`/`processing` → ignorados sem duplicar task
- Sem currículo → contados em `skipped_no_resume`

## Testes executados

```
44 passed (unit: smart_refresh ou recalculate_ranking)
28 novos testes de SmartRefreshUseCase + 16 existentes de recalculate_ranking
```

Cobertura de invariantes:
- P1–P7: preview (classificação, sem chamada de provider)
- E1–E7: execute (enqueue, dispatch, skips, provider_calls_now=0)
- R1–R2: router (404 para job inexistente)

## Compatibilidade de contrato

O backend retorna exatamente os campos esperados pelo frontend (`SmartRefreshPreview` e `SmartRefreshResult` em `jobsService.ts`):

```typescript
// Frontend espera:
SmartRefreshPreview.ranking_recalculation.count        ✓
SmartRefreshPreview.ranking_recalculation.provider_calls ✓
SmartRefreshPreview.ai_analysis.count                 ✓
SmartRefreshPreview.ai_analysis.may_use_provider      ✓
SmartRefreshPreview.skipped.count                     ✓
SmartRefreshPreview.skipped.reasons[]                 ✓

SmartRefreshResult.queued                              ✓
SmartRefreshResult.ranking_recalculation_enqueued     ✓
SmartRefreshResult.ranking_candidates                 ✓
SmartRefreshResult.ai_analysis_enqueued               ✓
SmartRefreshResult.skipped_already_processing         ✓
SmartRefreshResult.skipped_no_resume                  ✓
SmartRefreshResult.provider_calls_now                 ✓
SmartRefreshResult.may_use_provider_later             ✓
SmartRefreshResult.message                            ✓
```
