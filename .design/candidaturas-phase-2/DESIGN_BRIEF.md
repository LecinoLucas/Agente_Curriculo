# Design Brief: Candidaturas Fase 2

## Problem

O RH já consegue listar candidaturas ativas, mas ainda perde tempo para identificar quem exige ação imediata, quem tem alta aderência e quem está travado por falta de entrevista ou decisão. Em mobile, a densidade da linha também dificulta varredura rápida.

## Solution

Refinar a tela atual de Candidaturas como uma fila operacional em tabela, adicionando um resumo compacto no topo, prioridade discreta por linha, rótulos mais curtos de próxima ação e melhor densidade responsiva. A tela continua sendo a mesma lista operacional, sem mudanças de backend, API ou lógica de filtros.

## Experience Principles

1. Prioridade antes de detalhe -- A primeira leitura precisa responder quem exige ação agora, antes de expor todos os metadados.
2. Densidade com legibilidade -- A tabela deve continuar compacta, mas sem sacrificar leitura em 375px.
3. Sinal sem ruído -- Cor e destaque só entram para orientar decisão operacional, nunca para competir com o conteúdo.

## Aesthetic Direction

- **Philosophy**: Functionalist operational table
- **Tone**: Calmo, objetivo, levemente urgente
- **Reference points**: Pipeline nova do sistema, dashboards operacionais B2B com hierarquia seca
- **Anti-references**: CRM colorido demais, layout em cards, badges chamativas saturadas

## Existing Patterns

- Typography: `Plus Jakarta Sans` e `Sora` via `tailwind.config.js`
- Colors: tokens HSL existentes em `frontend/src/styles/index.css` com `surface`, `text`, `primary`, `success`, `warning`, `danger`
- Spacing: escala utilitária de Tailwind já usada na página com células compactas e bordas suaves
- Components: `Button`, `Badge`, `EmptyState`, drawer/modais já existentes em `CandidaturasPage`

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Header da página | Modify | Adicionar resumo operacional logo abaixo, sem alongar o topo |
| Barra de controle | Exists | Manter intacta |
| Tabela de candidaturas | Modify | Continuar como estrutura principal |
| Linha da candidatura | Modify | Incluir prioridade discreta, ação mais curta e melhor densidade mobile |
| Chip de score | Modify | Manter comparabilidade com label curta e cor suave |
| Ações rápidas da linha | Modify | Reorganizar ações existentes sem remover principais |
| Drawer da candidatura | Exists | Manter como destino de detalhe e fallback mobile |

## Key Interactions

- O RH bate o olho no resumo do topo e entende o volume operacional imediato.
- Cada linha expõe uma prioridade primária discreta, sem pintar a linha inteira.
- A próxima ação aparece em rótulo curto, com `title` quando houver truncamento.
- Em desktop, ações rápidas ficam mais fáceis de acionar sem abrir o drawer.
- Em mobile, nome, vaga e próxima ação sobem de prioridade; contato fica mais enxuto, mas ainda acessível.

## Responsive Behavior

- Desktop: manter tabela completa, com prioridade, score, entrevista, próxima ação e ações rápidas.
- Tablet: preservar leitura da tabela com colunas priorizadas e metadados reduzidos.
- Mobile 375px: manter tabela; reduzir contato visível, mover sinais operacionais principais para a célula do candidato e evitar crescimento excessivo da altura da linha.

## Accessibility Requirements

- Contraste AA usando tokens existentes.
- Botões e ações rápidas com `aria-label` e `title` quando necessário.
- Rótulos truncados devem expor conteúdo completo via `title`.
- O resumo operacional precisa ser texto real, não apenas decoração visual.
- A navegação por teclado para ações rápidas existentes deve continuar funcional.

## Out of Scope

- Alterar backend, endpoints, payloads, filtros ou regras de negócio.
- Mudar `data-testid`.
- Trocar a tabela por cards.
- Reestruturar `Sidebar`, `AppShell` ou navegação global.
- Criar novas regras de priorização dependentes de dados que a listagem não possui.
