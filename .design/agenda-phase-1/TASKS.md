# Build Tasks: Agenda Phase 1

Generated from: .design/agenda-phase-1/DESIGN_BRIEF.md
Date: 2026-05-30

## Foundation
- [x] **Define contract**: Document RBAC and candidate-job linkage for Agenda Phase 1. _Reuses: audit findings._
- [x] **Backend RBAC**: Split Agenda read/write permissions and scope recruiter operations. _Modifies: interview schedule router/repository._

## Core Flow
- [x] **Required vacancy link**: Block interview creation without an active candidate-job link. _Modifies: interview schedule service and modal._
- [x] **Frontend action gates**: Hide mutable actions for viewer and remove manager from Agenda route/sidebar. _Modifies: AgendaPage, AppRouter, AppShell._
- [x] **Quick schedule truthfulness**: Remove unsupported Calendar/Meet promise and relabel format. _Modifies: InterviewQuickScheduleModal._

## Interactions & States
- [x] **Period semantics**: Use selected week/month and honest labels for all interviews. _Modifies: AgendaPage._
- [x] **Public notes clarity**: Label public notes as candidate-visible and block obvious internal terms. _Modifies: modal and service._

## Verification
- [x] **Tests**: Add backend and frontend coverage for RBAC, link validation, labels, and period behavior.
- [x] **Targeted validation**: Run relevant backend/frontend tests.
