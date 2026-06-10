# JOB-MATCH-RECALC-AUDIT-1 — Mapa do Fluxo de Ranking

## Fluxo completo hoje

### Fluxo 1: Análise inicial (CHAMA Gemini)

```
POST /jobs/{job_id}/candidates/{candidate_id}/analyze
    └── AnalysisService.run_analysis()
            ├── GeminiProvider.analyze() ← GEMINI
            │       └── extrai skills, seniority, education, experience → AnalysisResultModel
            ├── _ensure_candidate_profile_analysis() → CandidateProfileAnalysisModel
            ├── _ensure_job_profile_analysis() → JobProfileAnalysisModel (determinístico)
            ├── _match_details_to_job()
            │       ├── _compute_skill_scores() [determinístico]
            │       └── AnalysisMatchStore.persist_candidate_job_match()
            │               └── CandidateJobMatchModel (freshness_status="fresh")
            └── AnalysisRankingRefreshService.refresh_after_match()
                    └── CandidateRankingService.compute_single_candidate()
                            └── CandidateJobScoreModel (freshness_status="fresh")
```

### Fluxo 2: Job atualizado — recálculo automático (NÃO chama Gemini)

```
PATCH /jobs/{job_id}  (campos estruturais alterados)
    └── JobService.update()
            ├── _invalidate_job_scores_and_matches(job_id)
            │       ├── DELETE CandidateJobScoreModel WHERE job_id=?
            │       ├── DELETE CandidateJobMatchModel WHERE job_id=?
            │       └── UPDATE JobProfileAnalysisModel SET is_active=False WHERE job_id=?
            ├── _maybe_generate_job_profile(job) [determinístico, sem LLM]
            └── enqueue_job_match_recompute(job_id)
                    └── [Celery / asyncio task]
                            └── _do_recompute_job_matches(session, job_id)
                                    ├── _get_or_create_job_profile_analysis_no_llm(session, job)
                                    │       └── cria/atualiza JobProfileAnalysisModel de job.job_profile_json
                                    └── para cada candidato ativo no pipeline:
                                            ├── find_latest_completed_for_version(resume_version_id, job_id)
                                            └── AnalysisService.recompute_match_from_existing_profiles()
                                                    ├── AnalysisResultModel (de banco, sem LLM)
                                                    ├── CandidateProfileAnalysisModel (de banco)
                                                    ├── _compute_skill_scores() [determinístico]
                                                    └── CandidateJobMatchModel (nova row, fresh)
                                    └── CandidateRankingService.compute_and_persist(job_id)
                                            └── CandidateJobScoreModel (nova row, fresh)
```

### Fluxo 3: Recalcular score de candidato individual (NÃO chama Gemini)

```
POST /jobs/{job_id}/candidates/{candidate_id}/scoring
    └── CandidateRankingService.compute_single_candidate()
            ├── fetch_match_rows(job_id, candidate_id=candidate_id)
            │       └── JOIN: CandidateJobMatch (freshness="fresh") + CandidateProfile + AnalysisResult
            └── _build_score_payload() → persist_score()
                    └── CandidateJobScoreModel (atualizado)
```

### Fluxo 4: Force recompute — reanalisa com Gemini

```
POST /jobs/{job_id}/candidates/{candidate_id}/force-recompute
    └── AnalysisRankingRefreshService.refresh_after_match()
            └── CHAMA Gemini via AnalysisService.run_analysis()
```

---

## Onde o ranking é calculado

| Passo | Arquivo | Método | Chama Gemini? |
|---|---|---|---|
| Cria match row | `analysis_match_store.py` | `persist_candidate_job_match()` | Não |
| Cria score row | `candidate_ranking_service.py` | `compute_and_persist()` | Não |
| Single candidate score | `candidate_ranking_service.py` | `compute_single_candidate()` | Não |
| Score computation | `candidate_ranking_service.py` | `_build_score_payload()` | Não |
| Breakdown | `candidate_ranking_service.py` | `_compute_breakdown()` | Não |
| Skill scores | `analysis_service.py` | `_compute_skill_scores()` | Não |
| Match from profiles | `analysis_service.py` | `recompute_match_from_existing_profiles()` | Não |
| Análise original | `analysis_service.py` | `run_analysis()` | **SIM** |

---

## Freshness: como é detectado stale

`_resolve_freshness_status()` marca como stale se qualquer condição:

1. `persisted_status != "fresh"` — score foi marcado manualmente como stale
2. `score_job_signature_hash == None` — score sem hash
3. `job.job_profile_hash == None` — vaga sem hash
4. `score_job_signature_hash != job.job_profile_hash` — vaga mudou desde o score
5. `score_computed_at < job.updated_at` — score mais antigo que a última edição da vaga
6. `score_source_analysis_id != pipeline.current_analysis_id` — análise mudou

Qualquer um desses stale → o score aparece como `ranking_freshness_status: "stale"` na PipelinePage.

---

## Endpoints de ranking existentes

| Método | URL | O que faz | Gemini? |
|---|---|---|---|
| `GET` | `/{job_id}/ranking` | Lista ranking com paginação | Não |
| `GET` | `/{job_id}/ranking/{candidate_id}` | Entry de um candidato | Não |
| `POST` | `/{job_id}/scoring` | Computa scores de TODOS (necessita match rows) | Não |
| `POST` | `/{job_id}/candidates/{candidate_id}/scoring` | Score individual (necessita match row) | Não |
| `POST` | `/{job_id}/candidates/{candidate_id}/force-recompute` | Reanalisa + score | **SIM** |

**Gap**: Não existe `POST /{job_id}/recalculate-ranking` que rebuild match rows + scores
sem Gemini, para todos os candidatos, sob demanda via HTTP.
