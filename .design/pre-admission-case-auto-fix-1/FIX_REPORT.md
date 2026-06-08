# PRE-ADMISSION-CASE-AUTO-FIX-1 — Fix Report

## Causa raiz

O servico de pipeline montava `required_action` com base apenas no stage alvo:

```text
target_stage == pre_admission -> open_pre_admission
```

Isso deixava a garantia de contrato implicita, nao explicita.

Ao mesmo tempo, a criacao automatica do caso admissional dependia da existencia de checklist template padrao ativo.

## Arquivos alterados

- `backend/src/application/services/pipeline_service.py`
- `backend/src/interface/api/routers/pipeline.py`
- `backend/tests/integration/test_pipeline_endpoints_integration.py`

## Comportamento antes

- A regra de bloqueio por falta de checklist ja existia no fluxo principal.
- A garantia `open_pre_admission => pre_admission_case_id valido` nao estava formalizada no ponto de montagem da resposta.

## Comportamento depois

- `required_action` passa a ser derivado do `pre_admission_case_id` efetivamente criado/reutilizado.
- Se o stage alvo for `pre_admission` e nao houver `case_id` valido, o backend interrompe o contrato antes da resposta.
- Sem checklist padrao ativo, a resposta continua controlada em `409` com `DEFAULT_CHECKLIST_TEMPLATE_REQUIRED`.
- O candidato permanece em `hired`.
- Nenhum caso parcial e criado.

## Impacto no RH

- O RH so recebe CTA para abrir pre-admissao quando o workspace existe.
- Em ambiente sem checklist padrao, recebe orientacao clara para configurar o template antes de iniciar a pre-admissao.

## Riscos restantes

- O fluxo depende do template padrao ativo continuar sendo a fonte oficial para autocriacao do caso.
- A excecao `PipelinePreAdmissionCaseContractError` hoje e um guarda de integridade; se ela disparar, existe regressao interna a investigar.

## Mudancas fora do escopo

- Nao houve alteracao em Protheus real.
- Nao houve alteracao em CandidatePreviewDrawer.
- Nao houve alteracao visual de PipelinePage nesta fase.
