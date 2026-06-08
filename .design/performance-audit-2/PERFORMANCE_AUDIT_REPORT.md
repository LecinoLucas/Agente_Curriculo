# PERFORMANCE-AUDIT-2 - Relatorio Geral

Data: 2026-06-07
Escopo: auditoria sem alteracao de codigo funcional.

## Resumo executivo

A aplicacao ja possui algumas protecoes importantes: paginacao em candidatos/vagas/ranking, limite SQL no board do Pipeline, cache/deduplicacao de requests no `PipelineContext` e filas Celery/Redis para cargas de IA. Os gargalos mais relevantes estao em recarregamentos redundantes no frontend, fan-out de chamadas por vaga, busca vetorial RAG ainda linear em Python e payloads/queries enriquecidos demais para telas que precisam de resumo.

Prioridades encontradas:

1. Pipeline/Kanban recarrega o board completo apos mover candidato, apesar da atualizacao otimista ja existir.
2. Vagas calcula dados operacionais com `N` chamadas de ranking para a pagina atual e ainda chama resumo global de pipeline.
3. RAG/Knowledge faz similarity search lendo todos os embeddings ativos e rankeando em Python sobre JSONB.
4. Pre-admissao carrega `overview`, `documents` e `events` como chamadas separadas e repete chamadas apos acoes.
5. Candidate overview/drawer monta dados por varias consultas sequenciais e pode duplicar reload quando integrado ao Pipeline.

## Pipeline/Kanban

Evidencias:

- `backend/src/application/services/pipeline_service.py:421` usa `settings.PIPELINE_BOARD_MAX_ROWS`.
- `backend/src/application/services/pipeline_service.py:424` busca `max_rows + 1` para detectar truncamento.
- `backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py:340` monta a query do board com CTEs para behavioral, entrevista e scorecard.
- `backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py:526` ordena por `updated_at desc` e aplica `.limit(limit)`.
- `frontend/src/features/pipeline/PipelineContext.tsx:347` deduplica/cacheia `getJobPipeline`.
- `frontend/src/pages/PipelinePage.tsx:621` chama `refreshBoard()` depois de mutacao de etapa.
- `frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx:167` chama `reload()` e `onPipelineChanged?.()` apos mudanca no drawer.
- `frontend/src/components/kanban/KanbanColumn.tsx:194` renderiza todos os cards da coluna com `column.candidates.map`.

Conclusao:

O backend nao filtra todo o board em memoria sem limite: ha `LIMIT` SQL. O problema principal e operacional: cada move pode custar `PATCH + GET board completo + GET overview` dependendo da superficie. A renderizacao tambem nao tem virtualizacao; com limite atual de 500 candidatos, todos os cards retornados sao montados no DOM.

Risco:

- Alto quando uma vaga tem centenas de candidatos e operadores movem candidatos em sequencia.
- Medio para ranking IA se o painel estiver aberto: `invalidateRanking()` em move limpa cache e pode disparar nova leitura.

## Candidatos

Evidencias:

- `backend/src/interface/api/routers/candidates.py:207` limita `page_size` entre 1 e 100.
- `backend/src/infrastructure/repositories/sqlalchemy_candidate_repository.py:289` usa CTE de pagina para enriquecer apenas candidatos da pagina.
- `backend/src/application/services/candidate_service.py:374` monta `get_overview` chamando candidato, resumes, matches e pipeline entries.
- `frontend/src/services/candidatesService.ts:333` envia `page` e `page_size` para listagem.
- `frontend/src/services/candidatesService.ts:373` busca overview completo por candidato.

Conclusao:

Listagens estao paginadas e a query de summaries foi desenhada para enriquecer somente a pagina. O risco esta no overview individual, que agrega varias fontes e e recarregado apos acoes do Pipeline/drawer.

## Vagas

Evidencias:

- `backend/src/interface/api/routers/jobs.py:785` pagina listagem de vagas.
- `backend/src/infrastructure/repositories/sqlalchemy_job_repository.py:145` faz count, listagem paginada e summary agregado.
- `frontend/src/features/jobs/hooks/useJobsList.ts:100` chama `pipelineService.listPipelineJobs(true)` junto com `Promise.allSettled(jobs.map(...))`.
- `frontend/src/features/jobs/hooks/useJobsList.ts:101` chama `listJobCandidates(job.id, 1, 25)` para cada vaga renderizada.
- `frontend/src/services/jobsService.ts:215` implementa `listJobCandidates` chamando `getJobRanking(jobId)` e fatiando localmente.
- `backend/src/interface/api/routers/jobs.py:1485` ranking e paginado no backend com `page_size` maximo 100.

Conclusao:

A pagina de Vagas e o maior fan-out frontend encontrado. Para 20 vagas na pagina, pode disparar 1 chamada global de pipeline + 20 chamadas de ranking, alem da listagem principal. O helper de candidatos da vaga aceita `page_size`, mas nao repassa para `getJobRanking`, entao a paginacao local pode divergir do backend.

## Job AI Draft

Referencia:

- Auditoria especifica existente em `.design/job-ai-performance-audit-1/`.
- Rate limits existem em `backend/src/interface/api/rate_limiting.py`.
- Endpoints de OCR/generate usam dependencias de rate limit em `backend/src/interface/api/routers/jobs.py`.

Conclusao:

Esta auditoria nao reabriu toda a analise de token/custo do Job AI Draft. Para performance geral, o risco continua em latencia/custo de IA e OCR, ja coberto por fase dedicada.

## Pre-admissao

Evidencias:

- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:152` carrega overview.
- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:172` carrega documentos.
- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:192` carrega eventos.
- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:214` faz as tres chamadas em paralelo na abertura.
- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:254` e `:279` recarregam overview+documents apos acoes.
- `backend/src/infrastructure/repositories/sqlalchemy_pre_admission_repository.py:32` carrega checklist e documentos com `selectinload` em contexto completo.
- `backend/src/infrastructure/repositories/sqlalchemy_pre_admission_repository.py:38` overview carrega checklist.

Conclusao:

O desenho e seguro para casos pequenos. Em casos com muitos itens/documentos/eventos, a tela gera multiplas chamadas e recarrega secoes inteiras apos acoes locais.

## Protheus/ERP

Evidencias:

- `backend/src/application/services/erp_integration_service.py:148` restringe envio real a homologacao controlada.
- `backend/src/application/services/protheus_real_adapter.py:146` cria `httpx.AsyncClient` por envio e usa timeout.
- `backend/src/application/services/protheus_real_adapter.py:163` faz POST sincrono dentro da requisicao.

Conclusao:

Nao ha acionamento real automatico observado no fluxo auditado. Quando habilitado, o envio real e bloqueante para a requisicao HTTP e deve ser tratado como operacao externa lenta.

## RAG/Base de Conhecimento

Evidencias:

- `backend/src/infrastructure/repositories/postgres_vector_store.py:101` executa query de embeddings/chunks/documentos sem limite inicial.
- `backend/src/infrastructure/repositories/postgres_vector_store.py:137` materializa todos os rows.
- `backend/src/infrastructure/repositories/postgres_vector_store.py:143` calcula cosine similarity em Python.
- `backend/src/infrastructure/repositories/postgres_vector_store.py:157` ordena em memoria e so depois aplica `query.limit`.
- `backend/src/core/settings.py:121` limita sintese a 5 chunks por padrao, mas esse limite acontece depois da recuperacao.

Conclusao:

Este e o gargalo backend mais claro fora do Pipeline. A recuperacao vetorial cresce linearmente com todos os embeddings ativos e usa CPU/memoria da aplicacao, mesmo quando o usuario pediu apenas poucos chunks.

## Assistente IA e Portal do candidato

Evidencias:

- `backend/src/interface/api/routers/ai_assistant.py:84` monta varios services a cada chamada read-only.
- `backend/src/application/services/assistant_content_provider.py:119` informa que cada prompt pode fazer duas queries leves.
- `backend/src/application/services/conversation_service.py:248` pode chamar canonicalizacao de intent por IA para texto livre em estados elegiveis.
- `backend/src/infrastructure/queue/celery_app.py:23` configura filas separadas para analysis, matching, document_ai, extraction e behavioral_ai.

Conclusao:

O assistente administrativo read-only e deterministico, mas instancia varios services por request. O portal do candidato evita IA para tokens de controle, mas texto livre em estados elegiveis pode adicionar latencia/custo. Celery/Redis estao presentes para cargas pesadas, com `prefetch_multiplier=1`, limites de tempo e filas separadas.

## Admin/Governanca IA

Evidencias:

- `backend/src/application/services/admin_assistant_service.py:185` usa count por subquery e paginacao.
- `frontend/src/pages/SystemHealthPage.tsx:265` carrega abas sob demanda.
- `backend/src/interface/api/routers/observability.py:26` permite limite ate 5000 traces.

Conclusao:

Admin usa paginacao em pontos principais. O risco mais relevante e tela de observabilidade/health com limites altos e agregacoes sob demanda, nao o fluxo operacional diario.

## Observabilidade existente

Ja existem logs de timing:

- `pipeline.board.query_timing` em `backend/src/application/services/pipeline_service.py:433`.
- `pipeline.ranking.query_timing` em `backend/src/application/services/candidate_ranking_service.py:376`.
- `candidate_summaries.query_timing` em `backend/src/infrastructure/repositories/sqlalchemy_candidate_repository.py:611`.

Lacunas:

- Falta budget/alerta por endpoint no frontend.
- Falta teste automatizado de numero de chamadas para telas criticas como Vagas e Pre-admissao.
- Falta medicao local com massa realista de 500+ candidatos por vaga e 10k+ embeddings.
