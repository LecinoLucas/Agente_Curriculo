# PERFORMANCE-AUDIT-2 - Findings

## P1 - Pipeline recarrega board completo apos move

Evidencia:

- `frontend/src/pages/PipelinePage.tsx:621` chama `refreshBoard()` apos mutacao de etapa.
- `frontend/src/pages/PipelinePage.tsx:639` chama `syncAfterStageMutation()` depois de `moveCandidateStage`.
- `frontend/src/features/pipeline/PipelineContext.tsx:1062` ja faz atualizacao otimista no board.
- `frontend/src/features/pipeline/PipelineContext.tsx:1081` chama API de move e invalida ranking.

Impacto:

Mover um candidato custa mais do que o necessario: a UI atualiza localmente e depois força novo GET do board inteiro. Em vagas grandes, isso amplifica latencia e carga SQL.

## P1 - Drawer duplica reload de candidato e Pipeline

Evidencia:

- `frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx:167` executa `reload()` e `onPipelineChanged?.()`.
- `frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx:220` chama esse sync apos move bem-sucedido.

Impacto:

Uma acao no drawer pode disparar reload do overview e reload do board/pai. Isso concorre com cache/deduplicacao do `PipelineContext` e pode gerar trafego redundante.

## P1 - RAG similarity search e O(total_embeddings)

Evidencia:

- `backend/src/infrastructure/repositories/postgres_vector_store.py:101` consulta todos os embeddings ativos elegiveis.
- `backend/src/infrastructure/repositories/postgres_vector_store.py:137` carrega todos os rows.
- `backend/src/infrastructure/repositories/postgres_vector_store.py:143` calcula similaridade em Python.
- `backend/src/infrastructure/repositories/postgres_vector_store.py:157` aplica `query.limit` so depois de ordenar em memoria.

Impacto:

Quanto maior a base de conhecimento, maior CPU/memoria/latencia por pergunta. O limite de chunks nao reduz o custo de recuperacao.

## P1 - Pagina de Vagas faz fan-out de ranking por vaga

Evidencia:

- `frontend/src/features/jobs/hooks/useJobsList.ts:100` busca `listPipelineJobs(true)`.
- `frontend/src/features/jobs/hooks/useJobsList.ts:101` chama `listJobCandidates` para cada vaga da pagina.
- `frontend/src/services/jobsService.ts:215` implementa `listJobCandidates` buscando `getJobRanking(jobId)` e paginando localmente.

Impacto:

Uma pagina com 20 vagas pode disparar 20 rankings. Cada ranking faz fetch paginado, count e stats no backend. O custo cresce com a quantidade de vagas visiveis.

## P2 - Board renderiza todos os cards retornados

Evidencia:

- `backend/src/core/settings.py:153` define `PIPELINE_BOARD_MAX_ROWS = 500`.
- `frontend/src/components/kanban/KanbanColumn.tsx:194` usa `column.candidates.map`.

Impacto:

O limite protege o backend, mas o DOM ainda pode receber centenas de cards em uma unica tela. Sem virtualizacao ou "load more", o custo de renderizacao cresce linearmente.

## P2 - Pipeline jobs nao tem paginacao dedicada

Evidencia:

- `backend/src/interface/api/routers/pipeline.py:205` retorna `list[PipelineJobSummaryResponse]`.
- `backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py:1070` lista todas as vagas publicadas ou todas com `include_closed`.
- `backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py:1094` agrega stage counts para todos os jobs ativos.

Impacto:

Funciona com poucas vagas, mas a tela de Pipeline e outras telas consomem resumo global. Cresce com volume de vagas historicas e pipelines ativos.

## P2 - Pre-admissao recarrega secoes inteiras apos acoes

Evidencia:

- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:214` carrega `overview`, `documents` e `events`.
- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:254` recarrega overview+documents em mudanca de checklist.
- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:368` recarrega tres secoes em upload.

Impacto:

Acoes pequenas atualizam cargas agregadas inteiras. O risco aparece em checklists grandes, muitos documentos ou eventos extensos.

## P2 - Candidate overview agrega varias consultas sequenciais

Evidencia:

- `backend/src/application/services/candidate_service.py:374` busca candidato, resumes, top matches e pipeline entries.
- `backend/src/application/services/candidate_service.py:405` pode buscar analysis summary atual.
- `backend/src/application/services/candidate_service.py:423` pode buscar score atual.

Impacto:

Abrir drawer/perfil e sincronizar apos move pode custar varias round-trips ao banco por candidato. O problema e mais perceptivel quando combinado com reloads do Pipeline.

## P3 - Envio real Protheus e bloqueante quando habilitado

Evidencia:

- `backend/src/application/services/protheus_real_adapter.py:146` cria cliente HTTP.
- `backend/src/application/services/protheus_real_adapter.py:163` faz POST para Protheus na requisicao.
- `backend/src/application/services/protheus_real_adapter.py:71` timeout padrao de 30 segundos.

Impacto:

Nao e gargalo no fluxo padrao auditado, mas em homologacao/uso real pode prender worker HTTP durante chamada externa.

## P3 - Warnings de testes frontend indicam updates assincronos fora de act

Evidencia:

- `npm run test -- --run PipelinePage --reporter=verbose` passou, mas emitiu warnings de `act(...)` em `PipelinePage` e `Tooltip`.

Impacto:

Nao e problema de runtime por si so, mas reduz confiabilidade dos testes para detectar regressao de renders/reloads.
