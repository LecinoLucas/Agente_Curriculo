# Design Review: Pipeline Redesign Fase 2

Reviewed against: Phase 2 Objectives (Compactação e Hierarquia)
Date: 2026-05-29

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| --- | --- | --- |
| `screenshots/pipeline-desktop.png` | Desktop (1440x1000) | Visão geral limpa com Kanban subindo bem próximo à dobra. |
| `screenshots/pipeline-laptop.png` | Laptop (1280x900) | Adaptação perfeita do header compacto. |
| `screenshots/pipeline-mobile.png` | Mobile (375x812) | Visão empilhada, revelando um problema de overlap no header. |

## Summary

O redesign atingiu o objetivo principal: a tela da Pipeline está muito mais limpa, as informações estão condensadas na parte superior, e as colunas do Kanban agora ocupam a maior parte da tela desde o carregamento inicial. Os filtros ficaram minimalistas e o *Top Match* perdeu o "peso" excessivo que tinha.

No entanto, há um pequeno bug visual no Mobile (regressão de padding) que fez o botão de menu hambúrguer sobrepor o título "Pipeline". 

## Must Fix

1. **Overlap no Mobile**: A remoção do padding superior original (`pt-4 sm:pt-6`) fez com que o conteúdo encostasse no topo absoluto, fazendo o menu hambúrguer sobrepor o Breadcrumb e o título "Pipeline". Veja `screenshots/pipeline-mobile.png`. _Fix: Restaurar o `pt-4 px-4 sm:pt-6 sm:px-6` no container principal do Header._

## Should Fix

(Nenhum problema funcional ou de quebra de layout de gravidade média).

## What Works Well

- **Card de Top Match**: A sutileza da borda lateral (`border-l-4`) ao invés do anel verde em torno de todo o card deixou a visão geral da coluna muito menos poluída.
- **Header e KPIs**: O agrupamento dos indicadores na mesma linha dos botões de filtro (no desktop) liberou pelo menos 100-150px de altura útil para o Kanban.
- **Empty States**: As colunas vazias pararam de gritar por atenção. A opacidade em 60% e o texto simples criaram um respiro visual valioso para o Board.
