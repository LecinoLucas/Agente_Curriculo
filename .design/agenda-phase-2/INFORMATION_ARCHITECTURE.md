# Information Architecture: Agenda Phase 2

## Site Map

- Agenda `/agenda`
  - Create interview modal, opened from `Nova entrevista`
  - Edit/reschedule interview modal, opened from interview action menu
  - Cancel interview modal, opened from interview action menu
  - Candidate context `/candidatos/:candidateId`
  - Pipeline context `/pipeline/:jobId?candidateId=:candidateId`

## Navigation Model

- **Primary navigation**: Existing app navigation keeps Agenda under Recrutamento for admin, recruiter, viewer and hr. Manager remains excluded from the Agenda item and route.
- **Temporal navigation**: The Agenda page has one period switcher: Hoje, Semana, Mês and Todas. Previous/next controls shift the active period, except in Todas.
- **Context navigation**: Every interview row exposes direct CTAs to candidate profile and pipeline context when the interview has job/candidate linkage.
- **Mobile navigation**: Header actions wrap compactly. Filters live in a single compact filter panel, and interviews render as stacked rows with actions in a menu.

## Content Hierarchy

### Agenda

1. Operational header: title, short subtitle, role state, Nova entrevista for mutable roles, Atualizar for every allowed role.
2. Summary strip: Hoje, Próximas, Pendentes and Canceladas.
3. Temporal controls: period selection, current date range, previous/next.
4. Filters: search and status.
5. Interview content:
   - For Hoje/Semana/Mês: operational blocks for Hoje, Próximas, Atrasadas/pendentes and Realizadas/canceladas.
   - For Todas: interviews grouped by date with the title Todas as entrevistas.
6. Secondary sync area: Google Agenda connection stays optional and visually secondary.

## User Flows

### Operate Interview

1. User opens `/agenda`.
2. User selects Hoje, Semana, Mês or Todas.
3. User scans sections by operational urgency.
4. User opens candidate or pipeline for context.
5. If role is admin, hr or recruiter, user opens row menu and edits, cancels, concludes or marks no-show.
6. If role is viewer, user can only inspect and navigate to context.

### Change Period

1. User chooses a period button.
2. The page updates the active date range.
3. Previous/next shifts by day, week or month.
4. Todas disables previous/next and groups content by date.

## Naming Conventions

| Concept | Label in UI | Notes |
|---------|-------------|-------|
| Global schedule | Agenda | Existing product term |
| New interview | Nova entrevista | Action is explicit and not a loose event |
| Temporal modes | Hoje, Semana, Mês, Todas | Short labels reduce mobile congestion |
| Mutable role state | Operação | Marks roles that can act |
| Read-only role state | Somente leitura | Marks viewer behavior |
| Candidate CTA | Abrir candidato | Direct context link |
| Pipeline CTA | Abrir pipeline | Direct process context link |

## Component Reuse Map

| Component | Used on | Behavior differences |
|-----------|---------|---------------------|
| `Button` | Header, period controls, filters, row CTAs | Uses existing UI token variants |
| `Badge` | Role, status, format, counts | Uses existing semantic variants |
| `AgendaInterviewModal` | Create/edit | Existing modal behavior preserved |
| `CancelInterviewModal` | Cancel action | Existing modal behavior preserved |

## Content Growth Plan

The page keeps `page_size: 100` as before. The visual structure is ready for pagination or infinite loading later because interviews are already grouped into sections/date groups after API loading.

## URL Strategy

- Agenda remains `/agenda`.
- Candidate context uses `/candidatos/:candidateId`.
- Pipeline context uses `/pipeline/:jobId?candidateId=:candidateId` when `job_id` exists, with `/pipeline?candidateId=:candidateId` as fallback.
