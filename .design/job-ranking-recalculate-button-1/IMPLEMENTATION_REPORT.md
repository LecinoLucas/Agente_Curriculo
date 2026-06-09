# JOB-RANKING-RECALCULATE-BUTTON-1 — Relatório de Implementação

## Achado da auditoria (JOB-MATCH-RECALC-AUDIT-1)

O sistema já possuía o fluxo completo de recalculação determinística:
- `analysis_service.recompute_match_from_existing_profiles()` — docstring: "Never calls LLM or AI provider"
- `CandidateRankingService.compute_and_persist()` — usa dados do banco, sem provider
- `recompute_job_matches_task` / `enqueue_job_match_recompute` — worker Celery sem LLM

O único gap era a ausência de um endpoint HTTP e um botão no frontend para acionar esse fluxo manualmente.

---

## Por que não chama Gemini

O endpoint `POST /{job_id}/recalculate-ranking` faz apenas:
1. Busca o `JobModel` para validar existência e `job_profile_hash`
2. Chama `enqueue_job_match_recompute(job_id)` — que enfileira o Celery task existente

O Celery task usa apenas:
- `AnalysisResultModel.extracted_data` — skills já extraídas
- `CandidateProfileAnalysisModel` — seniority/experience/education já salvos
- `ResumeVersionModel.extracted_text` — fallback de skills por texto
- `JobModel.job_profile_json` — perfil determinístico da vaga
- `JobRequiredSkillModel` — skills requeridas com peso/prioridade
- `ScoreModelVersionModel` — weights e thresholds

Nenhuma chamada a `GeminiProvider`, `AIAnalysisRequest`, `AnalysisService.run_analysis()`.

---

## Endpoint criado

**Arquivo**: `backend/src/interface/api/routers/jobs.py`

```
POST /api/v1/jobs/{job_id}/recalculate-ranking
Status: 202 Accepted
Permissão: RecruiterOrAdmin
```

**Comportamento**:
- Job não encontrado → 404
- Job sem `job_profile_hash` → 409 com código `job_profile_not_ready`
- Job válido → 202, enfileira `enqueue_job_match_recompute(job_id)`, retorna `provider_calls=0`

**Response**:
```json
{
  "job_id": "...",
  "queued": true,
  "provider_calls": 0,
  "message": "Recálculo de ranking enfileirado sem nova chamada de IA."
}
```

---

## Schema criado

**Arquivo**: `backend/src/interface/api/schemas/ranking_schemas.py`

```python
class RankingRecalculateResponse(BaseModel):
    job_id: UUID
    queued: bool
    provider_calls: int
    message: str
```

`provider_calls: int` é parte explícita do contrato — prova auditável de zero tokens consumidos.

---

## Botão criado

**Arquivo**: `frontend/src/pages/PipelinePage.tsx`

Localização: header do `RankingPanel` (sidebar de ranking da PipelinePage), ao lado do botão de refresh.

**Label**: "Recalcular"
**Title (tooltip)**: "Recalcular ranking usando dados já analisados — sem nova chamada de IA"
**Comportamento**:
- Loading state com `Loader2` spinner enquanto aguarda resposta
- Desabilitado durante `isRecalculating` ou quando `loading` do ranking
- Toast de sucesso: "Recálculo de ranking enfileirado. Nenhum token de IA foi usado."
- Recarrega o ranking automaticamente após 3s
- Toast de erro amigável se falhar

---

## Service criado

**Arquivo**: `frontend/src/services/jobsService.ts`

```typescript
export type RankingRecalculateResponse = {
  job_id: string;
  queued: boolean;
  provider_calls: number;
  message: string;
};

export async function recalculateJobRanking(
  jobId: string
): Promise<RankingRecalculateResponse>
```

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `backend/src/interface/api/schemas/ranking_schemas.py` | + `RankingRecalculateResponse` |
| `backend/src/interface/api/routers/jobs.py` | + import `RankingRecalculateResponse` + endpoint `POST /{job_id}/recalculate-ranking` |
| `frontend/src/services/jobsService.ts` | + `recalculateJobRanking()` + tipo `RankingRecalculateResponse` |
| `frontend/src/pages/PipelinePage.tsx` | + `isRecalculating` state + `handleRecalculate` + props em `RankingPanel` + botão "Recalcular" |

## Arquivos criados

| Arquivo | Conteúdo |
|---|---|
| `backend/tests/unit/test_recalculate_ranking_endpoint.py` | 16 testes unitários |
| `frontend/src/services/__tests__/recalculateJobRanking.test.ts` | 5 testes |

---

## Testes executados

**Backend** (16 passando):
```
tests/unit/test_recalculate_ranking_endpoint.py — 16 passed
```
Covers: queued=True, provider_calls=0, job_id correto, enqueue chamado, 404, 409,
source sem Gemini/AnalysisService/_invalidate, schema com provider_calls.

**Regressão backend** (72 passando, 2 skipped):
```
tests/unit/test_recalculate_ranking_endpoint.py — 16 passed
tests/unit/test_ai_usage_hardening.py — 20 passed
tests/unit/ai_orchestration/test_behavioral_engine.py — 36 passed, 2 skipped
```

**Frontend** (5 passando):
```
src/services/__tests__/recalculateJobRanking.test.ts — 5 passed
```
Covers: URL correta, método POST, provider_calls=0, não chama endpoints de análise IA,
propaga erros HTTP.

**TypeScript**: `npx tsc --noEmit` — sem erros.
**Build**: `npm run build` — limpo, sem warnings.

---

## Risco conhecido: hard delete antes do recompute

`job_service._invalidate_job_scores_and_matches()` faz HARD DELETE de `CandidateJobScoreModel`
e `CandidateJobMatchModel` ANTES de confirmar que o worker de recompute vai funcionar.

Se o worker falhar (job sem `job_profile_json`, candidato sem análise concluída, etc.),
os dados antigos estão perdidos e os candidatos ficam sem score até o próximo trigger.

**Esta fase NÃO altera esse comportamento.** O endpoint apenas chama `enqueue_job_match_recompute`
sem tocar em `_invalidate_job_scores_and_matches`.

---

## Próxima fase recomendada: RANKING-STALE-SAFE-INVALIDATION-1

Trocar o HARD DELETE por soft invalidation (marcar `freshness_status="stale"`) para preservar
dados históricos e permitir fallback em caso de falha do worker. Permitiria também exibir
o score antigo (com badge "desatualizado") enquanto o recompute está em andamento.

Arquivos envolvidos: `job_service._invalidate_job_scores_and_matches()`,
`candidate_ranking_context_loader.fetch_match_rows()` (atualmente filtra apenas `freshness_status="fresh"`).
