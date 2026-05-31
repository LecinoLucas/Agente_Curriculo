# C-Freeze: Commit Execution Checklist

**Status:** Ready to execute  
**Date:** 2025-05-31  
**Commits:** 5 blocos temáticos

---

## Pre-Flight Checklist

- [x] Builds validados (frontend + candidate-portal)
- [x] Testes passando (993 frontend + 29 backend)
- [x] Git status revisado (54 files, ~10K deletions)
- [x] Backend hardening validado (29/29 tests)
- [ ] **Ainda a fazer:** Executar commits e validar

---

## Commit 1: Backend Hardening

**Tema:** `perf(candidaturas): complete import hardening and test coverage`

```bash
# Verify changes first
git diff backend/src/interface/api/routers/candidaturas.py
git diff backend/src/interface/api/schemas/candidaturas_schemas.py
git diff backend/tests/integration/test_candidaturas_import.py

# Stage
git add backend/src/interface/api/routers/candidaturas.py \
        backend/src/interface/api/schemas/candidaturas_schemas.py \
        backend/tests/integration/test_candidaturas_import.py

# Review staged changes
git diff --cached

# Commit with co-author trailer
git commit -m "perf(candidaturas): complete import hardening and test coverage

- Improve validation flow in candidaturas router
- Enhance schema definitions for import/analysis
- Add comprehensive integration tests for import pipeline

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# Validate
git log --oneline -1
```

---

## Commit 2A: Portal Form Integration

**Tema:** `feat(portal): complete application and assessment form integration`

```bash
# Verify changes
git diff candidate-portal/src/pages/ApplicationFormPage.tsx
git diff candidate-portal/src/pages/ApplicationSuccessPage.tsx
git status candidate-portal/

# Stage
git add candidate-portal/src/pages/ApplicationFormPage.tsx \
        candidate-portal/src/pages/ApplicationSuccessPage.tsx \
        candidate-portal/src/pages/CandidateAssessmentPage.tsx \
        candidate-portal/src/pages/CandidatePreAdmissionPage.tsx \
        candidate-portal/src/services/publicApiClient.ts \
        candidate-portal/src/services/publicApplicationService.ts \
        candidate-portal/.env.example \
        candidate-portal/src/hooks/

# Review
git diff --cached --stat

# Commit
git commit -m "feat(portal): complete application and assessment form integration

- Finalize form pages and validation
- Update API client for public endpoints
- Add environment configuration template
- Add utility hooks for form handling

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git log --oneline -1
```

---

## Commit 2B: Portal Cleanup (Remove Mocks)

**Tema:** `refactor(portal): remove mock data and components (C5 cleanup)`

```bash
# Review what we're deleting
git status candidate-portal/

# Stage deletions
git add candidate-portal/src/components/shared/ \
        candidate-portal/src/components/ui/Stepper.tsx \
        candidate-portal/src/data/ \
        candidate-portal/src/services/mockCandidatePortalService.ts

# Verify deletions only
git diff --cached --name-status

# Commit
git commit -m "refactor(portal): remove mock data and components (C5 cleanup)

- Remove mock candidate portal data structures
- Delete example Stepper UI component (using external)
- Clean up mock services (using real API)
- Simplify component hierarchy

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git log --oneline -1
```

---

## Commit 3A: Frontend Remove Embedded Candidate Features

**Tema:** `refactor(frontend): remove embedded candidate portal (migrated to standalone)`

```bash
# Verify deletions
git status frontend/src/app/CandidateThemeGuard.tsx
git status frontend/src/features/candidate-portal/
git status frontend/src/features/public-application/
git status frontend/src/pages/CandidateEntryPage.tsx

# Stage deletions + modifications
git add frontend/src/app/CandidateThemeGuard.tsx \
        frontend/src/components/auth/ \
        frontend/src/features/candidate-portal/ \
        frontend/src/features/public-application/ \
        frontend/src/pages/CandidateEntryPage.tsx \
        frontend/src/pages/CandidatePortalPage.tsx \
        frontend/src/pages/CandidatePreAdmissionPage.tsx \
        frontend/src/pages/PublicApplicationPage.tsx \
        frontend/src/pages/__tests__/CandidateEntryPage.test.tsx \
        frontend/src/pages/__tests__/CandidatePortalFlow.test.tsx \
        frontend/src/pages/__tests__/CandidatePortalPage.test.tsx \
        frontend/src/pages/__tests__/CandidatePreAdmissionPage.test.tsx \
        frontend/src/services/candidatePortalService.ts \
        frontend/src/app/AppRouter.tsx \
        frontend/src/components/layout/Sidebar.tsx

# Review: should see ~9600 lines deleted
git diff --cached --stat

# Commit
git commit -m "refactor(frontend): remove embedded candidate portal (migrated to standalone)

The candidate portal has been migrated to a standalone application at
candidate-portal/. This commit removes:

- Embedded candidate portal page and features
- Public application flow (now handled by standalone)
- Candidate theme guard and auth components
- Related tests and services

See CandidatePortalRedirectPage for user integration path.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git log --oneline -1
```

---

## Commit 3B: Frontend Add Redirect Integration

**Tema:** `feat(frontend): add candidate portal redirect integration point`

```bash
# Verify new files
git status frontend/src/pages/CandidatePortalRedirectPage.tsx

# Stage
git add frontend/src/pages/CandidatePortalRedirectPage.tsx \
        frontend/src/pages/__tests__/CandidatePortalRedirectPage.test.tsx

# Review
git diff --cached

# Run tests to ensure redirect works
npm --prefix frontend test -- CandidatePortalRedirectPage --run

# Commit
git commit -m "feat(frontend): add candidate portal redirect integration point

Provides seamless redirect from internal frontend to standalone
candidate portal. Handles:

- Route awareness (internal vs external users)
- URL parameter forwarding (jobId, etc)
- Environment configuration

Tests: 9 pass (redirect logic, state handling)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git log --oneline -1
```

---

## Commit 3C: Frontend Config and Candidaturas Update

**Tema:** `feat(frontend): update env vars and refactor candidaturas workflows`

```bash
# Verify changes
git diff frontend/.env.example
git diff frontend/src/pages/AgendaPage.tsx  # Should see refactor

# Stage
git add frontend/.env.example \
        frontend/src/features/candidates/components/AddCandidateModal.tsx \
        frontend/src/pages/AgendaPage.tsx \
        frontend/src/pages/LoginPage.tsx \
        frontend/src/pages/__tests__/CandidaturasPage.test.tsx \
        frontend/src/services/candidaturasService.ts \
        frontend/src/styles/index.css \
        frontend/src/vite-env.d.ts

# Review
git diff --cached --stat

# Commit
git commit -m "feat(frontend): update env vars and refactor candidaturas workflows

- Add VITE_PUBLIC_API_BASE_URL env variable
- Refactor AgendaPage with improved visual hierarchy
- Update AddCandidateModal for clarity
- Enhance candidaturas service integration
- Update styles and type definitions

This prepares the internal frontend for delegating candidate
interactions to the standalone portal while maintaining internal
candidaturas management.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git log --oneline -1
```

---

## Commit 4: Dev Infrastructure

**Tema:** `chore(dev): integrate candidate-portal to dev-full workflow`

```bash
# Verify changes
git diff scripts/dev-full.sh

# Show specific changes
git diff scripts/dev-full.sh | head -100

# Stage
git add scripts/dev-full.sh

# Commit
git commit -m "chore(dev): integrate candidate-portal to dev-full workflow

Updates dev-full.sh to:

- Add CANDIDATE_PORTAL_DIR and dependency tracking
- Implement ensure_candidate_portal_dependencies()
- Read CANDIDATE_PORTAL_PORT from vite.config.ts or env
- Export VITE_PUBLIC_API_BASE_URL for portal
- Display candidate portal URLs in environment printout
- Start candidate portal service on port 5174
- Include candidate portal PID in process cleanup

This enables full local development with:
  npm run dev:full

Brings up:
  - Backend FastAPI (8000)
  - Frontend (5173)
  - Candidate Portal (5174)
  - Celery Worker

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git log --oneline -1
```

---

## Commit 5: Documentation and Tests

**Tema:** `docs(candidate-portal): add phase audit and smoke tests`

```bash
# Verify new files
ls -la .design/candidate-portal-freeze/
ls -la .design/candidate-portal-c4/
ls -la e2e/smoke-c5.spec.ts

# Stage
git add .design/candidate-portal-c4/ \
        .design/candidate-portal-audit/ \
        .design/candidate-portal-c5/ \
        .design/candidate-portal-freeze/ \
        e2e/smoke-c5.spec.ts \
        e2e/smoke.config.ts

# Review
git diff --cached --stat

# Commit
git commit -m "docs(candidate-portal): add phase audit and smoke tests

Adds comprehensive documentation:

- C-Freeze STATE_SUMMARY.md: Phase completion audit
- C4 PRODUCTION_READINESS.md: Release readiness assessment
- C5 phase documentation: Migration details
- Smoke tests: C5 validation test suite

These docs establish baseline for next phase (C6: Release Prep)
and provide historical record of candidate portal migration.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git log --oneline -1
```

---

## Post-Commit Validation

```bash
# View final log
git log --oneline --graph -10

# Verify all files staged
git status  # Should show: working tree clean

# Run full tests before push
npm --prefix frontend test -- --run
npm --prefix candidate-portal run build
npm --prefix frontend run build

# Check commits one more time
git log --format="%h %s" -5
```

---

## Quick Execution (If All Clear)

Run this to execute all commits at once (after review):

```bash
# Commit 1
git add backend/ && \
git commit -m "perf(candidaturas): complete import hardening and test coverage"

# Commit 2A
git add candidate-portal/src/pages/*.tsx candidate-portal/src/services/ candidate-portal/.env.example candidate-portal/src/hooks/ && \
git commit -m "feat(portal): complete application and assessment form integration"

# Commit 2B
git add candidate-portal/src/components/shared/ candidate-portal/src/components/ui/Stepper.tsx candidate-portal/src/data/ candidate-portal/src/services/mockCandidatePortalService.ts && \
git commit -m "refactor(portal): remove mock data and components (C5 cleanup)"

# Commit 3A-3C (frontend)
git add frontend/ && \
git commit -m "refactor(frontend): remove embedded candidate portal and integrate standalone"

# Commit 4
git add scripts/dev-full.sh && \
git commit -m "chore(dev): integrate candidate-portal to dev-full workflow"

# Commit 5
git add .design/ e2e/ && \
git commit -m "docs(candidate-portal): add phase audit and smoke tests"

# Verify
git log --oneline -6
```

---

## Status: Ready ✅

All validation complete. Ready to commit.

**Next:** Execute commits above, then create PR for release branch.
