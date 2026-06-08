# PRE-ADMISSION-CASE-AUTO-FIX-1 - Relatório de correção

## Causa raiz

O serviço de pipeline chamava `_ensure_pre_admission_case_for_stage` depois de persistir a mudança para `pre_admission`. Dentro desse método, a criação automática do caso capturava `ValidationException` gerada pela ausência de checklist padrão ativo e retornava `None`.

Na sequência, a resposta era montada com `required_action = "open_pre_admission"` sempre que o destino era `pre_admission`, independentemente de existir `pre_admission_case_id`.

## Arquivos alterados

- `backend/src/application/services/pipeline_service.py`
- `backend/src/interface/api/routers/pipeline.py`
- `backend/tests/integration/test_pipeline_endpoints_integration.py`
- `backend/tests/integration/test_pipeline_stage_gates.py`
- `frontend/src/features/pipeline/usePipelineTransitionBlocked.ts`
- `frontend/src/features/pipeline/__tests__/usePipelineGateActionResolver.test.tsx`
- `frontend/src/features/pipeline/__tests__/usePipelineTransitionBlocked.test.tsx`
- `frontend/src/services/http.ts`
- `.design/pre-admission-case-auto-fix-1/`

## Comportamento antes

- `hired -> pre_admission` persistia o stage.
- A autocriação do caso podia falhar por falta de checklist padrão ativo.
- A resposta podia retornar `required_action = "open_pre_admission"` com `pre_admission_case_id = null`.
- O frontend tinha fallback para navegar para a aba de pré-admissão mesmo sem case id.

## Comportamento depois

- Antes de persistir `pre_admission`, o pipeline valida se já existe caso ativo ou checklist padrão ativo capaz de gerar um caso.
- Sem checklist padrão ativo, a transição é bloqueada com `409`.
- A resposta orienta `required_action = "configure_default_checklist_template"`.
- O candidato permanece em `hired`.
- Nenhum caso parcial é criado.
- O frontend não navega mais para pré-admissão quando `open_pre_admission` não traz `case_id`.

## Impacto no RH

O RH passa a receber uma falha operacional clara: configurar o checklist admissional padrão antes de iniciar a pré-admissão. Isso evita cards em pré-admissão sem caso admissional e elimina a tentativa de abrir um recurso inexistente.

## Riscos restantes

- A tela de configuração de checklists já existe, mas esta fase não adiciona um atalho visual novo para ela.
- Se um checklist padrão for removido entre a validação e a criação do caso, a transação ainda bloqueia a operação com erro controlado.
- Esta fase não altera Protheus real nem cria migration.
