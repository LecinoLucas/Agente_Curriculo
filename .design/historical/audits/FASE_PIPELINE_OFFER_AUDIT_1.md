# FASE PIPELINE-OFFER-AUDIT-1

## Objetivo

Auditar ponta a ponta o fluxo de candidato ate a etapa `offer`, sem alterar codigo, para identificar onde a passagem por Oferta quebra ou e mascarada.

## Resumo executivo

Conclusao principal: a etapa `offer` existe e a transicao `final -> offer` esta implementada e coberta no backend. A coluna Oferta tambem existe e e renderizada no board principal. O ponto de quebra mais provavel esta no frontend operacional secundario: o `CandidatePreviewDrawer`, usado a partir da Pipeline, pula `final -> offer` e tenta mover direto `final -> hired`.

Conclusao secundaria: existe outro descompasso real no fluxo `hired -> pre_admission`. A movimentacao acontece, mas a autocriacao do caso de pre-admissao pode falhar silenciosamente quando nao ha checklist template padrao ativo, retornando `required_action="open_pre_admission"` com `pre_admission_case_id=null`.

## Resultado por area

### 1. Backend: existencia de `offer`

- `offer` esta definido no schema de pipeline: [backend/src/interface/api/schemas/pipeline_schemas.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/schemas/pipeline_schemas.py:17)
- `offer` esta presente na ordem oficial do pipeline: [backend/src/application/services/pipeline_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_service.py:54)
- `offer` esta presente em `STAGE_CONFIG`: [backend/src/application/services/pipeline_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_service.py:252)
- O board backend sempre monta coluna para `offer`: [backend/src/application/services/pipeline_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_service.py:417)

Status: ok.

### 2. Backend: permissao de transicao para `offer`

- O gate `final -> offer` existe em `_collect_offer_gates`: [backend/src/application/services/pipeline_gate_evaluator.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_gate_evaluator.py:393)
- A regra exige:
  - avaliacao comportamental, se aplicavel
  - IA comportamental, se aplicavel
  - scorecard submetido, se aplicavel
  - decisao de contratacao submetida com `decision_outcome in ("advance", "hire")`
- A exigencia de decisao antes de Oferta esta explicita em [backend/src/application/services/pipeline_gate_evaluator.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_gate_evaluator.py:503)

Status: ok.

### 3. Backend: candidato entra e permanece em `offer`

- O move usa `update_entry_stage_if_current(...)` e grava o `new_stage` exatamente como solicitado: [backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py:617)
- O board lista candidatos por `pipeline_stage` sem remapeamento de `offer`: [backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py:541)

Status: ok.

### 4. Frontend: coluna Oferta no board

- A macrocoluna Oferta existe e mapeia apenas `offer`: [frontend/src/features/pipeline/utils/pipelineKanbanColumns.ts](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/pipeline/utils/pipelineKanbanColumns.ts:57)
- O `PipelinePage` agrupa e renderiza essa macrocoluna: [frontend/src/pages/PipelinePage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/PipelinePage.tsx:1229)
- O teste do board valida `kanban-column-decisao` como coluna de Oferta: [frontend/src/pages/__tests__/PipelinePage.test.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/__tests__/PipelinePage.test.tsx:546)

Status: ok.

### 5. Frontend: fluxo que pula Oferta

- O `CandidatePreviewDrawer`, usado dentro da Pipeline, define a progressao local assim:
  - `final -> hired`
  - `offer -> hired`
- Evidencia: [frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx:49)
- O botao do drawer usa esse mapeamento local para chamar a API: [frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx:150)
- O CTA realmente dispara o "advance stage" a partir desse `nextStage`: [frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx:392)
- A `PipelinePage` abre esse drawer direto a partir do board: [frontend/src/pages/PipelinePage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/PipelinePage.tsx:1234)

Impacto:

- Se o usuario avancar pelo drawer da Pipeline, o sistema tenta `final -> hired` e nao `final -> offer`.
- Isso explica a percepcao de que o candidato "nunca cai em Oferta", mesmo com backend e board corretos.

Status: falha principal identificada.

### 6. Inconsistencia interna no frontend

- O helper de perfil aponta corretamente `final` para "Avancar para oferta": [frontend/src/features/candidates/utils/profile.ts](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/candidates/utils/profile.ts:454)
- O mesmo helper aponta `offer` para "Mover para Contratado": [frontend/src/features/candidates/utils/profile.ts](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/candidates/utils/profile.ts:456)
- Ou seja, existe uma regra correta no dominio de UI, mas o drawer usa outra tabela local e divergente.

Status: falha de duplicacao de regra.

### 7. Gate final bloqueando indevidamente?

- Nao ha indicio de bloqueio indevido do gate `final -> offer`.
- Os testes especificos de gate para Oferta passaram:
  - `all_offer_gates_satisfied`
  - `no_hiring_decision`
  - `decision_outcome=advance`
  - gates comportamentais/scorecard

Comando executado:

```bash
APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai JWT_SECRET_KEY=test-jwt \
backend/.venv/bin/python -m pytest backend/tests/integration/test_pipeline_stage_gates.py -k 'offer or pre_admission or hired'
```

Resultado: `10 passed, 22 deselected`

Status: ok para `final -> offer`.

### 8. Redirecionamento indevido para `hired` ou `pre_admission`

- Nao encontrei redirecionamento backend automatico de `offer` para `hired`.
- O move para `hired` so ocorre quando solicitado explicitamente.
- O redirecionamento indevido observado esta no frontend do preview drawer, que solicita `hired` cedo demais.

Status: falha localizada no frontend.

### 9. Fluxo `hired -> pre_admission`

- O gate existe e exige decisao `hire`: [backend/src/application/services/pipeline_gate_evaluator.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_gate_evaluator.py:596)
- A resposta do move tenta autocriar caso de pre-admissao: [backend/src/application/services/pipeline_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_service.py:756)
- Se a criacao falhar por `ValidationException`, o backend apenas loga e retorna `None`: [backend/src/application/services/pipeline_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_service.py:783)
- A criacao do caso depende de checklist template padrao ativo: [backend/src/application/services/pre_admission_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pre_admission_service.py:153)
- O repositorio busca somente template `is_default=true` e `is_active=true`: [backend/src/infrastructure/repositories/sqlalchemy_pre_admission_repository.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/infrastructure/repositories/sqlalchemy_pre_admission_repository.py:239)

Comando executado:

```bash
APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai JWT_SECRET_KEY=test-jwt \
backend/.venv/bin/python -m pytest backend/tests/integration/test_pipeline_endpoints_integration.py -k 'offer or hired or pre_admission'
```

Resultado: `3 failed, 3 passed, 13 deselected`

Falhas observadas:

- `pre_admission_case_id` esperado como nao-nulo falhou em [backend/tests/integration/test_pipeline_endpoints_integration.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/tests/integration/test_pipeline_endpoints_integration.py:315)
- repeticao do mesmo problema em [backend/tests/integration/test_pipeline_endpoints_integration.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/tests/integration/test_pipeline_endpoints_integration.py:396)
- log emitido pelo backend: `pipeline.pre_admission_case.autocreate_skipped` com motivo "Nenhum checklist padrao ativo foi configurado para a pre-admissao."

Status: falha real, mas posterior a Oferta.

## Cobertura de testes

### Frontend

Executado:

```bash
cd frontend && npm test -- --run \
  src/pages/__tests__/PipelinePage.test.tsx \
  src/features/pipeline/utils/__tests__/pipelineKanbanColumns.test.ts \
  src/features/candidates/components/__tests__/CandidatePreviewDrawer.test.tsx
```

Resultado:

- `pipelineKanbanColumns.test.ts`: passou
- `CandidatePreviewDrawer.test.tsx`: passou
- `PipelinePage.test.tsx`: 1 falha nao relacionada ao fluxo auditado, em breadcrumb

Achados de cobertura:

- Ha cobertura para renderizacao da coluna Oferta no board.
- Nao ha cobertura especifica para garantir que o `CandidatePreviewDrawer` faca `final -> offer`.
- Os testes atuais do drawer cobrem `technical_interview -> final`, mas nao `final -> offer` nem `offer -> hired`.

### Backend

- Cobertura de gate para Oferta esta boa.
- Cobertura de endpoint para pre-admissao esta capturando uma regressao/contrato quebrado.
- Nao vi um teste end-to-end focado em "usuario avanca pelo drawer/preview da pipeline e deve passar por offer".

## Onde o fluxo quebra

### Quebra principal

No frontend, no `CandidatePreviewDrawer`:

- regra local de progressao contradiz o pipeline real
- ao avancar um candidato em `final`, o drawer pede `hired`
- por isso o usuario pode nunca produzir um candidato em `offer`

### Quebra secundaria

No backend, depois de `hired -> pre_admission`:

- a transicao ocorre
- a criacao automatica do caso pode nao ocorrer
- o endpoint devolve `required_action=open_pre_admission` com `pre_admission_case_id=null`

## Plano de correcao proposto

### Fase 2A: corrigir o salto de frontend

1. Unificar a regra de progressao do preview drawer com a regra oficial do pipeline.
2. Remover o mapa local `NEXT_PIPELINE_STAGE` ou derivar de uma fonte unica compartilhada.
3. Garantir:
   - `final -> offer`
   - `offer -> hired`
4. Adicionar teste no `CandidatePreviewDrawer` cobrindo:
   - botao em `final` com label/aria de Oferta
   - chamada `pipelineService.moveCandidateStage(..., { stage: "offer" })`

### Fase 2B: blindar consistencia entre superficies

1. Revisar outras superficies que avancam etapa:
   - profile page
   - quick actions
   - action panels
2. Garantir que nenhuma use tabela local divergente.
3. Extrair um helper unico de proxima etapa para evitar duplicacao.

### Fase 2C: ajustar contrato de pre-admissao

1. Decidir comportamento esperado quando nao houver checklist template padrao ativo:
   - bloquear `hired -> pre_admission`, ou
   - permitir a etapa mas sem autocriacao, ou
   - autocriar caso sem template padrao
2. Alinhar os testes de endpoint ao contrato real escolhido.
3. Se mantiver autocriacao obrigatoria, garantir fixture/template default nos testes.

## Decisao recomendada

Prioridade 1: corrigir o `CandidatePreviewDrawer`, porque esse e o ponto que melhor explica por que o candidato "aparentemente nunca cai em Oferta".

Prioridade 2: resolver o contrato de pre-admissao, porque ja ha falha objetiva em testes de integracao e a UX pode receber `open_pre_admission` sem `case_id`.

## Artefatos auditados

- Backend:
  - [backend/src/application/services/pipeline_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_service.py:404)
  - [backend/src/application/services/pipeline_gate_evaluator.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pipeline_gate_evaluator.py:393)
  - [backend/src/interface/api/schemas/pipeline_schemas.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/schemas/pipeline_schemas.py:17)
  - [backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py:541)
  - [backend/src/application/services/pre_admission_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/pre_admission_service.py:131)
- Frontend:
  - [frontend/src/pages/PipelinePage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/PipelinePage.tsx:1229)
  - [frontend/src/features/pipeline/utils/pipelineKanbanColumns.ts](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/pipeline/utils/pipelineKanbanColumns.ts:28)
  - [frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx:49)
  - [frontend/src/features/candidates/utils/profile.ts](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/candidates/utils/profile.ts:454)

