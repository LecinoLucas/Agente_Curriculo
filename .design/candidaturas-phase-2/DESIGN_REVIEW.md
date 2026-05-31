# Design Review: Candidaturas Fase 2

Reviewed against: `.design/candidaturas-phase-2/DESIGN_BRIEF.md`
Philosophy: Functionalist operational table
Date: 2026-05-30

## Screenshots Captured

- `.design/candidaturas-phase-2/screenshots/review-candidaturas-desktop-1280.png`
- `.design/candidaturas-phase-2/screenshots/review-candidaturas-tablet-768.png`
- `.design/candidaturas-phase-2/screenshots/review-candidaturas-mobile-375.png`

## Summary

A Fase 2 atingiu o objetivo principal de transformar a tela em uma fila mais operacional sem romper backend, API, filtros ou a estrutura em tabela. O topo agora responde rapidamente quem tem alta aderência, quem está pronto para entrevista e quem está em decisão. Nas linhas, a prioridade ficou visível sem reintroduzir ruído cromático.

O ponto mais sensível da revisão era o mobile 375px. Após o ajuste final de esconder a coluna dedicada de vaga nesse breakpoint e mover a vaga para dentro da célula principal, a leitura de nome + vaga + próxima ação ficou substancialmente melhor. O acesso ao contato também ficou mais compacto.

Status final: aprovado.

## Must Fix

Nenhum.

## Should Fix

Nenhum.

## Could Improve

1. `review-candidaturas-mobile-375.png`: com contagens mais altas, a segunda linha do resumo operacional ainda pode quebrar em duas linhas. Está aceitável, mas é o próximo limite natural se a equipe quiser polimento extra.

## Passes

- `review-candidaturas-desktop-1280.png`: o resumo operacional aparece acima da tabela sem virar grade de cards e sem competir com os controles.
- `review-candidaturas-desktop-1280.png`: prioridade por linha funciona com barra lateral sutil, badge neutra e score fácil de comparar.
- `review-candidaturas-desktop-1280.png`: ações rápidas ficaram mais claras com abrir candidato, abrir pipeline, marcar entrevista e menu complementar.
- `review-candidaturas-tablet-768.png`: a tabela continua legível com colunas priorizadas e próxima ação ainda visível.
- `review-candidaturas-mobile-375.png`: nome, vaga e próxima ação passaram a dominar a leitura; o contato foi reduzido sem perder acesso.
- `review-candidaturas-mobile-375.png`: o layout permaneceu em tabela e não colapsou para cards completos.
- Tokens globais e shell de navegação permaneceram intactos.

## Validation

- `npm --prefix frontend test -- --run src/pages/__tests__/CandidaturasPage.test.tsx` — 77/77 testes passaram.
- `npm --prefix frontend test -- --run src/pages/__tests__/RhDashboardPage.test.tsx` — 6/6 testes passaram.
- `npm --prefix frontend run build` — build passou.
