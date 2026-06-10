# JOB-MATCH-RECALC-AUDIT-1 — Plano do Botão "Recalcular Ranking"

## Onde colocar o botão

### Localização primária: `RankingPanel` na `PipelinePage`

**Arquivo**: `frontend/src/pages/PipelinePage.tsx`
**Componente**: `RankingPanel` (linha ~1153)
**Posição**: Header do painel de ranking, ao lado do botão de refresh (que atualmente faz GET)

O `RankingPanel` já tem:
- `onRefresh` — recarrega GET do ranking
- `isRefreshing` — mostra "Recalculando aderência dos candidatos…"
- `onToggle` — fecha o painel

**Proposta**: Adicionar `onRecalculate` que dispara o POST de recalculação, separado do `onRefresh`.

```
[IA Ranking] [título da vaga]          [⟳ Recalcular] [×]
              (stale badge se freshness ≠ fresh)
```

### Localização secundária: Banner de stale

Quando `ranking.candidates` tem entradas com `ranking_freshness_status: "stale"`,
exibir um banner no topo do ranking:

```
⚠ Aderência desatualizada — a vaga foi modificada.
  [Recalcular ranking]  (link/botão secundário)
```

Isso já tem suporte visual: `getRankingFreshnessLabel("stale")` retorna "Aderência desatualizada".

---

## Qual endpoint chamar

### Opção A: Aproveitar o worker Celery existente

`POST /{job_id}/recalculate-ranking` (novo endpoint a criar)

- Backend: chama `enqueue_job_match_recompute(job_id)` (mesma chamada do job update)
- Resposta imediata: `{"status": "enqueued"}` — o job fica em background
- Frontend: polling do GET `/ranking` a cada ~3s até `candidates` voltarem ou timeout de 30s
- Pro: reutiliza o path exato do worker, zero duplicação
- Con: resposta assíncrona (o usuário clica e aguarda)

### Opção B: Executar síncronamente no request

`POST /{job_id}/recalculate-ranking` (síncrono)

- Backend: chama `_do_recompute_job_matches()` + `compute_and_persist()` inline
- Resposta: `{"processed": N, "skipped": M, "score_version": "..."}`
- Pro: feedback imediato e determinístico
- Con: pode ser lento se muitos candidatos (timeout 30s HTTP)

**Recomendação**: Opção A (enqueue) com polling no frontend.
O path de recompute já suporta isso — o worker já existe e é testado.

---

## Estrutura do novo endpoint (backend)

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
    job = await db.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    if job is None:
        raise HTTPException(404)
    if not job.job_profile_hash:
        raise HTTPException(409, "Vaga sem perfil gerado. Gere o perfil antes de recalcular.")
    await enqueue_job_match_recompute(job_id)
    return RankingRecalculateResponse(status="enqueued", job_id=job_id)
```

Schema de resposta:
```python
class RankingRecalculateResponse(BaseModel):
    status: str          # "enqueued"
    job_id: UUID
    message: str = "Recalculação enfileirada. Aguarde alguns segundos."
```

---

## Comportamento do frontend

```
Usuário clica "Recalcular ranking"
  → POST /{job_id}/recalculate-ranking
  → isRecalculating = true (spinner / mensagem "Recalculando...")
  → polling: GET /{job_id}/ranking a cada 3s por até 30s
  → se ranking retornar com candidates: isRecalculating = false, exibe ranking
  → se timeout: exibe "Recalculação em andamento. Atualize em instantes."
```

Estado do botão durante operação: desabilitado + loading spinner.

---

## Diferença clara para o usuário: Recalcular × Reanalisar

| Ação | Label no UI | Chama Gemini? | Custo |
|---|---|---|---|
| Recalcular ranking | "Recalcular ranking" | NÃO | Zero tokens |
| Reanalisar currículo | "Reanalisar" (por candidato) | SIM | Tokens Gemini |

O botão "Recalcular ranking" deve ter tooltip explícito:
> "Atualiza o score de todos os candidatos com base nos dados já analisados.
>  Não reanalisa currículos — nenhum custo de IA."

---

## Proteções necessárias

1. **Rate limiting por job**: não permitir mais de 1 enqueue por job a cada 60s
   (o debounce do Redis já faz isso automaticamente)

2. **Validação de `job_profile_hash`**: se a vaga não tem hash, o recompute vai falhar silenciosamente;
   retornar 409 com mensagem clara

3. **Permissão**: apenas `RecruiterOrAdmin` — não candidatos

4. **Idempotência**: chamar 2x com debounce enfileira apenas 1 task (já garantido pelo Redis)
