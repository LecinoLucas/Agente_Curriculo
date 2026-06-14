Causa raiz

O modal de bloqueio de transição no Pipeline dependia de classes de layout corretas, mas sem contratos explícitos suficientes para header, área rolável e footer. Em cenários com muitas pendências e justificativa de força, o conteúdo central podia crescer demais e comprometer a previsibilidade do scroll interno.

Componente alterado

- `frontend/src/features/pipeline/PipelineTransitionBlockedModal.tsx`

Solução de layout

- `DialogContent` mantido como container vertical com `max-h-[85vh]`, `flex`, `flex-col` e `overflow-hidden`.
- header marcado como área fixa com `shrink-0` e borda inferior.
- conteúdo central marcado como área rolável com `min-h-0`, `flex-1` e `overflow-y-auto`.
- footer marcado como área fixa com `shrink-0`, borda superior e fundo próprio.

Estratégia de scroll

- o scroll fica apenas no conteúdo central;
- o modal inteiro não ganha scroll;
- header e footer permanecem visíveis mesmo com muitas pendências;
- textarea de justificativa continua dentro da área rolável, sem empurrar as ações para fora da viewport.

Testes executados

- `cd frontend && npm run test -- --run PipelineTransitionBlockedModal`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

Todos passaram.

Confirmação funcional

- nenhuma regra de negócio de gates mudou;
- nenhuma permissão mudou;
- nenhum endpoint/API mudou;
- nenhum ajuste em backend foi feito.
