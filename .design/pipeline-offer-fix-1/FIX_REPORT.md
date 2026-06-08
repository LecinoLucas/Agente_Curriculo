# PIPELINE-OFFER-FIX-1

## Causa raiz

O `CandidatePreviewDrawer` mantinha uma tabela local de progressão de estágio divergente da regra já consolidada no domínio do frontend.

- Antes, o drawer calculava `final -> hired`.
- Isso permitia que o CTA pulasse a etapa `offer`.
- O helper compartilhado em `frontend/src/features/candidates/utils/profile.ts` já apontava `final -> offer`, criando inconsistência entre telas e componentes.

## Arquivos alterados

- `frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx`
- `frontend/src/features/candidates/components/__tests__/CandidatePreviewDrawer.test.tsx`
- `frontend/src/features/candidates/utils/profile.ts`

## Fluxo antes/depois

### Antes

- `final -> hired`
- `offer -> hired`

Resultado: o CTA do drawer podia contratar o candidato diretamente sem passar pela coluna Oferta.

### Depois

- `final -> offer`
- `offer -> hired`

Resultado: o drawer reaproveita um helper único de progressão e o CTA passa a respeitar o fluxo operacional esperado.

## Ajuste aplicado

- Extraída a regra de próximo estágio para helper compartilhado em `profile.ts`.
- Extraídos labels legíveis de avanço para o mesmo helper.
- `CandidatePreviewDrawer` passou a consumir esse helper em vez de manter uma tabela local duplicada.
- O CTA agora exibe:
  - em `final`: `Avançar para oferta`
  - em `offer`: `Marcar como contratado`

## Testes executados

### Frontend

- `cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend`
- `npx tsc --noEmit`
- `npm run test -- --run CandidatePreviewDrawer`
- `npm run test -- --run PipelinePage`
- `npm run build`

Resultados:

- `CandidatePreviewDrawer`: `29 passed`
- `PipelinePage`: `43 passed`
- `tsc`: sem erros
- `build`: concluído com sucesso

### Backend regressão mínima

Comando solicitado originalmente:

- `pytest tests/unit/test_pipeline_stage_gates.py -k "offer or hired or pre_admission" -v`

Observação:

- O caminho `tests/unit/test_pipeline_stage_gates.py` não existe no repositório atual.

Regressão equivalente executada no arquivo real:

- `cd /Users/lecinolucas/Developer/Agente_Curriculo/backend`
- `source .venv/bin/activate`
- `APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai JWT_SECRET_KEY=test-jwt pytest tests/integration/test_pipeline_stage_gates.py -k "offer or hired or pre_admission" -v`

Resultado:

- `10 passed, 22 deselected`

## Risco restante para próxima fase

Esta fase não altera o fluxo `hired -> pre_admission`.

Risco já conhecido e mantido separado:

- a transição posterior para pré-admissão ainda depende do comportamento de criação do caso/checklist padrão;
- esse ponto deve ser tratado na próxima fase dedicada a `hired -> pre_admission`.
