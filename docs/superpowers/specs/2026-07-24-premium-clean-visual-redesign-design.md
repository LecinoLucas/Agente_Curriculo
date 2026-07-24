# Redesign visual "Tema 1 Premium Clean" — Sidebar, TopNavbar e Pipeline

## Contexto

O usuário relatou que a UI está "poluída": botões duplicados na navegação, cores
demais (principalmente no Pipeline/Kanban) e falta de uma identidade visual
"premium clean". Pediu para focar no Tema 1 (Marajó/Crimson Ruby) como
identidade única e dar liberdade de decisão de design sênior ("me surpreenda").

Decisões já validadas com o usuário (3 perguntas, todas resposta recomendada):

1. O botão de recolher/expandir menu existe duplicado — um em `Sidebar.tsx`
   (linhas 106-117) e outro em `TopNavbar.tsx` (linhas 26-35), ambos controlando
   o mesmo estado `sidebarExpanded`. **Decisão: mantém só na Sidebar, remove da
   TopNavbar.**
2. O rodapé da Sidebar tem 3 controles lado a lado (seletor de paleta,
   claro/escuro, avatar de perfil) + botão de Sair abaixo. **Decisão: focar
   100% no Tema 1 como identidade premium, mas sem remover os outros 3 temas —
   apenas comprimir a apresentação num único menu de usuário.**
3. O Kanban do Pipeline pinta fundo, header e badge de cada coluna com uma cor
   saturada diferente (7 cores). **Decisão: neutralizar cards/corpo da coluna,
   manter a cor só como "assinatura" (barra fina de topo + acento pontual).**

## Objetivo

Reduzir ruído visual e duplicação funcional, sem remover nenhuma
funcionalidade existente (troca de tema, troca claro/escuro, perfil, logout,
badges e cores semânticas do pipeline continuam existindo — só reorganizados).

## Escopo

Dentro do escopo:
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/TopNavbar.tsx`
- `frontend/src/components/layout/AppShell.tsx` (wiring)
- Novo componente `frontend/src/components/layout/SidebarUserMenu.tsx`
  (substitui o uso solto de `VisualThemeSwitcher` no rodapé)
- `frontend/src/components/kanban/KanbanColumn.tsx`
- `frontend/src/components/kanban/KanbanCard.tsx` (avatar e paleta de acentos)
- `frontend/src/styles/index.css` (tokens do Tema 1 light/dark, limpeza de
  sombras/glows inconsistentes)

Fora do escopo (não mexer nesta rodada):
- Temas 2, 3 e 4 (mantidos como estão, só menos expostos na UI)
- `RhDashboardPage.tsx`, `JobCombobox.tsx`, `PipelinePage.tsx` (fora do pedido
  original — sidebar e pipeline/kanban). Se sobrar tempo/for pedido depois,
  fica pra uma spec separada.
- Testes de bot/candidatura já existentes (`test_bot_visibility.py`,
  `candidate-bot-application.e2e.spec.ts`) — não relacionados a este trabalho.

## Design

### 1. Sidebar & TopNavbar — remover duplicação

- **TopNavbar**: remove o botão de toggle de sidebar (`PanelLeftOpen`/
  `PanelLeftClose`, linhas 26-35) e os imports que ficarem sem uso
  (`sidebarExpanded`, `onToggleSidebarExpanded` deixam de ser usados por esse
  componente — remover das props também, já que `AppShell` é quem monta os
  dois). O botão de menu mobile (`Menu`, hambúrguer) continua, pois é a única
  forma de abrir o drawer no mobile.
- **Sidebar**: o botão de toggle existente (linha 106-117) passa a ser visível
  tanto no estado expandido quanto recolhido (hoje só aparece quando
  `sidebarExpanded` é true — verificar o `!sidebarExpanded && "hidden"` e
  ajustar para sempre mostrar um ícone de toggle, trocando o ícone conforme o
  estado: `PanelLeftClose` quando expandido, `PanelLeftOpen` quando recolhido).

### 2. `SidebarUserMenu` — um único ponto de controle no rodapé

Novo componente que substitui o bloco atual do rodapé (linhas 292-336 de
`Sidebar.tsx`): botão de paleta + botão sol/lua + botão de perfil + botão de
sair, todos lado a lado.

- Gatilho: um único botão/linha "cartão de usuário" (avatar com iniciais do
  usuário + nome, estilo Linear/Notion/Vercel), ocupando a largura da sidebar
  quando expandida; quando recolhida, mostra só o avatar circular.
- Ao clicar, abre um popover (mesmo padrão de `VisualThemeSwitcher`: portal +
  backdrop) com:
  - Toggle claro/escuro (linha única com label, não só ícone solto)
  - Seletor de tema visual (reaproveita a lista de `THEMES` de
    `VisualThemeSwitcher.tsx`, agora dentro do popover em vez de ser seu
    próprio botão)
  - Link "Meu perfil"
  - Ação "Sair" (tom danger, mesmo comportamento do `onLogout` atual)
- `VisualThemeSwitcher.tsx` não é usado em nenhum outro lugar do app (único
  uso confirmado: `Sidebar.tsx:296`). Seu conteúdo (lista `THEMES` e lógica de
  `useVisualTheme`) é absorvido pelo `SidebarUserMenu`, e o arquivo
  `VisualThemeSwitcher.tsx` é removido.

### 3. Pipeline / Kanban — neutralizar fundo, manter cor como assinatura

Em `KanbanColumn.tsx`, o objeto `COL_THEMES` hoje define, por etapa:
`accentBar`, `headerGlow` (gradiente colorido), `badge` (pill colorido) e
`bgEmpty`/`emptyIcon` (estado vazio colorido). Mudança:

- `accentBar` (barra de 3px no topo da coluna): **mantém**, é a assinatura
  visual da etapa — mas os tons saturados do Tailwind puro (`#38BDF8`,
  `#F59E0B`, etc.) são revisados para uma paleta mais harmônica com o Tema 1
  (mesma família de saturação/luminosidade entre as 7 cores, em vez de cores
  "cruas" de biblioteca).
- `headerGlow` (gradiente de fundo colorido no header): **remove**. Header
  passa a usar a superfície neutra padrão (`bg-[hsl(var(--surface))]` /
  `dark:bg-surface`), sem gradiente por etapa.
- `badge` (pill com contagem de candidatos): **neutraliza** — todas as colunas
  usam o mesmo estilo neutro (`surface-muted` + `text-muted`), a cor da etapa
  não aparece mais aqui.
- Corpo da coluna (`pipeline-kanban-column__body`, hoje
  `bg-slate-50/40`/`dark:bg-background/20`): mantém neutro (já é), sem mudança
  de tom por etapa.
- Estado vazio (`getEmptyStateConfig`): os círculos de ícone coloridos por
  etapa (`bg-[#E0F2FE] text-[#0284C7]`, etc.) somem — vira um único estilo
  neutro com o ícone específico da etapa mantido (a forma/ícone já comunica o
  contexto, não precisa de cor).

Em `KanbanCard.tsx`:
- `getAvatarStyles`: hoje sorteia 1 de 4 estilos de cor por hash do nome,
  incluindo tons não relacionados à marca (`warning-soft`, `surface-muted`
  genérico). Troca por um único estilo consistente baseado no token
  `--primary` (iniciais em tom sutil do carmim Marajó), removendo a
  variação aleatória.
- `scoreColorClass`/`borderAccentClass` (cor por faixa de score: verde ≥80,
  ciano ≥60, âmbar ≥40, vermelho <40): **mantém** a lógica (é informação
  funcional real — permite escanear aderência rapidamente), mas os tons ficam
  mais suaves/pastel no light mode, consistente com o restante do cartão
  branco/neutro.
- `BADGE_TONE_CLASS` (badges semânticos: pendência, sucesso, etc.): mantém
  como está — já são pastéis discretos, não fazem parte do problema relatado.

### 4. Tema 1 — tokens (`styles/index.css`)

Sem reescrever a paleta (já é consistente: carmim + porcelana/grafite). Ajustes
pontuais de higiene, aplicados só dentro dos blocos `[data-visual-theme="theme-1"]`
(light e dark):
- Revisar sombras/glows usados em `.glass`/`.ui-card` e nos cards do Kanban
  para uma escala única (sutil / média), removendo sombras coloridas ou glow
  de brand fora de estados de foco/hover.
- Nenhuma mudança nos valores HSL de `--brand`, `--primary`, `--nav-*` — a
  identidade de cor já está definida e aprovada pelo usuário.

## Testes

- `frontend/src/components/layout/__tests__/AppShell.nav.test.tsx`: ajustar
  se houver asserção sobre botões da TopNavbar/Sidebar (checar antes de
  alterar; levantamento inicial não achou dependência direta no toggle).
- `frontend/src/components/kanban/__tests__/KanbanCard.bot.test.tsx`: não
  deve quebrar (mudança é só de classe CSS, não de estrutura/testid).
- Verificação manual no navegador (dev server) nos dois modos (claro/escuro)
  e em pelo menos 2 larguras (desktop expandido/recolhido, mobile drawer):
  - Sidebar sem botão duplicado.
  - Rodapé com um único menu de usuário funcional (troca de tema, claro/escuro,
    perfil, logout).
  - Pipeline com colunas neutras e barra de cor no topo.

## Fora de escopo / riscos aceitos

- Não é uma repaginação de paleta de cores (tokens do Tema 1 continuam os
  mesmos), é uma reorganização de onde e quanto a cor aparece.
- `VisualThemeSwitcher.tsx` pode precisar ser refatorado ou absorvido pelo
  `SidebarUserMenu` — decisão final na implementação, dependendo se é usado em
  outro lugar do app.
