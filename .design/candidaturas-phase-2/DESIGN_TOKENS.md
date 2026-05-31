# Design Tokens: Candidaturas Fase 2

## Base

Esta fase não introduz novo sistema de tokens. A implementação deve reutilizar os tokens HSL já presentes em `frontend/src/styles/index.css` e expostos no `tailwind.config.js`.

## Philosophy

Functionalist operational table: sinais neutros, superfícies leves e acentos sem saturação excessiva.

## Token Usage

- Backgrounds: `bg-surface`, `bg-surface-muted/25`, `bg-surface-muted/35`
- Borders: `border-border`, `border-border/70`
- Text: `text-text`, `text-text-muted`
- Operational accents:
  - Alta aderência: `success`
  - Decisão pendente / atenção: `warning`
  - Baixa aderência: `danger`
  - Ação padrão: `primary`

## Page-Level Semantics

- Resumo operacional: superfície neutra, sem cartões coloridos
- Prioridade por linha: barra lateral discreta + dot neutro/acento suave
- Próxima ação: badge curta, baixa saturação, com `title` para overflow
- Score IA: número evidente, label curta, tom sem fundos fortes

## Responsive Tokens

- Manter alturas compactas (`py-2`, `py-2.5`) nas linhas
- Reduzir texto secundário para `text-[11px]` ou `text-[10px]` apenas em metadados
- Preservar alvos clicáveis de pelo menos `h-8` nas ações pequenas

## Global Theme Changes

Nenhuma. Esta fase só mapeia melhor os tokens já existentes para semântica operacional local.
