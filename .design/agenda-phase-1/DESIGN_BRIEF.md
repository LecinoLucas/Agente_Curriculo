# Design Brief: Agenda Phase 1

## Problem

A Agenda exposes interview operations too broadly and allows interviews without the canonical candidate-job context. Recruiters, HR, viewers, and managers currently see similar affordances even though their operational responsibilities are different.

## Solution

Consolidate the functional contract before visual redesign: enforce RBAC in the API, align the UI with those permissions, require candidate-job linkage for interview scheduling, and make existing labels honest.

## Experience Principles

1. Backend authority over UI hints -- every mutable action is validated by API permissions.
2. Candidate-job context over loose records -- an interview belongs to a candidate in a vacancy flow.
3. Honest labels over visual churn -- keep the current layout but stop misleading users.

## Existing Patterns

- Routes use `ProtectedRoute` with role arrays in `AppRouter.tsx`.
- Sidebar visibility is centralized in `AppShell.tsx`.
- Agenda data comes from `agendaService` and `InterviewSchedule` types.
- Backend role dependencies live in `dependencies.py`; routers raise FastAPI `HTTPException`.
- Interview scheduling already has a canonical candidate-job endpoint and an Agenda global endpoint.

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| AgendaPage | Modify | Hide mutable actions by role and fix period labels. |
| AgendaInterviewModal | Modify | Require vacancy on candidate interview and clarify public notes. |
| InterviewQuickScheduleModal | Modify | Remove unsupported Calendar/Meet promise and label format correctly. |
| InterviewScheduleService | Modify | Enforce candidate-job link and public notes guard. |
| interview_schedules router | Modify | Enforce read/write RBAC and recruiter scope. |

## Key Interactions

- Admin/HR can list and operate the full Agenda.
- Recruiter can list and operate interviews scoped to records they created.
- Viewer can list Agenda data but cannot create, edit, cancel, complete, or mark no-show.
- Manager does not access the global Agenda route and receives 403 on global Agenda API use.
- Creating a candidate interview requires a selected vacancy linked to the candidate.

## Responsive Behavior

No layout redesign in this phase. Existing desktop/mobile structure remains, with only labels and action visibility adjusted.

## Accessibility Requirements

Keep existing form labels explicit. Disabled or hidden actions must not leave keyboard-only users with dead controls.

## Out of Scope

- Generic task/event agenda.
- Google Calendar/Meet support for pipeline quick schedule.
- Candidate confirmation, rescheduling, or cancellation.
- Visual redesign of the Agenda layout.
