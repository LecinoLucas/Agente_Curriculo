# Design Review — Temas Marajó

Data: 2026-05-24

## Escopo

Revisão visual dos temas atuais:

- Tema 1: vermelho Marajó (`theme-1`)
- Tema 2: azul industrial (`theme-2`)

Rotas revisadas em light e dark:

- `/dashboard`
- `/pipeline`
- `/candidatos`
- `/vagas`
- `/admin`

Arquivos avaliados:

- `frontend/src/styles/index.css`
- `frontend/src/components/layout/VisualThemeSwitcher.tsx`

## Estado Atual Dos Temas

1. Tema 1 usa vermelho Marajó como assinatura principal, com navbar mais forte que o fundo da página.
2. Tema 2 usa azul industrial/corporativo como assinatura principal, distinto do Tema 1.
3. `VisualThemeSwitcher` exibe apenas:
   - Tema 1 — Vermelho Marajó
   - Tema 2 — Azul Industrial
4. `theme-3` e `theme-4` continuam suportados internamente para compatibilidade com usuários ou dados antigos, mas não são expostos na interface.
5. `destructive`/erro continua separado de `primary`, especialmente no Tema 2.
6. Dark mode é explícito por combinação `data-theme="dark"` + `data-visual-theme`.

## Screenshots Capturadas

Capturas históricas salvas em `.design/top-navbar/screenshots/theme-review-6-3/`:

- `review-6-3-theme-1-light-dashboard.png`
- `review-6-3-theme-1-light-pipeline.png`
- `review-6-3-theme-1-light-candidatos.png`
- `review-6-3-theme-1-light-vagas.png`
- `review-6-3-theme-1-light-admin.png`
- `review-6-3-theme-1-dark-dashboard.png`
- `review-6-3-theme-1-dark-pipeline.png`
- `review-6-3-theme-1-dark-candidatos.png`
- `review-6-3-theme-1-dark-vagas.png`
- `review-6-3-theme-1-dark-admin.png`
- `review-6-3-theme-2-light-dashboard.png`
- `review-6-3-theme-2-light-pipeline.png`
- `review-6-3-theme-2-light-candidatos.png`
- `review-6-3-theme-2-light-vagas.png`
- `review-6-3-theme-2-light-admin.png`
- `review-6-3-theme-2-dark-dashboard.png`
- `review-6-3-theme-2-dark-pipeline.png`
- `review-6-3-theme-2-dark-candidatos.png`
- `review-6-3-theme-2-dark-vagas.png`
- `review-6-3-theme-2-dark-admin.png`
- `review-6-3-theme-switcher.png`

Capturas posteriores também existem em `.design/top-navbar/screenshots/` e `.design/top-navbar/screenshots/navbar-polish/`.

## Pontos Aprovados

1. A identidade visual ficou mais conectada à Marajó do que no estado inicial.
2. O Tema 1 é claramente vermelho Marajó, institucional e forte.
3. O Tema 2 é claramente azul industrial, corporativo e distinto do Tema 1.
4. A navbar dos dois temas tem presença maior que o fundo da tela.
5. TopNavbar, cards, botões, inputs, badges e dropdowns seguem harmonizados nas rotas principais.
6. O VisualThemeSwitcher ficou mais simples ao expor apenas dois temas.
7. O vermelho funciona como marca/ação/foco no Tema 1 sem virar erro permanente.
8. No Tema 2, `primary` azul não contamina `destructive`.
9. Dark mode foi validado em `/pipeline`, `/candidatos` e `/admin` após ajustes de contraste.
10. Não houve overflow horizontal nas rotas revisadas.

## Problemas Resolvidos

1. Tema 1 e Tema 2 deixaram de ser parecidos demais.
2. Tema 2 deixou de ser uma variação acolhedora próxima do Tema 1 e passou a assumir azul industrial.
3. A navbar ganhou presença visual em ambos os temas.
4. Dark mode de `/pipeline`, `/candidatos` e `/admin` foi revisado para evitar perda de legibilidade nos pontos críticos conhecidos.

## Backlog Opcional

1. Reduzir cores hardcoded restantes em KPIs, badges, status e cards internos.
2. Criar tokens semânticos para status e métricas, substituindo classes soltas de `blue`, `emerald`, `amber`, `rose`, `purple`, `slate` e `gray`.
3. Revisar o fluxo público/candidato, que ainda usa muitas classes Tailwind hardcoded fora do sistema visual principal.
4. Revisar LoginPage para aproximar a porta de entrada dos temas Marajó, sem mexer na lógica de autenticação.

## Hardcoded Colors Para Fase Futura

- `frontend/src/pages/DashboardPage.tsx`: KPIs e pendências ainda usam cores fixas como `bg-blue-500`, `bg-indigo-500`, `bg-emerald-600`, `bg-amber-400`, `bg-rose-400`, `bg-violet-400`.
- `frontend/src/features/pipeline/JobCombobox.tsx`: dropdown e badges ainda usam `slate`, `emerald`, `amber`, `rose`.
- `frontend/src/features/notifications/components/NotificationItem.tsx`: categorias ainda usam `amber`, `rose`, `purple`, `indigo`, `blue`, `gray`.
- Fluxo público/candidato e telas de login ainda carregam `gray`, `blue`, `red`, `slate` hardcoded.
- Áreas do drawer de candidato e painéis de análise ainda têm muitos estados `blue`, `purple`, `green`, `red`, `amber` fixos. Não bloqueia o checkpoint atual, mas merece inventário antes de uma etapa de tokens semânticos.

## Veredito

**Aprovado**

Os dois temas atuais estão suficientemente distintos, profissionais e coerentes para o checkpoint:

- Tema 1: vermelho Marajó institucional.
- Tema 2: azul industrial corporativo.

As pendências restantes são backlog de refinamento visual amplo, não bloqueios da reorganização dos temas.
