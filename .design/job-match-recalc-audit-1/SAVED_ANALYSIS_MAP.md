# JOB-MATCH-RECALC-AUDIT-1 — Mapa de Dados Salvos

## Dados persistidos que permitem recalcular matching sem Gemini

### 1. AnalysisResultModel (`analysis_results`)

Tabela com resultado completo da análise IA. É a fonte de verdade de skills extraídas.

| Campo | Tipo | Usado no recalculate? | Como |
|---|---|---|---|
| `extracted_data` | JSONB | ✅ | `_build_candidate_skill_context()` extrai skills com confiança/contexto |
| `keywords` | array | ✅ (fallback) | Se `extracted_data` não tem skills, usa keywords como fallback |
| `total_experience_years` | float | ✅ | usado via `CandidateProfileAnalysisModel.experience_years` |
| `highest_education_level` | str | ✅ | usado via `CandidateProfileAnalysisModel.education_level` |
| `seniority_level` | str | ✅ | usado via `CandidateProfileAnalysisModel.seniority_level` |
| `analysis_id` | FK | ✅ | liga ao `AnalysisModel` (status, candidate, resume_version) |

### 2. CandidateProfileAnalysisModel (`candidate_profile_analysis`)

Perfil do candidato independente de vaga — preenchido a partir do `AnalysisResultModel`.

| Campo | Tipo | Usado no recalculate? | Como |
|---|---|---|---|
| `seniority_level` | str | ✅ | `_compute_breakdown` — seniority_score |
| `experience_years` | decimal | ✅ | `_compute_breakdown` — experience_score |
| `education_level` | str | ✅ | `_compute_breakdown` — education_score |
| `skills_json` | JSONB | ✅ | complemento de `extracted_data` para candidate_skills |
| `strengths_json` | JSONB | ✅ | exibição no RankingCard |
| `weaknesses_json` | JSONB | ✅ | exibição no RankingCard |
| `candidate_id` | FK | - | chave, não candidato-específico |
| `resume_version_id` | FK | - | garante que profile corresponde à versão do currículo |

### 3. ResumeVersionModel (`resume_versions`)

| Campo | Tipo | Usado no recalculate? | Como |
|---|---|---|---|
| `extracted_text` | text | ✅ (fallback) | `_extract_resume_text_skill_names()` — extrai skills do texto bruto se `extracted_data` não tem suficientes |

### 4. JobModel (`jobs`)

| Campo | Tipo | Usado no recalculate? | Como |
|---|---|---|---|
| `job_profile_json` | JSONB | ✅ | `_get_or_create_job_profile_analysis_no_llm()` monta `JobProfileAnalysisModel` |
| `job_profile_hash` | str | ✅ | armazenado em `CandidateJobMatchModel.job_signature_hash` para detectar stale |
| `minimum_education_level` | str | ✅ | comparado com `CandidateProfileAnalysisModel.education_level` |
| `minimum_years_experience` | decimal | ✅ | comparado com `CandidateProfileAnalysisModel.experience_years` |
| `seniority_level` | str | ✅ | comparado com candidato |

### 5. JobRequiredSkillModel (`job_required_skills`)

| Campo | Tipo | Usado no recalculate? | Como |
|---|---|---|---|
| `skill_id` → `SkillModel.name` | FK/str | ✅ | base do matching de skills por nome normalizado |
| `priority_level` | str | ✅ | classifica skill como prioritária/complementar/eliminatória |
| `minimum_level` | str | ✅ | nível mínimo esperado |
| `minimum_years` | decimal | ✅ | anos mínimos de experiência com a skill |
| `weight` | decimal | ✅ | peso no cálculo do score |
| `is_eliminatory` | bool | ✅ | cap de score se ausente |

### 6. ScoreModelVersionModel (`score_model_versions`)

| Campo | Tipo | Usado no recalculate? | Como |
|---|---|---|---|
| `weights` | JSONB | ✅ | pesos dos fatores (priority_weight, experience_weight, etc.) |
| `thresholds` | JSONB | ✅ | limite "approved" e "review" |
| `version` | str | ✅ | gravado no score para auditoria |
| `is_active` | bool | ✅ | `load_active_version()` busca versão ativa |

---

## Dados NÃO salvos (mas não necessários)

| Dado | Por que não é necessário |
|---|---|
| Prompt enviado ao Gemini | O output já está em `extracted_data` |
| Resposta bruta do Gemini | `raw_llm_response` existe mas é ignorado no recálculo |
| Embedding/vetor de skills | O sistema usa matching por nome normalizado, não similaridade semântica |
| Score anterior | É recalculado do zero com `compute_and_persist()` |

---

## Cadeia de dados para um recálculo completo

```
JobModel.job_profile_json
    └── _get_or_create_job_profile_analysis_no_llm()
            └── JobProfileAnalysisModel (ativo, hash=job_profile_hash)

CandidateJobPipelineModel (status=active, is_terminal=False)
    └── resume_version_id
            └── AnalysisModel (latest completed, job_id=job_id)
                    └── AnalysisResultModel
                            ├── extracted_data → candidate_skill_context + candidate_skill_names
                            ├── keywords → fallback de skills
                            └── CandidateProfileAnalysisModel
                                    ├── seniority_level
                                    ├── experience_years
                                    └── education_level

JobRequiredSkillModel (job_id=job_id, deleted_at=None)
    └── SkillModel.name → normalized_skill_names

ScoreModelVersionModel (is_active=True)
    └── weights, thresholds

→ _compute_skill_scores() → AnalysisMatchStore.persist_candidate_job_match()
    → CandidateJobMatchModel (freshness_status="fresh", job_signature_hash=hash)

→ CandidateRankingService.compute_and_persist()
    → fetch_match_rows() (JOIN: CandidateJobMatch + CandidateProfile + AnalysisResult)
    → _build_score_payload() → ScoreModelVersionModel weights
    → _score_store.persist_score()
    → CandidateJobScoreModel (freshness_status="fresh")
```

Nenhuma chamada ao Gemini nesse path.
