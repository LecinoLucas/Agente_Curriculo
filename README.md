# Admissão RH / Agente Currículo

Sistema ATS (Applicant Tracking System) com IA para triagem de currículos, análise comportamental, pipeline de seleção e integração com o ERP Protheus para pré-admissão e admissão de candidatos.

---

## Visão Geral

O sistema automatiza o fluxo de recrutamento e seleção: desde a divulgação de vagas e candidatura pública, passando por triagem e análise com IA, pipeline de pipeline de etapas, até a admissão com geração de pacotes e envio para o Protheus (TOTVS). Há um assistente de IA com RAG para apoio ao time de RH e um portal separado para o candidato.

---

## Apps do Monorepo

| App | Caminho | Stack | Papel |
|---|---|---|---|
| **Backend ATS** | `backend/` | Python · FastAPI · SQLAlchemy · Alembic · Celery | API principal + workers + orquestração de IA |
| **Frontend Staff** | `frontend/` | React · Vite · TypeScript · Tailwind | Painel interno do time de RH |
| **Candidate Portal** | `candidate-portal/` | React · Vite · TypeScript · Tailwind | Portal público do candidato |

---

## Mapa Rápido de Pastas

```
Agente_Curriculo/
├── backend/                  # API ATS (Python/FastAPI) — Clean Architecture
│   ├── src/
│   │   ├── domain/           # entidades, value objects, regras puras
│   │   ├── application/      # use_cases, services (regra de negócio), ports, dtos
│   │   ├── infrastructure/   # repositories, db, ai, queue, storage, email, pdf
│   │   ├── interface/        # api (routers/main) + workers
│   │   ├── ai_orchestration/ # assistant, agents, rag, behavioral, analysis, jobs, tools
│   │   └── core/             # config/cross-cutting
│   ├── alembic/              # migrations (alembic.ini na raiz do backend)
│   ├── tests/                # unit, integration, e2e
│   ├── scripts/              # seeds, bootstrap, reset, preflight
│   └── docs/                 # documentação operacional do backend
│
├── frontend/                 # Staff/RH (React + Vite)
│   ├── src/
│   │   ├── app/              # AppRouter + ProtectedRoute
│   │   ├── features/         # 16 features (jobs, pipeline, skills, admission…)
│   │   ├── pages/            # ~40 páginas de topo
│   │   ├── services/         # 46 clients de API
│   │   └── legacy/           # código congelado (não importar)
│   └── e2e/                  # Playwright (10 specs)
│
├── candidate-portal/         # Portal do candidato (React + Vite)
│   └── src/{pages,routes,services,components,hooks}
│
├── docs/                     # Documentação canônica (architecture / deploy / decisions)
├── .design/                  # Relatórios de fase, auditorias e decisões históricas
├── workflows/                # Guias de processo e mapa de páginas
├── scripts/                  # dev-full.sh, docker-full.sh, validadores de boot
├── e2e/                      # Playwright cross-app (13 specs, raiz)
├── docker-compose.local.yml  # Orquestração Docker local (raiz)
└── package.json              # Scripts de subida (dev:full, docker:full…)
```

---

## Onde Mexer

| Quero mexer em... | Vá em... |
|---|---|
| **Backend API (rotas)** | `backend/src/interface/api/routers/` · entrada: `backend/src/interface/api/main.py` |
| **Regra de negócio** | `backend/src/application/services/` · `backend/src/application/use_cases/` |
| **Modelos / entidades** | `backend/src/domain/entities/` · persistência: `backend/src/infrastructure/repositories/` |
| **Workers / filas** | `backend/src/interface/workers/` |
| **Vagas / Jobs** | back: `application/services/job_service.py`, `routers/jobs.py`, `ai_orchestration/jobs/` · front: `frontend/src/features/jobs/`, `pages/VagasPage.tsx` |
| **Skills / catálogo** | back: `application/services/skill_catalog_service.py`, `routers/skills.py` · front: `frontend/src/features/skills/`, `pages/SkillsPage.tsx` |
| **Pipeline** | back: `application/services/pipeline_service.py`, `routers/pipeline.py` · front: `frontend/src/features/pipeline/`, `pages/PipelinePage.tsx` |
| **Análise IA** | back: `application/services/analysis_service.py`, `ai_orchestration/analysis/` · front: `frontend/src/features/analyses/`, `pages/AnalisesIaPage.tsx` |
| **Pré-admissão** | back: `application/services/pre_admission_service.py`, `routers/pre_admission.py` · front staff: `pages/PreAdmissionChecklistsPage.tsx` · portal: `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx` |
| **Admissão** | back: `admission_case_workspace_service.py`, `routers/admissions.py` · front: `frontend/src/features/admission-workspace/`, `pages/AdmitidosPage.tsx` |
| **Protheus (integração ERP)** | back: `application/services/protheus_*.py` + `erp_integration_service.py` + `ai_orchestration/tools/protheus_tools.py` · front: `frontend/src/features/admission-workspace/AdmissionProtheusIntegrationPanel.tsx` |
| **AI Assistant / RAG** | back: `application/services/conversation_service.py`, `ai_orchestration/{assistant,agents,rag}/`, `routers/ai_assistant.py` · front: `frontend/src/features/ai-assistant/`, `pages/AssistantAdminPage.tsx` |
| **Frontend Staff** | `frontend/src/` — rotas em `app/AppRouter.tsx`, telas em `pages/`, features em `features/` |
| **Portal do candidato** | `candidate-portal/src/` — rotas em `routes/CandidatePortalRouter.tsx`, telas em `pages/` |

---

## Como Rodar Local

> Requer Node.js, Python 3.11+, PostgreSQL e Redis rodando localmente. Configure `.env` antes de subir.

```bash
# Stack completa (backend + frontend staff + candidate portal)
npm run dev:full

# Apps isolados
npm run dev:backend
npm run dev:staff
npm run dev:candidate
```

`npm run dev:full` executa `bash scripts/dev-full.sh`, que sobe os três processos com um único comando.

---

## Como Rodar com Docker

```bash
docker compose -f docker-compose.local.yml up -d --build --force-recreate
```

Serviços orquestrados:

| Serviço | Papel |
|---|---|
| `postgres` | Banco de dados PostgreSQL |
| `redis` | Cache e fila (Celery broker) |
| `backend-api` | API FastAPI |
| `celery-worker` | Worker de tarefas assíncronas |
| `celery-beat` | Agendador de tarefas Celery |
| `frontend-staff` | Painel do RH (servido via Nginx) |
| `candidate-portal` | Portal do candidato (servido via Nginx) |

> Variáveis de ambiente: `.env.docker.example` é o template versionado. Copie para `.env.docker.local` e ajuste.

---

## Migrations

**Local:**
```bash
cd backend && alembic upgrade head
```

**Docker:**
```bash
docker compose -f docker-compose.local.yml run --rm backend-api alembic upgrade head
```

Configuração: `backend/alembic.ini` · Versões: `backend/alembic/versions/`

> Nunca edite migrations antigas sem diagnóstico. Não use `down -v` sem saber que apaga o banco Docker.

---

## Logs Úteis

```bash
docker compose -f docker-compose.local.yml logs -f backend-api
docker compose -f docker-compose.local.yml logs -f celery-worker
docker compose -f docker-compose.local.yml logs -f frontend-staff
```

---

## Testes

> Os comandos abaixo podem variar conforme a fase de desenvolvimento. Verifique `backend/docs/testing.md` para a estratégia completa.

**Backend:**
```bash
cd backend && pytest                        # suite completa (com cobertura)
cd backend && pytest tests/unit             # unitários
cd backend && pytest tests/integration      # integração
cd backend && pytest -m postgres            # requer Postgres real
```

**Frontend Staff:**
```bash
cd frontend && npm test                     # vitest
npx playwright test --config frontend/playwright.config.ts   # e2e
```

**Candidate Portal:**
```bash
cd candidate-portal && npm test
```

**E2E cross-app (raiz):**
```bash
npx playwright test                         # usa playwright.config.ts da raiz
```

---

## Documentação

| Local | O que tem |
|---|---|
| `backend/docs/` | Referência operacional do backend (setup, regras de negócio, testing, migrations) |
| `docs/architecture/` | Glossário de scoring, ADRs, visão de camadas |
| `docs/deploy/` | Guia Docker local, variáveis de ambiente, runbooks |
| `workflows/PAGES_MAP.md` | Mapa de páginas e rotas do frontend |
| `workflows/PROJECT_WORKFLOW.md` | Fluxo de trabalho e processo de desenvolvimento |
| `.design/` | Relatórios de fase, auditorias e decisões históricas — acervo somente leitura |

---

## Cuidados para IA / Codex

- **Não mexer em `candidate-portal/`** quando a tarefa for de frontend staff, e vice-versa.
- **Não mexer em Protheus** (`protheus_*.py`, `erp_integration_service.py`) se a fase for de IA/skills — são domínios diferentes.
- **Não mover arquivos** sem uma fase específica que autorize reorganização.
- **Não apagar relatórios `.design/`** sem auditoria — são histórico de decisões.
- **Não editar migrations antigas** (`backend/alembic/versions/`) sem diagnóstico do impacto.
- **Não usar `docker compose down -v`** sem saber que isso apaga os volumes (banco de dados) do Docker.
- **`frontend/src/legacy/`** está congelado — não importar de lá.
- **`skills advpl/`** é material de desenvolvimento ADVPL/Protheus (domínio separado) — não confundir com as skills do ATS.

---

## Status Atual

O repositório foi auditado em 2026-06-14. A estrutura de código de produção está saudável; o backend segue Clean Architecture bem definida. Os principais pontos de atenção identificados são documentacionais e de higiene de versionamento.

Fontes da auditoria:
- `.design/repo-structure-audit-1/REPO_STRUCTURE_AUDIT.md` — relatório completo com riscos e recomendações
- `.design/repo-structure-audit-1/QUICK_MAP.md` — guia rápido de navegação (canônico para IA)
