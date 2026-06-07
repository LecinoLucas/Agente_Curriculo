# Implementation Plan

Esta fase define somente o contrato visual. A implementação de componentes e a aplicação em telas reais ficam separadas.

## UI-ADMIN-FRAMEWORK-1B

Objetivo:

- criar componentes em `frontend/src/components/admin/`;
- transformar o contrato visual em primitives reutilizáveis;
- adicionar testes de componentes;
- manter páginas reais intactas nesta subfase, se possível.

Entregas previstas:

- `AdminListPage`
- `CompactPageHeader`
- `AdminMetricStrip`
- `AdminToolbar`
- `AdminEntityList` ou `EntityTable`
- `AdminSidePanel`
- `CompactEmptyState`
- `RowActions`

## UI-KNOWLEDGE-2

Objetivo:

- aplicar o padrão em `/admin/conhecimento`;
- consolidar lista compacta;
- mover criação/edição e detalhes para painéis sob demanda;
- remover qualquer resquício de formulário aberto por padrão.

## UI-CHECKLISTS-2

Objetivo:

- aplicar o padrão em `/admissao/checklists`;
- separar claramente lista, detalhe e edição;
- evitar criação inline aberta;
- reduzir cards grandes e editor misturado com a lista.

## UI-ASSISTANT-2

Objetivo:

- aplicar o padrão ao modal do Assistente IA;
- manter foco em consulta principal;
- tratar histórico, sugestões e detalhe como camadas secundárias;
- evitar painel lateral com navegação ou excesso de blocos equivalentes.

## UI-ADMIN-HEALTH-2

Objetivo:

- aplicar o padrão em Admin, Health e AI settings;
- reduzir competição entre cards equivalentes;
- preservar leitura técnica sem cair em “dashboard inflado”.

## Ordem recomendada

1. `UI-ADMIN-FRAMEWORK-1B`
2. `UI-KNOWLEDGE-2`
3. `UI-CHECKLISTS-2`
4. `UI-ASSISTANT-2`
5. `UI-ADMIN-HEALTH-2`

## Critério de avanço

Só avançar para implementação quando:

- o worktree estiver estável;
- as páginas sensíveis não estiverem com mudanças concorrentes;
- os componentes do framework puderem nascer em isolamento limpo.
