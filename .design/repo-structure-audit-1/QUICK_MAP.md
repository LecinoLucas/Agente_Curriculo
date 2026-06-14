# QUICK MAP — Guia Rápido (humanos + IA)

> Mapa de "onde mexer". Para detalhes e riscos, ver `REPO_STRUCTURE_AUDIT.md`.
> Monorepo com 3 apps: **backend** (FastAPI), **frontend** staff (React) e **candidate-portal** (React).

## Onde mexer

| Quero mexer em... | Vá em... |
|---|---|
| **Backend API (rotas)** | `backend/src/interface/api/routers/` · entrada: `backend/src/interface/api/main.py` |
| **Regra de negócio (backend)** | `backend/src/application/services/` (services) e `backend/src/application/use_cases/` |
| **Modelos/entidades** | `backend/src/domain/entities/` · persistência: `backend/src/infrastructure/repositories/` |
| **Workers / filas** | `backend/src/interface/workers/` |
| **Jobs / vagas** | back: `application/services/job_service.py`, `routers/jobs.py`, `ai_orchestration/jobs/` · front: `frontend/src/features/jobs/`, `pages/JobFormPage.tsx`, `VagasPage.tsx` |
| **Skills / catálogo** | back: `application/services/skill_catalog_service.py`, `skill_equivalence_service.py`, `routers/skills.py` · front: `frontend/src/features/skills/`, `pages/SkillsPage.tsx` |
| **Pipeline** | back: `application/services/pipeline_service.py`, `pipeline_gate_evaluator.py`, `routers/pipeline.py` · front: `frontend/src/features/pipeline/`, `pages/PipelinePage.tsx` |
| **Admissão** | back: `admission_case_workspace_service.py`, `routers/admissions.py` · front: `frontend/src/features/admission-workspace/`, `pages/AdmitidosPage.tsx` |
| **Pré-admissão** | back: `application/services/pre_admission_service.py`, `routers/pre_admission.py` · front staff: `pages/PreAdmissionChecklistsPage.tsx` · portal: `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx` |
| **Protheus (integração/bridge)** | `backend/src/application/services/protheus_*.py` + `erp_integration_service.py` + `ai_orchestration/tools/protheus_tools.py` · UI: `frontend/src/features/admission-workspace/AdmissionProtheusIntegrationPanel.tsx` (⚠️ há duplicata em `candidates/drawer/components/`) |
| **AI assistant** | back: `application/services/conversation_service.py`, `admin_assistant_service.py`, `ai_orchestration/{assistant,agents,rag}/`, `routers/ai_assistant.py` · front: `frontend/src/features/ai-assistant/`, `pages/AssistantAdminPage.tsx` |
| **Candidate drawer** | `frontend/src/features/candidates/drawer/` (⚠️ versão antiga congelada em `frontend/src/legacy/candidate-drawer/` — não importar) |
| **Admin / settings** | back: routers `admin_*`, `system_health_service.py`, `ai_provider_credential_service.py` · front: `frontend/src/features/admin/`, `pages/AdminPage.tsx`, `SystemHealthPage.tsx`, `AIUsageCenterPage.tsx` |
| **Frontend staff** | `frontend/src/` — rotas em `app/AppRouter.tsx`, telas em `pages/`, features em `features/` |
| **Portal do candidato** | `candidate-portal/src/` — rotas em `routes/CandidatePortalRouter.tsx`, telas em `pages/`, API em `services/` |
| **Migrations** | `backend/alembic/versions/` (config `backend/alembic.ini`) |

## Como rodar

| Tarefa | Comando |
|---|---|
| **Local (stack completa)** | `npm run dev:full` (= `bash scripts/dev-full.sh`) |
| Local (isolado) | `npm run dev:backend` · `npm run dev:staff` · `npm run dev:candidate` |
| Backend direto | `cd backend && uvicorn src.interface.api.main:app --reload` |
| **Docker** | `npm run docker:full` (= `bash scripts/docker-full.sh`) · backend: `backend/docker-compose.yml` (postgres/redis/api/worker) |
| **Migrations** | `cd backend && alembic upgrade head` |
| Seed / bootstrap | `cd backend && python scripts/bootstrap_dev.py` · admin: `python scripts/seed_dev_admin.py` |
| **Testes backend** | `cd backend && pytest` (unit: `pytest tests/unit` · integration: `pytest tests/integration` · postgres: `pytest -m postgres`) |
| **Testes frontend** | `cd frontend && npm test` (vitest) |
| **Testes portal** | `cd candidate-portal && npm test` |
| **E2E (Playwright)** | `npx playwright test` (configs: raiz, `frontend/`, `candidate-portal/`) |

## Fontes oficiais para a IA

- **Canônico:** `backend/docs/` · `docs/architecture/` · `docs/deploy/` · `workflows/PAGES_MAP.md` · este `QUICK_MAP.md`
- **Histórico (não tratar como verdade atual):** `.design/*` (161 fases) · arquivos `FASE_*`/`documentacao.md` soltos na raiz
- **Domínio separado (não é o ATS):** `skills advpl/`, `*-advpl.md`
