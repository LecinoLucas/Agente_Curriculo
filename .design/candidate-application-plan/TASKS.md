# Build Tasks: OP-5 CandidateApplication + Preferencias

Generated from: `.design/candidate-application-plan/DESIGN_BRIEF.md`
Date: 2026-06-01

## Foundation

- [ ] **Modelar migration aditiva de aplicacoes**: Criar `candidate_applications` e `candidate_location_preferences` com FKs, checks, indices, timestamps e soft delete, sem alterar tabelas existentes. _Creates: backend migration only._
- [ ] **Adicionar models SQLAlchemy**: Criar `CandidateApplicationModel` e `CandidateLocationPreferenceModel`, registrar em `models/__init__.py` e manter imports do Alembic funcionando. _Creates: backend models._
- [ ] **Criar schemas Pydantic internos**: Definir requests/responses para create, update, detail e listagem de aplicacoes, sem expor campos internos ou CPF. _Creates: API schemas._

## Core Backend

- [ ] **Implementar repository de aplicacoes**: Criar consultas por id, listagem paginada, busca por idempotencia e busca de aplicacao ativa equivalente. _Creates: repository._
- [ ] **Implementar service de validacao operacional**: Validar candidato, vaga, localidade, filial, resume version, consentimento, idempotencia e coerencia de preferencias. _Creates: service logic._
- [ ] **Implementar transicoes de estado**: Aplicar `started`, `qualified`, `submitted`, `linked_to_pipeline`, `abandoned`, `cancelled` conforme `STATE_MODEL.md`. _Creates: service state machine._
- [ ] **Implementar endpoints internos**: Adicionar `POST /api/v1/applications`, `GET /api/v1/applications/{id}`, `GET /api/v1/applications`, `PATCH /api/v1/applications/{id}` com permissao `RecruiterOrAdmin`. _Creates: router._

## Public Web Preparation

- [ ] **Planejar endpoint publico novo sem substituir rota legada**: Implementar `POST /api/v1/public/applications` em fase propria, mantendo `/public/candidates/apply` intacto. _Creates: public route, depends on internal service._
- [ ] **Implementar preferencias publicas com token futuro**: Adicionar `PATCH /api/v1/public/applications/{id}/preferences` somente quando houver token/OTP/sessao apropriada. _Creates: public route, depends on auth decision._
- [ ] **Definir response publico seguro**: Garantir que CPF, hash, idempotency key, metadata e diagnosticos internos nao vazem ao candidato. _Reuses: public schema conventions._

## Pipeline Integration Later

- [ ] **Criar endpoint explicito de link ao pipeline**: Em fase posterior, implementar `POST /api/v1/applications/{id}/link-to-pipeline` com checagem de pipeline ativo e decisao humana. _Creates: pipeline bridge, depends on OP-5 base._
- [ ] **Adicionar `application_id` nullable no pipeline**: Em migration separada, vincular `candidate_job_pipeline` a aplicacao sem alterar a PK composta existente. _Modifies: pipeline table, future phase._

## Tests

- [ ] **Cobrir criacao de aplicacao sem vaga**: Deve criar `CandidateApplication` sem criar pipeline. _Creates: integration tests._
- [ ] **Cobrir qualquer filial da localidade**: `accepts_any_unit_in_location=true`, localidade preenchida e filial nula deve ser valido. _Creates: integration tests._
- [ ] **Cobrir filial incoerente com localidade**: Filial fora da localidade declarada deve retornar erro. _Creates: integration tests._
- [ ] **Cobrir idempotencia**: Mesmo idempotency key e payload retorna a mesma aplicacao; payload diferente retorna conflito. _Creates: service/API tests._
- [ ] **Cobrir duplicidade ativa**: Aplicacao equivalente em estado ativo nao deve duplicar indevidamente. _Creates: service/API tests._
- [ ] **Cobrir regressao publica atual**: `POST /api/v1/public/candidates/apply` deve continuar criando candidato/curriculo/pipeline como hoje ate migracao explicita. _Reuses: existing public application tests._
- [ ] **Cobrir constraint de pipeline ativo**: Vinculo futuro ao pipeline deve respeitar uma ativa por candidato. _Reuses: candidate_job_pipeline invariant tests._

## Review

- [ ] **Regression-risk review**: Rodar suites focadas de public application, candidate, pipeline, job multiunit e operational master antes de merge. _Reuses: existing tests._
- [ ] **Git hygiene**: Confirmar que a implementacao nao altera frontend, bot, WhatsApp, matching/IA ou pre-admissao. _Process guard._
