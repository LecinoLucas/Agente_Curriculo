Arquivos criados:
.design/ui-pipeline-drawer-scroll-1/DRAWER_SCROLL_FIX.md

Arquivos alterados:
- frontend/src/features/pipeline/PipelineTransitionBlockedModal.tsx
- frontend/src/features/pipeline/__tests__/PipelineTransitionBlockedModal.test.tsx

Arquivos auditados:
- frontend/src/components/ui/dialog.tsx

Causa raiz:
Quando um candidato possui muitas pendências obrigatórias para avanço de etapa no Pipeline, a lista no `PipelineTransitionBlockedModal` crescia ilimitadamente. Como o container do Radix DialogContent estava configurado apenas com tamanho máximo de largura (`max-w-xl`), mas sem limite de altura flexível, o modal transbordava verticalmente a tela. Assim, a área de justificativa "Forçar avanço" e os botões de ação do rodapé (`DialogFooter`) ficavam inacessíveis/abaixo do campo de visão da janela (`viewport`).

Mudanças implementadas:
1. Adicionadas as propriedades `max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden` ao wrapper `DialogContent` do modal para garantir que ele respeite a viewport (85% da altura da tela) e comporte uma hierarquia interna flex.
2. Definida classe `shrink-0` e ajustado padding/bordas do `DialogHeader` (cabeçalho).
3. Todo o conteúdo central, incluindo a lista de pendências e o bloco de justificativa (Forçar avanço), foi agrupado em um container interno (criado o `data-testid="pipeline-blocked-scroll-container"`) que recebeu as propriedades `flex-1 overflow-y-auto p-6 min-h-0`. Dessa forma, o scroll ocorre apenas nessa área.
4. Definida classe `shrink-0` e ajustado padding/bordas/background (`bg-slate-50/50`) do `DialogFooter`, garantindo que os botões fiquem fixos (sticky bottom) e perfeitamente legíveis.
5. Adicionada uma nova suíte de testes unitários (`"UI Scroll Structure"`) para garantir que essas classes CSS estruturais estejam presentes, de modo a prevenir regressões.

Testes executados:
- Vitest: `cd frontend && npm run test -- --run PipelineTransitionBlockedModal`
- Type checking: `cd frontend && npx tsc --noEmit`

Resultado dos testes:
Todos os 7 testes de `PipelineTransitionBlockedModal.test.tsx` passaram com sucesso e não houve falhas de TypeScript.

Validação manual:
Passos recomendados a realizar no ambiente local:
1. Abrir a tela do Pipeline.
2. Identificar um candidato cuja transição de etapa tenha pendências obrigatórias e exigir justificativa (ou simular muitas requisições pendentes).
3. Tentar avançar a etapa e visualizar o modal.
4. Confirmar que o modal respeita o tamanho da tela (`max-h-[85vh]`).
5. Realizar scroll na área interna e verificar se o cabeçalho e as ações inferiores permanecem estáticas.

Anti-regressão:
- Pipeline: Nenhuma alteração; comportamentos do board não foram impactados.
- Modal/Drawer: Layout estabilizado; padding e bordas refinados sem quebrar o Radix UI.
- Ações de avanço: As funções `onClose` e `onForceSubmit` permanecem intactas, conectadas aos mesmos botões de UI no rodapé.
- Forçar avanço (admin): O bloco com ShieldAlert e textarea é exibido no container rolável sem ser cortado, e os caracteres mínimos ainda são monitorados.

Confirmações:
- Backend alterado: NÃO
- API alterada: NÃO
- Candidate Portal alterado: NÃO
- Migrations criadas: NÃO

Status final:
- CONCLUÍDO
