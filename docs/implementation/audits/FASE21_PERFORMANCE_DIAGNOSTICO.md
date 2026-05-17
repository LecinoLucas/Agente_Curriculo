# Fase 21 - Diagnostico de Performance

Data: 2026-05-14

## Escopo

- Criado script customizado Python em `backend/scripts/perf_phase21.py`.
- Sem ferramenta externa pesada.
- Sem migration.
- Sem refactor de ranking, scoring, pipeline ou contratos de API.
- Sem Gemini, Protheus, dados reais ou documentos reais.
- Banco isolado em memoria (`sqlite+aiosqlite:///:memory:`), com cleanup natural ao encerrar o processo.

## Estrutura backend

- Stack: FastAPI, SQLAlchemy async, Alembic, PostgreSQL em runtime real, SQLite isolado nos testes/perf.
- Arquivos em `backend/src` ate profundidade 3: 196.
- Testes em `backend/tests` ate profundidade 3: 459.
- Camadas principais:
  - `interface/api/routers`: rotas HTTP por dominio.
  - `interface/api/schemas`: DTOs Pydantic.
  - `application/services`: orquestracao de regras e fluxos.
  - `infrastructure/repositories`: queries SQLAlchemy.
  - `infrastructure/database/models`: modelos e indices.
  - `domain`: entidades, servicos e excecoes.
- Routers relevantes medidos: `candidates`, `pipeline`, `jobs`, `decision_summary`, `interview_schedules`, `interview_scorecards`, `pre_admission`, `manager`, `communications`.

## Estrutura frontend

- Stack: React, TypeScript, Vite, Vitest, React Router, lucide-react, Recharts.
- Arquivos em `frontend/src` ate profundidade 3: 143.
- Testes/componentes de teste detectados: 74.
- Organizacao principal:
  - `pages`: telas de alto nivel.
  - `services`: clientes HTTP por dominio.
  - `features`: componentes/hooks por contexto funcional.
  - `components`: componentes compartilhados.
  - `shared`: utilitarios, hooks e componentes reutilizaveis.
- Services relevantes ao fluxo medido: `candidatesService`, `pipelineService`, `jobsService`, `decisionSummaryService`, `agendaService`, `behavioralAssessmentService`, `interviewScorecardService`, `preAdmissionService`, `managerService`, `communicationService`.

## Script criado

Comandos:

```bash
cd backend
.venv/bin/python scripts/perf_phase21.py --profile small --repeat 2 --output reports/phase21_perf_small.json
.venv/bin/python scripts/perf_phase21.py --profile medium --repeat 1 --output reports/phase21_perf_medium.json
```

Perfis:

| Perfil | Candidatos | Vagas | Pipelines | Communications | Interviews | Pre-admission/docs |
|---|---:|---:|---:|---:|---:|---:|
| small | 100 | 10 | 500 | 500 | 100 | 50 |
| medium | 1.000 | 50 | 5.000 | 5.000 | 1.000 | 500 |

O script mede latencia por endpoint, status HTTP, tamanho de resposta, contagem aproximada de queries por request, queries repetidas e queries mais lentas via eventos SQLAlchemy.

## Endpoints medidos

- `GET /api/v1/candidates/summaries`
- `GET /api/v1/pipeline/{job_id}`
- `GET /api/v1/jobs/{job_id}/ranking`
- `GET /api/v1/candidates/{candidate_id}/overview`
- `GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary`
- `GET /api/v1/agenda/interviews`
- `GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews`
- `GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment`
- `GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard`
- `GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission`
- `GET /api/v1/pre-admission/{case_id}/documents`
- `GET /api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/summary`
- `GET /api/v1/jobs/{job_id}/candidates/{candidate_id}/communications`

## Resultado - small

Todos os endpoints retornaram HTTP 200.

| Endpoint | p95 ms | Queries max | Resposta max |
|---|---:|---:|---:|
| candidates_summaries | 22.72 | 3 | 66.813 B |
| job_ranking | 20.61 | 8 | 191.312 B |
| candidate_overview | 16.44 | 7 | 4.311 B |
| decision_summary | 15.36 | 12 | 986 B |
| communications_recruiter | 13.94 | 2 | 295.910 B |
| pipeline_board | 13.25 | 3 | 39.834 B |
| behavioral_assessment | 11.75 | 7 | 948 B |
| agenda_interviews | 7.36 | 3 | 96.963 B |

## Resultado - medium

Todos os endpoints retornaram HTTP 200.

| Endpoint | p95 ms | Queries max | Resposta max |
|---|---:|---:|---:|
| pipeline_board | 162.73 | 3 | 393.684 B |
| communications_recruiter | 134.02 | 2 | 2.963.910 B |
| job_ranking | 117.75 | 8 | 1.911.366 B |
| candidates_summaries | 32.12 | 3 | 66.815 B |
| decision_summary | 28.08 | 12 | 986 B |
| agenda_interviews | 22.16 | 3 | 97.093 B |
| behavioral_assessment | 21.98 | 7 | 948 B |
| candidate_overview | 18.97 | 7 | 4.311 B |

Artefatos completos:

- `backend/reports/phase21_perf_small.json`
- `backend/reports/phase21_perf_medium.json`

## Endpoints mais pesados

1. `pipeline_board`: cresce com o numero de candidatos ativos e monta um payload grande de board em uma unica resposta.
2. `communications_recruiter`: poucas queries, mas payload muito grande; 5.000 mensagens geraram ~2,96 MB.
3. `job_ranking`: payload grande e 8 queries; ranking de 1.000 candidatos gerou ~1,91 MB.
4. `candidates_summaries`: tempo moderado, mas query principal tem varias subqueries correlacionadas.
5. `decision_summary`: payload pequeno, mas 12 queries para um unico candidato/vaga.

## Queries suspeitas

- `pipeline_board`: query principal em `candidate_job_pipeline` + `candidates` + scores/analyses foi a mais cara no medium (~113 ms em SQLite isolado).
- `communications_recruiter`: `SELECT candidate_communications ... WHERE candidate_id/job_id ORDER BY created_at` retornou volume alto sem limite/paginacao.
- `job_ranking`: leitura de persisted scores com joins em scores, candidates, jobs, pipeline e latest match.
- `candidates_summaries`: query principal usa varias subqueries correlacionadas por candidato para resumes, jobs, pipeline e score ativo.
- `agenda_interviews`: listagem paginada usa count + join em candidates/jobs e ordenacao por `scheduled_start`.
- `decision_summary`: multiplas consultas pequenas e sequenciais para job, pipeline, analysis, score, behavioral, scorecard e interview.

## Possiveis N+1

- Nao apareceu N+1 classico proporcional ao numero de linhas nos endpoints de lista medidos.
- `decision_summary` tem fan-out fixo alto: 12 queries para uma unica tela.
- `behavioral_assessment` repetiu uma consulta de assignment no mesmo request e fechou com 7 queries.
- `manager_candidate_summary` fechou com 6 queries para um resumo simples; vale consolidar se a tela for muito usada.
- `candidate_overview` fechou com 7 queries; aceitavel por ora, mas pode virar gargalo se a tela virar drawer aberto em massa.

## Indices existentes relevantes

- `candidate_job_pipeline`: `idx_candidate_job_pipeline_job_active`, `idx_candidate_job_pipeline_job_stage`, `idx_candidate_job_pipeline_job_relationship_active`, `idx_candidate_job_pipeline_analysis`, `uq_candidate_job_pipeline_one_active_per_candidate`, `uq_candidate_job_pipeline_row_id`.
- `candidate_job_scores`: `idx_candidate_job_scores_job_id`, `idx_candidate_job_scores_candidate_job`, `idx_candidate_job_scores_freshness`, `idx_candidate_job_scores_input_hash`, `idx_candidate_job_scores_job_signature`, `idx_candidate_job_scores_job_updated`.
- `candidate_job_match`: `idx_candidate_job_match_candidate_job`, `idx_candidate_job_match_job_created`, `idx_candidate_job_match_pipeline`, `idx_candidate_job_match_freshness`, `idx_candidate_job_match_job_signature`.
- `candidate_communications`: `idx_comm_candidate_created`, `idx_comm_candidate_job`, `idx_comm_dedup`.
- `interview_schedules`: indices por `candidate_id`, `job_id`, `status`, `scheduled_start`, `pipeline_id`, calendario/sync.
- `interview_scorecards`: `idx_interview_scorecards_job_candidate`, `idx_interview_scorecards_status`, unicos por candidato/vaga com e sem entrevista.
- `pre_admission_cases`: `idx_pre_admission_cases_job_candidate`, `idx_pre_admission_cases_status`, `uq_pre_admission_active_candidate_job`.
- `pre_admission_documents`: indices por `case_id`, `checklist_item_id`, `candidate_id`.
- `behavioral_assessment_assignments`: `idx_behavioral_assignments_candidate_status`, `idx_behavioral_assignments_job_candidate`.
- `behavioral_assessment_ai_evaluations`: `idx_behavioral_ai_eval_candidate_status`, `idx_behavioral_ai_eval_job_candidate`.

## Indices possivelmente faltantes

Lista automatica completa no JSON detectou 76 FKs sem indice como primeira coluna. Os mais relevantes para os endpoints da Fase 21:

- `candidate_communications(candidate_id, job_id, created_at)` ou revisar `idx_comm_candidate_job` para cobrir ordenacao por `created_at`.
- `candidate_communications(candidate_id, audience, created_at)` para portal do candidato.
- `interview_scorecards(interview_id)` e `interview_scorecards(evaluator_id)`.
- `behavioral_assessment_assignments(template_id)`.
- `behavioral_assessment_ai_evaluations(assignment_id)` e `behavioral_assessment_ai_evaluations(template_id)`.
- `analyses(resume_version_id)`, `analyses(job_id)`, `analyses(requested_by)`.
- `candidate_job_scores(version_id)` e `candidate_job_scores(source_analysis_id)`.
- `candidate_job_match(resume_version_id)`, `candidate_job_match(candidate_profile_analysis_id)`, `candidate_job_match(job_profile_analysis_id)`.
- `candidate_job_pipeline(resume_version_id)` e `candidate_job_pipeline(last_moved_by)`.
- `candidate_job_hiring_decisions(pipeline_id)`, `decided_by`, `based_on_scorecard_id`, `based_on_behavioral_assignment_id`, `based_on_behavioral_ai_evaluation_id`.
- `pre_admission_cases(hiring_decision_id)`, `pre_admission_cases(created_by)`.
- `pre_admission_events(actor_id)`, `pre_admission_documents(reviewed_by)`, `pre_admission_documents(deleted_by)`.
- `jobs(behavioral_template_id)`, `jobs(created_by)`, `jobs(archived_by)`.

Antes de migration, confirmar em PostgreSQL com `EXPLAIN (ANALYZE, BUFFERS)` nos endpoints P1. SQLite indica gargalos obvios, mas nao substitui plano real do Postgres.

## Recomendacoes P0/P1/P2/P3

### P0

- Nenhum P0 de correcao imediata encontrado neste diagnostico. Todos os endpoints prioritarios medidos responderam 200 com dados fake controlados.

### P1

- Adicionar diagnostico Postgres real controlado para `pipeline_board`, `communications_recruiter` e `job_ranking`.
- Avaliar paginacao/limite em communications; hoje o endpoint pode devolver milhares de mensagens em uma resposta.
- Avaliar paginacao ou payload resumido para ranking e board quando houver centenas/milhares de candidatos.
- Propor migration de indices somente apos confirmar planos reais: principalmente communications por `candidate/job/created_at` e `candidate/audience/created_at`.

### P2

- Consolidar queries fixas de `decision_summary` em uma estrategia de leitura agregada ou repositorio dedicado com menos round-trips.
- Revisar `behavioral_assessment` para eliminar consulta duplicada de assignment.
- Revisar `manager_candidate_summary`; hoje faz varias consultas pequenas para um resumo simples.
- Revisar `candidates_summaries`; subqueries correlacionadas podem ficar caras em Postgres com crescimento real.

### P3

- Frontend: considerar virtualizacao ou carregamento incremental para board/ranking se o produto exigir listas grandes em uma unica tela.
- Frontend: revisar cache local/invalidation em drawers de candidato para evitar reabrir `overview`, `decision-summary` e `scorecard` em cascata.
- Observabilidade: manter script como smoke de performance e adicionar thresholds nao bloqueantes em CI apenas depois de estabilizar baseline em Postgres.

## Plano por fases

1. Fase 21A: rodar o mesmo script em `small` e `medium` sempre que mexer nos dominios medidos.
2. Fase 21B: executar amostra Postgres local/homolog com `EXPLAIN (ANALYZE, BUFFERS)` para os 3 endpoints mais pesados.
3. Fase 21C: apresentar migrations de indices P1, sem alterar API.
4. Fase 21D: atacar payload/paginacao de communications, ranking e board com proposta de contrato antes de implementar.
5. Fase 21E: reduzir fan-out fixo de `decision-summary`, `behavioral-assessment` e `manager-summary`.
6. Fase 21F: revisar frontend para lazy loading/virtualizacao apenas se os endpoints seguirem retornando payloads grandes.

## Status

Fase 21 conclui com diagnostico e plano. Nenhuma regra de negocio foi alterada e nenhuma integracao externa foi chamada.
