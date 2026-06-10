# JOB-MATCH-RECALC-AUDIT-1 — Relatório de Auditoria

## Veredito

**SIM. O sistema já salva dados suficientes para recalcular ranking/match sem chamar Gemini.**

O fluxo completo de recalculação sem LLM já existe e é acionado automaticamente ao editar uma vaga.
O que FALTA é apenas um endpoint HTTP que permita ao recrutador acionar esse mesmo fluxo manualmente,
e um botão "Recalcular ranking" no frontend.

---

## Pergunta central

> O sistema salva dados suficientes da última análise IA do candidato para recalcular
> o ranking/match contra uma vaga sem chamar Gemini novamente quando a vaga muda?

**Resposta**: Sim. Veja:

| Dado necessário | Onde está salvo | Suficiente? |
|---|---|---|
| Skills do candidato extraídas pela IA | `AnalysisResultModel.extracted_data` (JSONB) | ✅ |
| Fallback de skills (keywords) | `AnalysisResultModel.keywords` (array) | ✅ |
| Texto bruto do currículo | `ResumeVersionModel.extracted_text` | ✅ (usado como fallback de skills) |
| Nível de senioridade do candidato | `CandidateProfileAnalysisModel.seniority_level` | ✅ |
| Anos de experiência | `CandidateProfileAnalysisModel.experience_years` | ✅ |
| Nível de educação | `CandidateProfileAnalysisModel.education_level` | ✅ |
| Perfil semântico da vaga | `JobModel.job_profile_json` (gerado sem LLM por `build_deterministic_job_profile`) | ✅ |
| Skills requeridas pela vaga | `JobRequiredSkillModel` (linked_skills com peso/nível/prioridade) | ✅ |
| Versão do modelo de score | `ScoreModelVersionModel` (weights, thresholds) | ✅ |

---

## O que o sistema já faz automaticamente

Quando uma vaga é editada em campos estruturais (`title`, `description`, `requirements`,
`seniority_level`, `job_area`, `skill_requirements`, etc.):

1. `job_service.update()` detecta a mudança via `provided_fields.intersection(...)`
2. Chama `_invalidate_job_scores_and_matches(job_id)`:
   - **HARD DELETE** de `CandidateJobScoreModel` para o job
   - **HARD DELETE** de `CandidateJobMatchModel` para o job
   - `is_active = False` em `JobProfileAnalysisModel` para o job
3. Chama `_maybe_generate_job_profile(saved_job)` (determinístico, sem LLM)
4. Chama `enqueue_job_match_recompute(job_id)` → Celery task `recompute_job_matches_task`

O worker Celery faz:
1. Carrega `JobProfileAnalysis` de `job.job_profile_json` (zero LLM)
2. Para cada candidato ativo no pipeline: busca `AnalysisModel` + `AnalysisResultModel` mais recentes
3. Chama `analysis_service.recompute_match_from_existing_profiles()` (docstring: "Never calls LLM or AI provider")
4. Recria `CandidateJobMatchModel` com `freshness_status="fresh"`, `job_signature_hash=job.job_profile_hash`
5. `CandidateRankingService.compute_and_persist()` recalcula scores dos novos match rows

---

## O que FALTA

### Gap 1: Endpoint manual para disparar recalculação

Não existe endpoint HTTP que permita ao recrutador disparar o fluxo de recalculação
manualmente (equivalente ao Celery task, mas sob demanda via botão).

Existe:
- `POST /{job_id}/scoring` — compute scores dos match rows EXISTENTES (falha se não há match rows fresh)
- `POST /{job_id}/candidates/{candidate_id}/force-recompute` — REANALISA com Gemini (overkill, chama LLM)

Não existe:
- `POST /{job_id}/recalculate-ranking` — dispara o mesmo fluxo do worker sem LLM, para todos os candidatos do pipeline

### Gap 2: Botão no frontend

A `PipelinePage` tem um `RankingPanel` com um `onRefresh` que apenas refaz o GET do ranking.
Não há botão que acione a recalculação dos scores (POST).

### Gap 3: Candidatos sem análise concluída são silenciosamente ignorados

No worker, `latest_completed is None` → `skipped += 1`. O candidato fica sem match row
e portanto sem score. Não há aviso ao recrutador sobre quantos candidatos foram ignorados.

---

## Riscos identificados

### Risco crítico: HARD DELETE antes do recompute

`_invalidate_job_scores_and_matches()` deleta PERMANENTEMENTE os scores e matches antigos
ANTES de confirmar que o recompute vai funcionar. Se o worker Celery falhar (job sem
`job_profile_json`, sem candidatos com análise, etc.), os dados antigos estão perdidos.

Não há "soft stale + recompute": é delete + rebuild.

Consequência: se o worker falhar, os candidatos ficam sem score até o próximo trigger.

### Risco médio: Debounce de 60s no enqueue

`enqueue_job_match_recompute` usa Redis para debounce: se já há uma task enfileirada para
o job, o novo enqueue é ignorado. Se o botão "Recalcular ranking" acionar múltiplos
requests em 60s, apenas o primeiro será efetivamente enfileirado.

### Risco baixo: CandidateProfileAnalysisModel vs AnalysisResultModel

O ranking usa `CandidateProfileAnalysisModel.experience_years`, `.seniority_level`,
`.education_level` — que são preenchidos pelo `_ensure_candidate_profile_analysis` a partir
do `AnalysisResultModel`. Se o `CandidateProfileAnalysis` estiver desatualizado em relação
ao `AnalysisResult` mais recente, o score pode não refletir a análise mais nova.

---

## Separação análise × match: riscos se implementar direto

Análise (Gemini) e match (determinístico) são dois passes independentes. Se implementar
"Recalcular ranking" diretamente sem separar os dois:

1. **Confusão no frontend**: o usuário pode clicar "Recalcular" esperando que o Gemini
   reanalise o currículo, mas receber só o recálculo de score com dados antigos.
2. **Stale analysis**: se o currículo mudou mas a análise IA não foi refeita, o score
   reflete habilidades antigas. O botão deveria deixar claro que NÃO reanalisa o currículo.
3. **Não há risco de chamar Gemini acidentalmente** nesse fluxo — o path determinístico
   está bem separado.
