# Refinamento de Densidade Visual do Pipeline (UI-PIPELINE-DENSITY-1)

## Contexto Antes e Depois (Conceitual)
- **Antes:** O layout possuía uma grande margem vertical no topo (`pt-12`) resultando em uma área de controle (com dados da vaga e copiloto) excessivamente alta. O banner do "Marajó RH IA" dominava muito espaço visual. A barra de filtros era grande (`h-10` nos botões) e os componentes do Kanban, incluindo as colunas e os cartões de candidatos, possuíam paddings e gaps muito largos, cortando a visualização da tela precocemente.
- **Depois:** O pipeline recebeu um polimento focado na *densidade operacional*. Reduzimos paddings do topo (`pt-4`), transformamos o banner de IA em um card descritivo inline simples e eficiente, achatamos a barra de filtros (`h-8` para botões) e comprimimos os paddings dentro do próprio Kanban (colunas com headers menores, cards de candidato com padding mais enxutos). Por fim, o scroll do Kanban foi ajustado para ter tolerância no final (`after:w-4`) evitando que a última coluna ficasse com aparência "cortada".

## Arquivos Alterados
1. `frontend/src/pages/PipelinePage.tsx`
   - Compactação da margem/padding superior e do container principal.
   - Refatoração do Grid do cabeçalho da vaga + Marajó IA (remoção de imagens e minimização da altura `min-h-[70px]`).
   - Compactação da Pipeline Toolbar (filtros) usando classes de tamanhos mais enxutas (`h-8`, `py-2`).
   - Correção de overflow e min-height do container horizontal Kanban (`min-h-0` e `after:w-4`).
2. `frontend/src/components/kanban/KanbanColumn.tsx`
   - Compactação dos cabeçalhos das colunas (redução do `pt-3` e `pb-2.5` para `py-2`).
   - Redução dos gaps e padding do layout principal de cada coluna (`gap-1.5`, `px-2 py-2`).
3. `frontend/src/components/kanban/KanbanCard.tsx`
   - Redução global do padding dos cards para `p-2.5` (anterior `p-3`).
   - Redução leve de `gap` nas descrições internas do cartão.
   - Ajuste sutil na curvatura de borda (`rounded-[14px]`).

## Decisões de UX
- **Foco no Kanban:** Menos espaço na apresentação do que a tela *é* (já validado pelo usuário logado) e mais espaço de tela focado no *fluxo de trabalho*.
- **Sem alterar a estética global:** Modificamos espaçamentos estruturais respeitando o ShadCN/Tailwind, mas não alteramos os estilos das cores globais ou identidade visual base.
- **Acessibilidade Inalterada:** Preservamos testIDs (garantindo que não seríamos nós a quebrar Cypress/RTL no futuro) e não mudamos as labels funcionais do sistema.

## Testes Executados
- `npx tsc --noEmit` -> OK (Passou sem erros).
- `npm run test -- --run PipelinePage` -> OK (44 testes aprovados; indicando que o estado renderizado em React Testing Library, botões, tooltip, não sofreram breakages de dom structure).
- `npm run build` -> OK (Compilação Vite sem impedimentos).

## Riscos Restantes
- O comportamento visual do board encurtado deverá ser validado visualmente em telas menores (1366x768 de notebook) para atestar que os botões do portal de Actions não ficam sobrepostos ao header em resoluções atípicas.
- Não há novos riscos lógicos. Não houve mutação em regras de API, hooks, e a lógica de DnD (Drag-and-Drop) permaneceu intocada.
