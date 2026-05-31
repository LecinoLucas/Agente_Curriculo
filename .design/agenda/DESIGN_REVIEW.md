# Design Review: Agenda

Reviewed against: codebase only (no `DESIGN_BRIEF.md` específico da Agenda encontrado)
Date: 2026-05-30

## Screenshots Captured

- `.design/agenda/screenshots/agenda-desktop.png`
- `.design/agenda/screenshots/agenda-laptop.png`
- `.design/agenda/screenshots/agenda-mobile.png`

## Functional Diagnosis

### Current scope

- A Agenda atual cobre apenas `InterviewSchedule`.
- Não há suporte para eventos internos genéricos, tarefas, follow-ups, reuniões de gestor fora do fluxo de entrevista, nem marcos de pré-admissão.
- A tela usa API real:
  - `GET /api/v1/agenda/interviews`
  - `GET /api/v1/agenda/kpis`
  - endpoints operacionais de `create/update/cancel/reschedule/complete/no-show`

### Entry and access

- Rota: `/agenda`
- Sidebar: visível em `Recrutamento > Agenda`
- Frontend permite acesso para `admin`, `recruiter`, `viewer`, `manager`, `hr`
- Backend da Agenda também aceita qualquer `InternalUser`
- Consequência: hoje a Agenda não é RH-only nem recruiter-only

### Interview origins

- Agenda global: `AgendaInterviewModal`
- Pipeline board: `InterviewQuickScheduleModal`
- Candidaturas: `ScheduleInterviewModal`
- Perfil do candidato: `CandidateProfileInterviewsTab`

### Major gaps

1. A tela permite ação operacional para papéis amplos demais.
   - `viewer` e `manager` conseguem abrir a Agenda e, pelo código atual, também criar, editar, cancelar, concluir e marcar no-show.

2. Os filtros de período não batem com a navegação da tela.
   - `month` e `week` buscam períodos maiores, mas a UI só deixa navegar na semana de `selected`.
   - Em `all`, a seção diária passa a listar todas as entrevistas, mas mantém um título de dia específico.

3. A Agenda global permite criar entrevista sem vaga/pipeline.
   - Isso produz entrevista que aparece na Agenda, mas pode não aparecer no fluxo candidato-vaga, no portal do candidato e nem no histórico operacional esperado.

4. A Agenda não oferece navegação forte de volta para contexto de processo.
   - O caminho para abrir candidato existe só via ação de scorecard.
   - Não há CTA explícito para abrir pipeline/candidato em entrevistas agendadas.

5. O candidato só consome leitura.
   - Vê entrevista pública no portal, com `meeting_url`, `location` e `public_notes`.
   - Não existe confirmação, reagendamento ou cancelamento pelo portal.

6. Existe risco real de vazamento via `public_notes`.
   - O portal do candidato renderiza `public_notes` diretamente.
   - Na base atual há entrevista com `public_notes` preenchido com URL crua, o que confirma uso inconsistente do campo.

### Business-rule observations

- Há validação de data passada, fim maior que início e conflito por candidato/entrevistador.
- Não há validação forte por formato:
  - `presencial` sem local
  - `online` sem link
  - entrevistador opcional
- Há timezone no modelo, mas o agrupamento visual no frontend usa `Date` local do navegador.
- Há integração com Google Calendar na Agenda global.
- O quick scheduling do Pipeline expõe expectativa de integração com Google, mas o schema do endpoint de pipeline não recebe esses flags.

## Visual Diagnosis

### What works

- Desktop e laptop estão limpos e legíveis.
- A hierarquia principal é fácil de entender:
  - título
  - banner de integração
  - KPIs
  - filtros
  - semana
  - listas
- O shell visual conversa com a navegação staff atual.

### Main visual issues

1. A largura útil está subaproveitada.
   - A página fica comprimida em `max-w-4xl` e sobra área demais no desktop.

2. A tela repete informação.
   - Strip semanal + detalhe do dia + lista da semana geram redundância, mas sem profundidade de calendário.

3. O topo mobile fica congestionado.
   - Título quebra em muitas linhas e compete com o CTA vermelho.

4. O mobile empurra o conteúdo principal para baixo.
   - Banner, KPIs e filtros ocupam quase toda a primeira dobra antes da lista.

5. Falta affordance de navegação temporal.
   - Não há setas, troca de semana, visão mensal real ou breadcrumbs temporais.

6. Os KPIs parecem corretos visualmente, mas a semântica pode confundir.
   - “Total agendadas” sugere agenda futura, porém agrega histórico completo.

## Priority List

### Must fix

- Restringir mutações da Agenda a papéis operacionais coerentes.
- Corrigir a semântica de período/navegação (`week`/`month`/`all`).
- Impedir criação de entrevista solta fora do vínculo candidato-vaga quando o fluxo exigir rastreabilidade.

### Should fix

- Adicionar CTA claro para abrir candidato e pipeline a partir da Agenda.
- Revisar contrato de `public_notes` vs `internal_notes`.
- Alinhar quick schedule do Pipeline com os campos realmente aceitos pelo backend.
- Exigir dados mínimos por formato da entrevista.

### Could improve

- Dar à Agenda uma visão temporal mais forte (semana real, navegação, agrupamento menos redundante).
- Aumentar aproveitamento horizontal no desktop.
- Reequilibrar o header mobile.

## Redesign Direction

- Manter a linguagem visual do shell staff atual.
- Trocar a composição “cards empilhados” por uma estrutura mais operacional:
  - topo compacto
  - filtros persistentes
  - navegação temporal explícita
  - lista principal ligada ao contexto candidato-vaga
- Separar nitidamente:
  - agenda operacional do processo
  - integrações externas
  - ações rápidas
