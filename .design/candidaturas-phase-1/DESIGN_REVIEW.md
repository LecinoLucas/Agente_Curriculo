# Design Review: Candidaturas Fase 1

Reviewed against: user brief in implementation/review request
Philosophy: Functionalist operational table
Date: 2026-05-30

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| --- | --- | --- |
| `screenshots/review-candidaturas-desktop-1280.png` | Desktop (1280x800) | Header compacto, barra de controle, tabela completa com ações |
| `screenshots/review-candidaturas-tablet-768.png` | Tablet (768x1024) | Header compacto e tabela com colunas priorizadas |
| `screenshots/review-candidaturas-mobile-375.png` | Mobile (375x812) | Header compacto, controles empilhados e tabela reduzida para colunas essenciais |

## Summary

Fase 1 entregou o objetivo principal: menos ruído cromático, header mais curto e tabela mais operacional. Em desktop a página está mais próxima do padrão recente da Pipeline, com melhor densidade e leitura mais direta.

Durante a revisão com a aplicação rodando, apareceram dois problemas reais de responsividade: colisão do título com o botão do menu lateral em breakpoints pequenos, e excesso de largura útil da tabela em mobile/tablet. Ambos foram corrigidos com polimento visual pequeno na própria página.

Status final: aprovado com pequenos ajustes visuais aplicados.

## Must Fix

Nenhum após o passe final.

## Should Fix

1. `screenshots/review-candidaturas-mobile-375.png`: no mobile a tabela deixou de quebrar, mas a densidade continua alta e alguns campos do candidato ficam agressivamente truncados ou quebrados em múltiplas linhas. Está funcional, porém no limite visual do formato.

## Could Improve

1. `screenshots/review-candidaturas-desktop-1280.png`: a coluna `Próxima ação` ainda fica apertada para rótulos mais longos e às vezes quebra em duas linhas de um jeito pouco elegante.
2. `screenshots/review-candidaturas-mobile-375.png`: o score permanece comparável, mas o empilhamento vertical do contato consome bastante altura por linha; uma versão ainda mais enxuta do metadata poderia melhorar varredura.

## Passes

- Header ficou mais limpo e mais curto, sem perder contagem e contexto.
- Busca, filtro e ações principais continuam claros e rápidos de encontrar.
- Desktop aproveita melhor a largura com hierarquia mais seca e menos peso visual nos chips.
- Status, score, entrevista e próxima ação ficaram menos coloridos sem perder a codificação semântica, graças ao uso de superfícies neutras com acentos pontuais.
- `Score IA` continua fácil de comparar no desktop e no tablet.
- A tela ficou mais próxima do padrão operacional da Pipeline nova do que a versão anterior.

## Adjustments Applied During Review

- Adicionado espaçamento superior na página para evitar colisão do título com o botão de menu mobile.
- Ajustadas larguras mínimas e visibilidade responsiva de colunas da tabela para tablet/mobile.
- Mantida a tabela como estrutura principal, sem alteração de backend, API ou lógica de filtros.

## Validation

- `npm --prefix frontend test -- --run src/pages/__tests__/CandidaturasPage.test.tsx` — 74/74 testes passaram.
- `npm --prefix frontend test -- --run src/pages/__tests__/RhDashboardPage.test.tsx` — 6/6 testes passaram.
- `npm --prefix frontend run build` — build passou.
