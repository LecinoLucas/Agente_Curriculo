# JOB-MATCH-RECALC-AUDIT-1 — Plano de Implementação

## Visão geral

O sistema já suporta recalculação completa sem Gemini. A fase de implementação
é pequena: um endpoint novo + schema + botão no frontend.

**Não há migration, não há alteração de modelos, não há alteração de scoring.**

---

## Fase: JOB-MATCH-RECALC-IMPL-1

### Regras da fase
- Não chamar Gemini, não alterar scoring, não alterar prompts
- Não alterar `candidate_ranking_service.py` nem `analysis_service.py` nem `matching_tasks.py`
- Não alterar `_invalidate_job_scores_and_matches` (pode criar bugs)
- Não criar migration (nenhum campo novo)
- Não alterar bot, behavioral, análise, RAG
- Commitar apenas ao final, com aprovação

---

## Tarefas backend

### Tarefa B1: Schema `RankingRecalculateResponse`

**Arquivo**: `backend/src/interface/api/schemas/ranking_schemas.py`

Adicionar:
```python
class RankingRecalculateResponse(BaseModel):
    status: str
    job_id: UUID
    message: str = "Recalculação enfileirada. Aguarde alguns segundos."
```

### Tarefa B2: Endpoint `POST /{job_id}/recalculate-ranking`

**Arquivo**: `backend/src/interface/api/routers/jobs.py`

Inserir após linha ~1509 (após `get_candidate_ranking_entry`):

```python
@router.post(
    "/{job_id}/recalculate-ranking",
    response_model=RankingRecalculateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def recalculate_job_ranking(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> RankingRecalculateResponse:
    """Enqueue match+score recomputation for all pipeline candidates. Never calls LLM."""
    import sqlalchemy as sa
    from src.infrastructure.database.models.job_model import JobModel
    from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

    job = await db.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada.")
    if not job.job_profile_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vaga sem perfil gerado. Gere o perfil antes de recalcular.",
        )
    await enqueue_job_match_recompute(job_id)
    return RankingRecalculateResponse(status="enqueued", job_id=job_id)
```

### Tarefa B3: Testes unitários do endpoint

**Arquivo**: `backend/tests/unit/test_recalculate_ranking_endpoint.py` (novo)

Casos:
- Job não encontrado → 404
- Job sem `job_profile_hash` → 409
- Job válido → 202, `status="enqueued"`, `enqueue_job_match_recompute` chamado 1x
- Usuário sem permissão → 403 (coberto pelo `RecruiterOrAdmin` dependency)

---

## Tarefas frontend

### Tarefa F1: Adicionar `onRecalculate` ao `RankingPanel`

**Arquivo**: `frontend/src/pages/PipelinePage.tsx`

Mudanças mínimas:
1. Adicionar prop `onRecalculate?: () => Promise<void>` no `RankingPanel`
2. Adicionar estado `isRecalculating: boolean` na `PipelinePage`
3. Implementar `handleRecalculate`: POST → polling GET com intervalo de 3s, max 10 tentativas
4. Passar `onRecalculate={handleRecalculate}` e `isRecalculating={isRecalculating}` para `RankingPanel`

### Tarefa F2: Botão no header do `RankingPanel`

**Arquivo**: `frontend/src/pages/PipelinePage.tsx` (RankingPanel, linha ~1200)

Adicionar botão ao lado do botão "Fechar":
```tsx
{onRecalculate && (
  <button
    type="button"
    onClick={() => void onRecalculate()}
    disabled={isRecalculating}
    title="Recalcular ranking sem chamar IA (usa dados já analisados)"
    className="..."
  >
    {isRecalculating
      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
      : <RefreshCw className="h-3.5 w-3.5" />
    }
  </button>
)}
```

### Tarefa F3: Banner de stale no `RankingPanel`

Quando algum candidato tem `ranking_freshness_status === "stale"`, exibir:
```tsx
<div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3.5 py-2 text-[10px] font-semibold text-amber-800 flex items-center justify-between">
  <span>Aderência desatualizada — a vaga foi modificada.</span>
  {onRecalculate && (
    <button onClick={() => void onRecalculate()} className="underline ml-2">
      Recalcular
    </button>
  )}
</div>
```

### Tarefa F4: Adicionar chamada de API em `api/jobs.ts` (ou equivalente)

```typescript
export async function recalculateJobRanking(jobId: string): Promise<{ status: string }> {
  const response = await apiClient.post(`/jobs/${jobId}/recalculate-ranking`);
  return response.data;
}
```

---

## Arquivos que serão alterados

| Arquivo | Mudança |
|---|---|
| `backend/src/interface/api/schemas/ranking_schemas.py` | Adicionar `RankingRecalculateResponse` |
| `backend/src/interface/api/routers/jobs.py` | Novo endpoint `POST /{job_id}/recalculate-ranking` |
| `frontend/src/pages/PipelinePage.tsx` | `isRecalculating` state + `handleRecalculate` + botão no `RankingPanel` |
| `frontend/src/api/jobs.ts` (ou equivalente) | `recalculateJobRanking()` |

## Arquivos que NÃO serão alterados

- `candidate_ranking_service.py` — nenhuma lógica de scoring muda
- `analysis_service.py` — nenhuma lógica de match muda
- `matching_tasks.py` / `matching_dispatcher.py` — worker já existe
- `_invalidate_job_scores_and_matches` — não tocar (risco de perda de dados)
- Qualquer model/migration — nenhum campo novo necessário
- Frontend: nada além de PipelinePage e api/jobs

---

## Riscos de implementação

1. **Polling no frontend**: se o worker demorar mais de 30s (job com muitos candidatos),
   o frontend vai exibir timeout. Adicionar mensagem "Recalculação pode levar alguns instantes.
   Atualize manualmente se necessário."

2. **Debounce 60s**: se o recrutador clicar 2x em 60s, o segundo click não enfileira nova task.
   O botão deve mostrar feedback de "já enfileirado" ao receber 202 duas vezes sem mudança.

3. **Job sem `job_profile_hash`**: A resposta 409 deve orientar o usuário a gerar o perfil
   da vaga primeiro (campo separado na UI de edição de vaga).

---

## Estimativa de esforço

- Backend (B1+B2+B3): ~2h
- Frontend (F1+F2+F3+F4): ~3h
- Testes e review: ~1h
- Total: ~6h
