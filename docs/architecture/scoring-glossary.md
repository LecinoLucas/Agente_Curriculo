# Scoring Glossary

## Objetivo

Congelar a linguagem oficial do ATS para score, match, ranking e pipeline.

Regra principal:

- Cada conceito tem um nome.
- Cada pergunta tem uma fonte de verdade.
- Cada score mede uma coisa só.
- Ranking nao e nome de score.

## Linguagem Oficial

### UI

- `Perfil Geral IA`
- `Aderencia a Vaga`
- `Status na Vaga`

### Backend

- `candidate_profile_analysis`
- `job_profile_analysis`
- `candidate_job_match`
- `candidate_job_scores`
- `candidate_job_pipeline`
- `candidate_job_score_snapshots`
- `candidate_job_score_factors`

## Definicoes

### Perfil Geral IA

- Pergunta: quem e o candidato do ponto de vista analitico?
- Fonte de verdade: `candidate_profile_analysis`
- Nao e: score da vaga, ranking, pipeline

### Aderencia a Vaga

- Pergunta: qual e o score oficial deste candidato para esta vaga?
- Fonte de verdade: `candidate_job_scores.final_score`
- Nome oficial de dominio e API: `job_fit_score`
- Nao e: ranking, match explicativo, pipeline

### Status na Vaga

- Pergunta: qual e o estado operacional deste candidato nesta vaga?
- Fonte de verdade: `candidate_job_pipeline.relationship_status`
- Apoio operacional: `candidate_job_pipeline.pipeline_stage`
- Nao e: score, ranking, explainability

### Candidate Job Match

- Pergunta: por que o candidato adere ou nao adere a vaga?
- Fonte de verdade: `candidate_job_match`
- Papel: evidencias, gaps, eligibility, contexto analitico
- Nao e: contrato publico do score oficial

### Ranking

- Pergunta: qual e a ordenacao dos candidatos da vaga?
- Fonte de verdade: ordenacao por `job_fit_score`
- Nao e: nome de score

### Freshness

- Match freshness: `match_freshness_status`
- Ranking freshness: `ranking_freshness_status`
- Nao usar mais `freshness_status` sem escopo em contrato publico

### Explainability

- Resumo textual derivado: `ranking_summary_text`
- Tags resumidas derivadas: `reason_tags`
- Fatores canonicos: `score_factors`
- Historico: `score_snapshots`

## Nomes Banidos em Contrato Publico

Nao introduzir novos usos publicos de:

- `overall_score` quando significar score da vaga
- `analysis_score`
- `match_score` como score oficial
- `final_score`
- `ranking_score`
- `reason_codes`
- `explanation_text`
- `freshness_status`

## Auditoria de Legado Interno

| Nome legado | Classificacao atual | Destino |
| --- | --- | --- |
| `candidate_job_scores.final_score` | coluna interna ainda necessaria | manter apenas na persistencia e mapear para `job_fit_score` |
| `candidate_job_scores.reason_codes` | coluna interna ainda necessaria | manter apenas na persistencia e mapear para `reason_tags` |
| `candidate_job_scores.explanation_text` | coluna interna ainda necessaria | manter apenas na persistencia e mapear para `ranking_summary_text` |
| `candidate_job_scores.freshness_status` | coluna interna ainda necessaria | manter apenas na persistencia e mapear para `ranking_freshness_status` |
| `candidate_job_match.freshness_status` | coluna interna ainda necessaria | manter apenas no match e expor como `match_freshness_status` quando houver contrato publico |
| `candidate_job_pipeline.match_score` | uso morto legado | remover e nao reintroduzir |
| `match_score` como score oficial | uso publico proibido | remover |
| `ranking_score` | uso publico proibido | remover |
| `analysis_score` | uso publico proibido | remover |
| `overall_score` para score da vaga | uso publico proibido | remover |
| fallback `final_score -> job_fit_score` no frontend | uso morto para remover | remover |
| fallback `explanation_text -> ranking_summary_text` no frontend | uso morto para remover | remover |
| fallback `reason_codes -> reason_tags` no frontend | uso morto para remover | remover |
| fallback `freshness_status -> ranking_freshness_status` no frontend | uso morto para remover | remover |

## Mapeamento Oficial

| Pergunta | Fonte oficial |
| --- | --- |
| Quem e o candidato? | `candidate_profile_analysis` |
| Qual o perfil estruturado da vaga? | `job_profile_analysis` |
| Ele combina com a vaga? | `candidate_job_match` |
| Qual o score oficial desta vaga? | `candidate_job_scores` -> `job_fit_score` |
| Qual a ordem no ranking? | ordenacao por `job_fit_score` |
| Qual o estado operacional na vaga? | `candidate_job_pipeline.relationship_status` |
| Em qual etapa ele esta? | `candidate_job_pipeline.pipeline_stage` |
| Por que recebeu esse score? | `candidate_job_score_factors` |
| O score esta atualizado? | `ranking_freshness_status` |
| O match esta atualizado? | `match_freshness_status` |

## Fluxo Canonico

`Curriculo`
-> `CandidateProfileAnalysis`
-> `JobProfileAnalysis`
-> `CandidateJobMatch`
-> `CandidateJobScores.job_fit_score`
-> `CandidateJobScoreSnapshots`
-> `CandidateJobScoreFactors`
-> `UI`

Separacao obrigatoria:

- `candidate_job_pipeline` = estado operacional
- pipeline nao calcula score
- pipeline nao define ranking
- pipeline nao e fonte de `job_fit_score`
