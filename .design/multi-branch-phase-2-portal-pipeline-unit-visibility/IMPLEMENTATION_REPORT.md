# Phase 2 — Multi-Branch Unit Visibility: Implementation Report

**Date:** 2026-06-17  
**Status:** COMPLETE  
**Branch:** save/behavioral-ai-and-wips

---

## Scope Delivered

### Parte 1 — Public job detail exposes `job_units`

**File:** `backend/src/interface/api/schemas/public_schemas.py`
- Added `PublicJobUnitResponse(id, public_name, city, state, address, reference_point)`
- Added `job_units: list[PublicJobUnitResponse]` to `PublicJobDetailResponse`

**File:** `backend/src/interface/api/routers/public_candidate_portal.py`
- `get_public_job_detail` now queries active units via `SELECT_FROM(JobUnitModel).JOIN(OperationalUnitModel)`.
- `id` field returns `OperationalUnitModel.id` (what the candidate sends back as `preferred_unit_id`).
- Only active units (`is_active=True` on both sides) are exposed.
- Name uses `COALESCE(public_name, name)` — no Protheus codes exposed.

**Key fix:** `.select_from(JobUnitModel)` required for SQLAlchemy to resolve the join direction.

---

### Parte 2 — Portal candidato: unit selector UI

**File:** `candidate-portal/src/pages/ApplicationFormPage.tsx`
- **0 units:** no UI change.
- **1 unit:** informative blue card showing `public_name`, city/state, reference_point.
- **2+ units:** mandatory radio selector "Posto/unidade de preferência" with visual selection state.
- Review step (Step 3): shows selected unit name when `preferred_unit_id` is set.
- `advance(2, ...)` button wrapped in closure `(f) => validateStep1(f, jobUnitsCount)`.

---

### Parte 3 — Backend public apply: preferred_unit_id validation

**File:** `backend/src/interface/api/routers/public.py`
- Added `preferred_unit_id: UUID | None = Form(default=None)` to `apply()`.

**File:** `backend/src/application/services/public_application_service.py`
- Queries `active_unit_ids` (OperationalUnitModel IDs via JobUnitModel).
- 2+ units, no `preferred_unit_id` → 422 "Selecione um posto/unidade de preferência".
- 1 unit, no `preferred_unit_id` → auto-fills from the single active unit.
- `preferred_unit_id` not in job's units → 422 "A unidade selecionada não pertence a esta vaga."
- Creates/upserts `CandidateApplicationModel` with `preferred_unit_id` and `source='web_portal'`.
- Passes `operational_unit_id=preferred_unit_id` to both `create_entry` and `reactivate_entry`.

---

### Parte 4 — Pipeline filter: `?operational_unit_id=<uuid>`

**File:** `backend/src/interface/api/schemas/pipeline_schemas.py`
- Added `operational_unit_id: UUID | None = None` to `PipelineBoardFilters`.
- Added `unit_name: str | None = None` and `operational_unit_id: UUID | None = None` to `JobMatchCandidateResponse`.

**File:** `backend/src/interface/api/routers/pipeline.py`
- Added `operational_unit_id: UUID | None = Query(default=None)` to `get_pipeline_board`.

**File:** `backend/src/application/services/pipeline_service.py`
- Passes `operational_unit_id` to repository.
- Maps `unit_name` and `operational_unit_id` in `_row_to_match_response`.

**File:** `backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py`
- Added `LEFT OUTER JOIN OperationalUnitModel` on `CandidateJobPipelineModel.operational_unit_id`.
- Selects `COALESCE(public_name, name)` as `unit_name`.
- Applies `WHERE operational_unit_id = :id` when filter is set.

---

### Parte 5 — Pipeline frontend: unit display + filter

**File:** `frontend/src/types/domain.ts`
- Added `unit_name?: string | null` and `operational_unit_id?: string | null` to `JobCandidate`.
- Added `operational_unit_id?: string` to `PipelineBoardFilters`.

**File:** `frontend/src/services/jobsService.ts`
- Maps `unit_name` and `operational_unit_id` from board response.
- Adds `operational_unit_id` to URL query when set.

**File:** `frontend/src/components/kanban/KanbanCard.tsx`
- Shows "Unidade: X" when `candidate.unit_name` is not null.

**File:** `frontend/src/pages/PipelinePage.tsx`
- Derives `boardUnits` (unique id/name pairs) from board candidates.
- Shows unit filter dropdown only when `boardUnits.length >= 2`.
- `operational_unit_id` counted in `activeFiltersCount`.
- Cleared in `handleClearBoardFilters`.

**File:** `frontend/src/features/pipeline/pipelinePageUtils.ts`
- `readPipelineBoardFilters` now reads `operational_unit_id` from URL params.

---

### Parte 6 — Label standardization

- Staff: "Unidade" (compact display on kanban cards, filter label).
- Portal: "Posto/unidade de preferência" (selector label, review row).

---

### Parte 7 — Tests

**Backend (7/7 pass):**
1. `test_public_job_detail_returns_job_units` — GET returns `job_units`
2. `test_apply_2_units_requires_preferred_unit_id` — 422 when missing
3. `test_apply_rejects_wrong_preferred_unit_id` — 422 for wrong UUID
4. `test_apply_1_unit_autofills_preferred_unit_id` — pipeline row gets the unit
5. `test_apply_without_units_works` — no regression for legacy jobs
6. `test_pipeline_filter_by_operational_unit_id` — returns only unit_a rows
7. `test_pipeline_no_filter_returns_all` — returns rows from all units

File: `backend/tests/integration/test_phase2_public_units_and_pipeline_filter.py`

**Frontend (6/6 pass):**
- Portal (3): `publicJobsService.phase2.test.ts` — maps job_units, falls back to `[]`, preserves public_name
- Staff (3): `pipelinePageUtils.phase2.test.ts` — reads `operational_unit_id` from URL, handles absent/empty

---

## Rules Compliance

| Rule | Status |
|------|--------|
| Não implementar bot/WhatsApp/RAG/multiagent/Protheus real | ✅ |
| Não criar campos de código Protheus | ✅ |
| Não alterar uniqueness de candidatura | ✅ |
| Não refatorar arquitetura inteira do portal | ✅ |
| Não quebrar candidaturas antigas (0 units = no validation) | ✅ |
| Não expor dados internos sensíveis no endpoint público | ✅ (COALESCE public_name, no codes) |
| Não expor código interno Protheus no portal | ✅ |

---

## Pre-existing Test Failure (NOT caused by Phase 2)

`tests/test_public_application.py::test_apply_rejects_invalid_file` was already failing before Phase 2: error message mismatch `'Tipo de arquivo não permitido'` vs `'Apenas arquivos PDF são permitidos.'`. File not modified by this phase.
