# JOB-RANKING-SAFE-INVALIDATION-1 — Relatório de Implementação

## Problema resolvido

`job_service._invalidate_job_scores_and_matches()` fazia HARD DELETE de
`CandidateJobScoreModel` e `CandidateJobMatchModel` ANTES do worker de recompute concluir.

Se o worker falhasse (job sem `job_profile_json`, candidato sem análise, Redis indisponível, etc.),
os scores e matches antigos estavam perdidos permanentemente. Os candidatos ficavam sem score
até o próximo trigger manual ou automático.

---

## Estratégia adotada: soft-stale (UPDATE freshness_status='stale')

**Por que não precisou de migration**: ambos os modelos já possuíam o campo `freshness_status`
com valores `'fresh'|'stale'`. Nenhuma coluna nova foi criada.

**Por que funciona com o pipeline existente**:

| Componente | Comportamento com stale |
|---|---|
| `fetch_match_rows()` | Filtra `freshness_status == "fresh"` → rows stale invisíveis no ranking |
| `persist_score()` | Encontra row por `(candidate_id, job_id, version_id)` sem filtro de freshness → row stale é atualizada para fresh após recompute |
| `upsert_candidate_job_match()` | ON CONFLICT DO UPDATE → row stale recebe novos dados; nova row inserida se `job_profile_analysis_id` mudou |

**Garantia de fallback**: se o worker falhar, o UPDATE de freshness='stale' já foi commitado,
mas os rows existem. O ranking atual não exibe dados stale (invisíveis por design),
mas o histórico não foi destruído. O próximo recompute (automático ou manual) restaura fresh.

---

## Mudança implementada

**Arquivo**: `backend/src/application/services/job_service.py`

### Antes (hard delete):
```python
await self._repository._session.execute(
    sa.delete(CandidateJobScoreModel).where(CandidateJobScoreModel.job_id == job_id)
)
await self._repository._session.execute(
    sa.delete(CandidateJobMatchModel).where(CandidateJobMatchModel.job_id == job_id)
)
```

### Depois (soft stale):
```python
await self._repository._session.execute(
    sa.update(CandidateJobScoreModel)
    .where(CandidateJobScoreModel.job_id == job_id)
    .values(freshness_status="stale")
)
await self._repository._session.execute(
    sa.update(CandidateJobMatchModel)
    .where(CandidateJobMatchModel.job_id == job_id)
    .values(freshness_status="stale")
)
```

O UPDATE de `JobProfileAnalysisModel.is_active=False` foi mantido inalterado —
necessário para a lógica de reativação de perfil em `_get_or_create_job_profile_analysis_no_llm`.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `backend/src/application/services/job_service.py` | `_invalidate_job_scores_and_matches`: DELETE → UPDATE stale + docstring atualizado |

## Arquivos criados

| Arquivo | Conteúdo |
|---|---|
| `backend/tests/unit/test_safe_invalidation.py` | 19 testes unitários |

---

## Testes executados

**Novos** (19 passando):
```
tests/unit/test_safe_invalidation.py — 19 passed
```

Covers:
- Source: sem `sa.delete(CandidateJobScoreModel)`, sem `sa.delete(CandidateJobMatchModel)`
- Source: tem `sa.update(CandidateJobScoreModel)`, `sa.update(CandidateJobMatchModel)`, `"stale"`
- Runtime: 3 statements executados (score UPDATE + match UPDATE + profile analysis UPDATE)
- Runtime: nenhum DELETE statement enviado ao session.execute
- Runtime: SET clause contém `freshness_status='stale'` nos updates de score e match
- Runtime: `JobProfileAnalysisModel.is_active=False` continua sendo aplicado
- `persist_score()` não filtra por freshness no lookup → rows stale são atualizadas para fresh
- `_invalidate_job_scores_and_matches` não chama `enqueue_job_match_recompute` (concerns separados)
- Endpoint `recalculate_job_ranking` não chama `_invalidate_job_scores_and_matches`

**Regressão** (91 passando, 2 skipped):
```
tests/unit/test_safe_invalidation.py         — 19 passed
tests/unit/test_recalculate_ranking_endpoint.py — 16 passed
tests/unit/test_ai_usage_hardening.py        — 20 passed
tests/unit/ai_orchestration/test_behavioral_engine.py — 36 passed, 2 skipped
```

---

## Invariantes preservados

- Nenhuma chamada a Gemini ou provider de IA
- Score algorithm não alterado
- Botão "Recalcular" não alterado
- Nenhuma migration criada
- Nenhum histórico de análise apagado
- `git add .` não executado; commit não realizado
