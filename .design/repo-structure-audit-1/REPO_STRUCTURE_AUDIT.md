# Auditoria Estrutural do Repositório — Admissão RH / Agente Currículo

> **Tipo:** Auditoria SOMENTE LEITURA. Nenhum arquivo de produção foi alterado, movido, renomeado ou apagado.
> **Data:** 2026-06-14
> **Branch auditada:** `save/behavioral-ai-and-wips`
> **Arquivos rastreados (git):** 2.590

---

## 1. Sumário Executivo

O repositório é um **monorepo** que reúne, no mesmo diretório, quatro projetos
de software e um corpo grande de documentação de fases:

| Projeto / Bloco | Caminho | Stack | Papel |
|---|---|---|---|
| **Backend ATS** | `backend/` | Python (FastAPI, SQLAlchemy, Alembic, Celery/queue) | API principal + workers + IA |
| **Frontend Staff (RH)** | `frontend/` | React + Vite + TypeScript + Tailwind | Painel interno do RH |
| **Candidate Portal** | `candidate-portal/` | React + Vite + TypeScript + Tailwind | Portal público do candidato |
| **Docs / Design** | `docs/`, `.design/`, `workflows/` | Markdown | Documentação e planos de fase |
| **ADVPL / Protheus dev** | `skills advpl/`, `*-advpl.md` | Conteúdo de domínio Protheus | Material separado, não é a aplicação |

**Arquitetura do backend:** Clean Architecture bem definida em camadas
(`domain` → `application` → `infrastructure` → `interface`), com 1.101 arquivos
rastreados. É a parte mais madura e organizada do repositório.

**Integração Protheus:** está **dentro** do backend ATS (camada
`application/services/protheus_*` + ferramenta de IA), **não** é um projeto
"bridge" separado. Há apenas 14 arquivos diretamente nomeados `protheus`.

**Principais riscos encontrados:**
1. **Não existe README na raiz** — não há porta de entrada para humanos nem IA.
2. **161 pastas de fase** em `.design/` (586 arquivos) — acúmulo histórico que
   dificulta achar a documentação "oficial" atual.
3. **Artefatos locais versionados** que deveriam estar fora do git
   (`backend/test_transfer.db` com 556 KB, `backend/test_run.db`,
   `backend/full_output.txt`, `backend/.seeded`, 33 PNGs em `.tmp-smoke/`).
4. **Duplicação real** do componente `AdmissionProtheusIntegrationPanel.tsx`
   (existe em `admission-workspace/` e em `candidates/drawer/components/`).
5. **Mistura de domínios**: material de desenvolvimento ADVPL/Protheus
   (`skills advpl/`, `AGENTS0-advpl.md`, `CLAUDE-advpl.md`) convive com o ATS.

Nenhum desses pontos exige ação imediata destrutiva; são candidatos a uma fase
futura de organização. A estrutura de código de produção está saudável.

---

## 2. Árvore Resumida do Projeto

```
Agente_Curriculo/
├── backend/                  # API ATS (Python / FastAPI) — Clean Architecture
│   ├── src/
│   │   ├── domain/           # entidades, value objects, regras puras
│   │   ├── application/      # use_cases, services (regra de negócio), ports, dtos
│   │   ├── infrastructure/   # repositories, db, ai, queue, storage, email, pdf
│   │   ├── interface/        # api (routers/main) + workers
│   │   ├── ai_orchestration/ # assistant, agents, rag, behavioral, analysis, jobs, tools
│   │   ├── core/             # config/cross-cutting
│   │   └── observability/
│   ├── alembic/              # migrations (34 versions + archived_versions)
│   ├── tests/                # 258 arquivos de teste (unit 103, integration 143, e2e 2)
│   ├── scripts/              # seeds, bootstrap, reset, perf, validações
│   ├── docs/                 # docs operacionais do backend
│   └── docker-compose.yml, Dockerfile, pyproject.toml, alembic.ini
│
├── frontend/                 # Staff/RH (React + Vite)
│   ├── src/
│   │   ├── app/              # AppRouter, ProtectedRoute (entrada de rotas)
│   │   ├── features/         # 16 features (jobs, pipeline, skills, admission, ai-assistant…)
│   │   ├── pages/            # ~40 páginas de topo
│   │   ├── shared/           # auth, components, hooks, status, utils compartilhados
│   │   ├── components/       # ui, kanban, charts, layout, admin, job…
│   │   ├── services/         # 46 clients de API
│   │   └── legacy/           # código congelado (candidate-drawer) — guardado por teste
│   └── e2e/ (10 specs), Dockerfile, vite.config.ts
│
├── candidate-portal/         # Portal do candidato (React + Vite)
│   └── src/{pages,routes,services,components,hooks,types,utils}
│
├── docs/                     # architecture / deploy / implementation (phases, audits…)
├── .design/                  # 161 pastas de fase (planos/relatórios) — acúmulo histórico
├── workflows/                # PAGES_MAP, PROJECT_WORKFLOW, ai-design-workflow…
├── e2e/                      # Playwright na raiz (fluxos cross-app, 13 specs)
├── scripts/                  # dev-full.sh, docker-full.sh, validadores de boot
├── skills/  .agents/skills/  # skills de agente (symlinks)
├── skills advpl/             # material ADVPL/Protheus (domínio separado)
├── database/  uploads/  workflows/
├── docker-compose.local.yml  # orquestração local raiz
├── package.json              # scripts de subida (dev:full, docker:full…)
└── (raiz solta) AGENTS0-advpl.md, CLAUDE-advpl.md, FASE_20_FLOWCHART.txt,
    FIX_PUBLIC_APPLICATION_FKEY.md, clean_css.py, replace_tokens.py, documentacao.md
```

---

## 3. Mapa das Pastas Principais

| Pasta | Status | Para que serve |
|---|---|---|
| `backend/` | **Ativo (núcleo)** | API ATS, workers, IA, migrations, testes |
| `frontend/` | **Ativo** | Painel do RH (staff) |
| `candidate-portal/` | **Ativo** | Portal público do candidato |
| `docs/` | **Ativo** | Documentação canônica (architecture/deploy/implementation) |
| `.design/` | **Misto** | Planos/relatórios de 161 fases — muito legado histórico |
| `workflows/` | **Ativo (referência)** | Guias de processo e mapa de páginas |
| `e2e/` (raiz) | **Ativo** | Playwright de fluxos cross-app |
| `scripts/` (raiz) | **Ativo** | Subida local/Docker, validadores de boot |
| `skills/`, `.agents/` | **Ativo (tooling IA)** | Skills de agente (symlinks p/ `.agents/skills`) |
| `skills advpl/` | **Separado** | Conteúdo de desenvolvimento ADVPL/Protheus — não é o ATS |
| `database/`, `uploads/` | **Suporte** | Dados/uploads (uploads deve ser local-only) |
| `.tmp-smoke/`, `test-results/` | **Lixo/efêmero** | Screenshots e saídas de teste — não deveriam estar versionados |

---

## 4. Pontos de Entrada do Backend

| Aspecto | Caminho |
|---|---|
| **App FastAPI** | `backend/src/interface/api/main.py` → `app` |
| **Comando de subida** | `uvicorn src.interface.api.main:app` (ver `backend/Dockerfile:26`, `backend/docker-compose.yml:49`) |
| **Routers (≈45)** | `backend/src/interface/api/routers/` |
| **Middlewares** | `backend/src/interface/api/middlewares/` (audit, request_id, security_headers) |
| **Dependências/DI** | `backend/src/interface/api/dependencies.py` |
| **Rate limiting** | `backend/src/interface/api/rate_limiting.py` |
| **Workers (Celery/queue)** | `backend/src/interface/workers/` (analysis, matching, resume_extraction, behavioral_ai, document_ai…) |
| **Config** | `backend/src/core/` |
| **Migrations** | `backend/alembic/versions/` (`alembic upgrade head`) |

**Routers de destaque (módulos):** `auth.py`, `candidates.py`, `resumes.py`,
`analyses.py`, `jobs.py`, `pipeline.py`, `admissions.py`,
`admission_packages.py`, `pre_admission.py`, `applications.py`,
`candidaturas.py`, `skills.py`, `skill_equivalences.py`, `ai_assistant.py`,
`admin_assistant.py`, `admin_ai_*`, `behavioral_templates.py`,
`candidate_portal_*`, `public*`.

---

## 5. Pontos de Entrada dos Frontends

### Frontend Staff (`frontend/`)
| Aspecto | Caminho |
|---|---|
| Bootstrap | `frontend/src/main.tsx` |
| Roteamento | `frontend/src/app/AppRouter.tsx` + `ProtectedRoute.tsx` |
| Páginas | `frontend/src/pages/` (~40 `*Page.tsx`) |
| Features | `frontend/src/features/` (16 features) |
| API clients | `frontend/src/services/` (46 arquivos) |
| Build/dev | `vite.config.ts`; `npm run dev` / `npm run build` |

### Candidate Portal (`candidate-portal/`)
| Aspecto | Caminho |
|---|---|
| Bootstrap | `candidate-portal/src/main.tsx` → `App.tsx` |
| Roteamento | `candidate-portal/src/routes/CandidatePortalRouter.tsx` |
| Páginas | `candidate-portal/src/pages/` |
| API clients | `candidate-portal/src/services/` (publicApiClient, candidateAuthService, candidatePortalService, candidatePreAdmissionService…) |

---

## 6. Mapa dos Módulos Ativos

Backend = `application/services/` + `interface/api/routers/`.
Frontend = `frontend/src/features/` + páginas.

| Módulo | Backend (service/router) | Frontend (feature/página) |
|---|---|---|
| **auth** | `use_cases/auth/`, `routers/auth.py`, `user_security_service.py`, `staff_google_auth_service.py` | `features/auth/`, `pages/LoginPage.tsx`, `app/ProtectedRoute.tsx` |
| **candidates** | `candidate_service.py`, `candidate_note_service.py`, `routers/candidates.py` | `features/candidates/` + `drawer/`, `pages/CandidatesPage.tsx`, `CandidateProfilePage.tsx` |
| **resumes** | `resume_service.py`, `resume_profiler_service.py`, `routers/resumes.py` | dentro de candidates/analyses |
| **analyses** | `analysis_service.py` (77 KB), `analysis_dispatch_service.py`, `routers/analyses.py`, `ai_orchestration/analysis/` | `features/analyses/`, `pages/AnalisesIaPage.tsx`, `AnalisesIaComportamentalPage.tsx` |
| **jobs (vagas)** | `job_service.py`, `job_quality_validator_service.py`, `job_score_explanation_service.py`, `routers/jobs.py`, `ai_orchestration/jobs/` | `features/jobs/`, `pages/JobFormPage.tsx`, `VagasPage.tsx`, `CandidaturasPage.tsx` |
| **pipeline** | `pipeline_service.py` (57 KB), `pipeline_gate_evaluator.py`, `routers/pipeline.py` | `features/pipeline/`, `pages/PipelinePage.tsx` |
| **admission** | `admission_case_workspace_service.py` (35 KB), `admission_package_service.py`, `admitted_candidates_service.py`, `routers/admissions.py`, `admission_packages.py` | `features/admission-workspace/`, `pages/AdmissionCasePage.tsx`, `AdmitidosPage.tsx` |
| **pre-admission** | `pre_admission_service.py` (46 KB), `pre_admission_state_machine.py`, `pre_admission_checklist_template_service.py`, `routers/pre_admission.py` | `pages/PreAdmissionChecklistsPage.tsx`; portal: `CandidatePreAdmissionPage.tsx` |
| **protheus** | `protheus_adapter.py`, `protheus_real_adapter.py`, `protheus_payload_builder.py`, `protheus_payload_validator.py`, `erp_integration_service.py`, `ai_orchestration/tools/protheus_tools.py` | `admission-workspace/AdmissionProtheusIntegrationPanel.tsx` |
| **ai assistant** | `admin_assistant_service.py`, `conversation_service.py` (76 KB), `candidate_assistant_intent_service.py`, `ai_orchestration/{assistant,agents,rag}/`, `routers/ai_assistant.py`, `admin_assistant.py` | `features/ai-assistant/`, `features/ai-settings/`, `pages/AssistantAdminPage.tsx`, `KnowledgeAdminPage.tsx` |
| **skills/catalog** | `skill_catalog_service.py`, `skill_catalog_sync_service.py`, `skill_equivalence_service.py`, `skill_requirements_service.py`, `routers/skills.py`, `skill_equivalences.py` | `features/skills/`, `pages/SkillsPage.tsx` |
| **behavioral AI** | `behavioral_ai_evaluation_service.py` (59 KB), `behavioral_assignment_service.py`, `behavioral_template_service.py`, `routers/admin_behavioral_ai.py`, `behavioral_templates.py` | `features/behavioral-templates/`, `pages/BehavioralTemplate*Page.tsx` |
| **admin/settings** | `admin_bi_service.py`, `ai_provider_credential_service.py`, `ai_limit_override_service.py`, `system_health_service.py`, `audit_log_service.py`, routers `admin_*` | `features/admin/`, `pages/AdminPage.tsx`, `AdminBiPage.tsx`, `AIUsageCenterPage.tsx`, `SystemHealthPage.tsx`, `AuditLogsPage.tsx` |

---

## 7. Mapa dos Módulos Protheus

> **Conclusão:** a integração Protheus é parte do **backend ATS** (não há
> projeto/bridge separado). É um conjunto de adapters + payload + validação na
> camada de aplicação, mais uma ferramenta de IA. Total: 14 arquivos.

| Componente | Arquivo |
|---|---|
| Adapter (interface) | `backend/src/application/services/protheus_adapter.py` |
| Adapter real (HTTP/ERP) | `backend/src/application/services/protheus_real_adapter.py` |
| Builder de payload | `backend/src/application/services/protheus_payload_builder.py` |
| Validador de payload | `backend/src/application/services/protheus_payload_validator.py` |
| Integração ERP (orquestração) | `backend/src/application/services/erp_integration_service.py` (27 KB) |
| Ferramenta IA | `backend/src/ai_orchestration/tools/protheus_tools.py` |
| Regras de export (seed knowledge) | `backend/scripts/knowledge_seed_docs/protheus_export_rules.md` |
| Testes | `tests/integration/test_protheus_homolog_send.py`, `test_protheus_mock_integration.py`, `tests/unit/test_protheus_payload_builder_and_validator.py` |
| UI (painel) | `frontend/.../admission-workspace/AdmissionProtheusIntegrationPanel.tsx` **+ duplicata** em `candidates/drawer/components/` |
| Auditoria existente | `.design/prod-readiness-audit-1/PRE_ADMISSION_PROTHEUS_AUDIT.md` |

**Onde estaria o mapper SRA / dry-run / catalog validation / exemplos JSON:**
não há pasta dedicada `protheus/` no backend. O mapeamento de campos (SRA),
dry-run e exemplos vivem **dentro** de `protheus_payload_builder.py` /
`protheus_real_adapter.py` / `erp_integration_service.py` e do doc
`protheus_export_rules.md`. *Recomenda-se* (fase futura) consolidar em um
subpacote `application/services/protheus/` + `docs/protheus/`.

**Material ADVPL separado** (NÃO confundir com o bridge da aplicação): a pasta
`skills advpl/` e os arquivos `AGENTS0-advpl.md`, `CLAUDE-advpl.md`,
`CLAUDE-advpl` parecem ser conhecimento/skills de **desenvolvimento ADVPL/TLPP
no Protheus**, não código do ATS. Candidato a extração para outro repositório.

---

## 8. Mapa dos Docs

| Local | Conteúdo | Avaliação |
|---|---|---|
| `docs/architecture/` | `scoring-glossary.md` | Útil, canônico |
| `docs/deploy/` | `DOCKER_LOCAL.md` | Útil, operacional |
| `docs/implementation/` | `README.md` + `phases/` (20), `audits/` (6), `decisions/`, `prompts/` | Útil; mistura de canônico e histórico |
| `docs/` (solto) | `GOOGLE_FORMS_IMPORT_FUTURE_FLOW.md` | Plano futuro |
| `backend/docs/` | `QUICK_REFERENCE.md`, `backend_setup.md`, `business-rules.md`, `database_bootstrap.md`, `testing.md`, `VALIDATION_API.md` | **Muito útil** — provável fonte oficial operacional |
| `workflows/` | `PAGES_MAP.md`, `PROJECT_WORKFLOW.md`, `ai-design-workflow.md`, `fix-domain-bug.md` | Útil (processo) |
| `.design/` | **161 pastas** de fase / 586 arquivos | **Excesso de docs soltos** — histórico de fases |
| Raiz (solto) | `documentacao.md` (23 KB), `FASE_20_FLOWCHART.txt`, `FIX_PUBLIC_APPLICATION_FKEY.md`, `MIGRATION_README.md`, `SECURITY.md` | Documentos soltos sem casa clara |

**Maior problema documental:** dispersão. Há documentação boa, mas espalhada
entre raiz, `docs/`, `backend/docs/`, `workflows/` e 161 pastas de `.design/`.
Não há índice único nem README de raiz apontando o que é oficial.

---

## 9. Mapa dos Testes

| Suíte | Local | Volume | Comando |
|---|---|---|---|
| **Backend unit** | `backend/tests/unit/` | 103 arquivos | `cd backend && pytest tests/unit` |
| **Backend integration** | `backend/tests/integration/` | 143 arquivos | `cd backend && pytest tests/integration` |
| **Backend e2e** | `backend/tests/e2e/` | 2 arquivos | `cd backend && pytest tests/e2e` |
| **Backend (raiz da suíte)** | `backend/tests/test_*.py` | ~10 arquivos | `cd backend && pytest` (testpaths=`tests`, cobertura ligada por padrão) |
| **Testes Postgres** | marcados `-m postgres` | — | `pytest -m postgres` (exige Postgres real) |
| **Frontend unit (vitest)** | `frontend/src/**/__tests__`, `*.test.ts(x)` | — | `cd frontend && npm test` |
| **Frontend e2e (Playwright)** | `frontend/e2e/` | 10 specs | `npx playwright test` (config `frontend/playwright.config.ts`) |
| **Candidate portal** | `candidate-portal/src/**/*.test.ts`, `candidate-portal/e2e/` | smoke | `cd candidate-portal && npm test` |
| **E2E raiz (cross-app)** | `e2e/` | 13 specs | `npx playwright test` (config raiz `playwright.config.ts`) |

**Observações:**
- O backend tem `pyproject.toml` com `addopts = "--cov=src --cov-report=term-missing"` (cobertura sempre ligada) e um `tests/pytest_no_cov.ini` para rodar sem cobertura.
- `backend/test_skills.py` (na raiz do backend) é um teste solto fora de `tests/` — candidato a mover ou arquivar.
- Há marcador `postgres` que separa integração pesada — bom sinal de maturidade.

---

## 10. Mapa dos Scripts / Docker

### Docker
| Arquivo | Papel |
|---|---|
| `docker-compose.local.yml` (raiz) | Orquestração local completa (raiz) |
| `backend/docker-compose.yml` | Serviços `postgres`, `redis`, `api`, `worker` |
| `backend/Dockerfile` | Imagem do backend (uvicorn) |
| `frontend/Dockerfile` + `nginx.conf` | Imagem do staff |
| `candidate-portal/Dockerfile` + `nginx.conf` | Imagem do portal |
| `.env.docker`, `.env.docker.local`, `.env.docker.example` | Variáveis Docker |

### Scripts de subida / bootstrap (raiz `scripts/`)
| Script | Papel |
|---|---|
| `dev-full.sh` (18 KB) | Sobe stack de dev completa (back + fronts) |
| `docker-full.sh` | Sobe via Docker |
| `dev-ports.sh`, `ensure-dev-port-free.js` | Gestão de portas |
| `dev-user.sh` | Subida modo usuário |
| `validate-repo-root.js`, `validate-pipeline-imports.js`, `validate-vite-module-load.js` | Guardas de boot/CI |

### Comandos oficiais (de `package.json` raiz)
- `npm run dev:full` → `bash scripts/dev-full.sh` (local completo)
- `npm run docker:full` → `bash scripts/docker-full.sh` (Docker)
- `npm run dev:backend`, `dev:staff`, `dev:candidate` (isolados)

### Scripts de seed/bootstrap (backend `scripts/`)
`bootstrap_dev.py`, `bootstrap_dev_db.py`, `reset_db.py`, `reset_dev_db.sh`,
`seed_dev_admin.py`, `seed_jobs.py`, `seed_skills.py`,
`seed_skill_catalog_from_json.py`, `seed_checklist_templates.py`,
`seed_pre_admission_qa.py`, `seed_knowledge_base.py`, `seed_ai_models.py`,
`production_preflight.py`, `validate_baseline_schema.py`.

### Migrations
- `cd backend && alembic upgrade head` (config: `backend/alembic.ini`, `backend/MIGRATION_README.md`).
- Há `backend/alembic/archived_versions/` (migrations antigas arquivadas, inclusive dois arquivos com nome acentuado `alguma_alteração.py`).

---

## 11. Itens Duplicados ou Confusos

1. **`AdmissionProtheusIntegrationPanel.tsx` duplicado** — existe em
   `features/admission-workspace/` **e** em `features/candidates/drawer/components/`
   (cada um com seu `__tests__`). Provável divergência de comportamento.
2. **Drawer de candidato em duas versões** — `frontend/src/legacy/candidate-drawer/`
   (congelado, guardado por teste) vs. `features/candidates/drawer/`. Documentado,
   mas ainda é superfície dupla.
3. **Páginas "demo"** — `Demo2Page.tsx` (43 KB), `DemoRhPage.tsx` (23 KB) +
   `features/demo-rh/`. Parecem demonstração/protótipo, não fluxo de produção.
4. **Dois `node_modules`** — `node_modules/` e `frontend/node_modules 2/`
   (o `2/` indica cópia acidental; já ignorado no `.gitignore`).
5. **`.env.docker` × `.env.docker.local` × `.env.docker.example`** — três
   variantes na raiz; só o `.example` deveria ser versionado.
6. **Documentação dispersa em 5 lugares** (raiz, `docs/`, `backend/docs/`,
   `workflows/`, `.design/`) sem índice mestre.
7. **Configs Playwright em 3 níveis** (raiz, `frontend/`, `candidate-portal/`) —
   esperado em monorepo, mas exige saber qual rodar.
8. **`skills/` (symlinks) × `skills advpl/` (conteúdo ADVPL) × `.agents/skills/`**
   — três coisas chamadas "skills" com propósitos diferentes.

---

## 12. Itens Legados Prováveis

| Item | Sinal de legado |
|---|---|
| `frontend/src/legacy/candidate-drawer/` | Marcado explicitamente como congelado |
| `Demo2Page.tsx`, `DemoRhPage.tsx`, `features/demo-rh/` | Páginas de demonstração |
| `backend/alembic/archived_versions/` | Migrations arquivadas (nomes acentuados genéricos) |
| `FASE_20_FLOWCHART.txt`, `documentacao.md`, `FIX_PUBLIC_APPLICATION_FKEY.md` | Docs soltos de fase na raiz |
| `clean_css.py`, `replace_tokens.py` (raiz), `frontend/migrate_agenda.js`, `tests/e2e-test-analysis.ts`, `e2e-test-analysis.ts` (raiz) | Scripts utilitários pontuais sem casa |
| `backend/test_skills.py` | Teste solto fora de `tests/` |
| Maioria das 161 pastas `.design/*` | Planos/relatórios de fases já concluídas |
| `skills advpl/`, `AGENTS0-advpl.md`, `CLAUDE-advpl.md` | Domínio ADVPL, separado do ATS |

> Nota: "provável legado" ≠ "apagar". São candidatos a **arquivamento/extração**
> numa fase futura, com verificação caso a caso.

---

## 13. Riscos

| # | Risco | Severidade | Detalhe |
|---|---|---|---|
| R1 | **Sem README na raiz** | Alta | Nenhum ponto de entrada para humano/IA; onboarding depende de conhecimento tácito |
| R2 | **Artefatos pesados versionados** | Média | `backend/test_transfer.db` (556 KB), `test_run.db`, `full_output.txt`, `.seeded`, `.tmp-smoke/*.png` (33) e `.coverage` estão no git apesar do `.gitignore` (foram commitados antes da regra). Inflam o repo |
| R3 | **Dispersão documental (161 fases)** | Média | Difícil saber o que é "fonte oficial" atual |
| R4 | **Duplicação de componente Protheus** | Média | Risco de regra de negócio divergir entre as duas cópias |
| R5 | **Protheus sem fronteira clara** | Baixa/Média | Lógica de integração espalhada em vários services dificulta manutenção |
| R6 | **Múltiplos `.env.docker` versionados** | Média (segurança) | Confirmar que não há segredos reais em `.env.docker`/`.env.docker.local` |
| R7 | **Material ADVPL misturado** | Baixa | Aumenta a superfície que uma IA precisa entender antes de mexer no ATS |

---

## 14. Recomendações de Reorganização Futura (NÃO executar agora)

> Todas as ações abaixo são **propostas**; nada deve ser movido/apagado nesta fase.

**A. Criar porta de entrada**
- Criar `README.md` na raiz: o que é o projeto, os 3 apps, como subir, onde está cada coisa (pode reusar o `QUICK_MAP.md` desta auditoria).

**B. Higiene de versionamento (verificar antes de remover do índice)**
- Remover do controle de versão (via `git rm --cached`, em fase própria):
  `backend/test_run.db`, `backend/test_transfer.db`, `backend/full_output.txt`,
  `backend/.seeded`, `.tmp-smoke/`, `test-results/`, `.coverage`, `test.db`.
  Todos já constam no `.gitignore` — estão versionados por terem sido commitados antes.

**C. Consolidar documentação** (padrão sugerido)
```
docs/
├── architecture/   ← scoring-glossary, visão de camadas, ADRs (decisions/)
├── deploy/         ← DOCKER_LOCAL, .env, runbooks
├── protheus/       ← export_rules, mapper SRA, dry-run, exemplos JSON, auditoria
├── ai/             ← assistant, RAG, behavioral, limites/custos
├── product/        ← regras de negócio, fluxos, pages map
├── testing/        ← testing.md, estratégia, comandos
└── (raiz docs/)    ← README/índice apontando tudo
.design/phases/     ← arquivar as 161 pastas como histórico (read-only)
```

**D. Resolver duplicações**
- Unificar `AdmissionProtheusIntegrationPanel.tsx` (escolher uma fonte, importar nas duas telas).
- Planejar remoção de `frontend/src/legacy/candidate-drawer/` (já há plano formal no README do legacy).
- Mover páginas `Demo*` para um espaço `features/_demos/` ou removê-las se não usadas.

**E. Dar fronteira ao Protheus**
- Consolidar `protheus_*` em `application/services/protheus/` (subpacote) e centralizar docs em `docs/protheus/`.

**F. Separar domínio ADVPL**
- Avaliar extrair `skills advpl/`, `AGENTS0-advpl.md`, `CLAUDE-advpl.md` para repositório próprio de conhecimento Protheus/ADVPL.

**G. Fonte oficial para IA**
- Declarar como **canônico**: `backend/docs/`, `docs/architecture/`, `docs/deploy/`,
  `workflows/PAGES_MAP.md`, e o `QUICK_MAP.md` desta auditoria.
- Declarar como **histórico (não-fonte)**: `.design/*` e docs `FASE_*` soltos.

---

## 15. Próximas Fases Sugeridas

| Fase | Nome | Objetivo | Reversível? |
|---|---|---|---|
| **F1** | `repo-root-readme` | Criar README de raiz + adotar `QUICK_MAP.md` como guia oficial | Sim |
| **F2** | `repo-hygiene-untrack` | `git rm --cached` dos artefatos pesados/junk (DBs, logs, PNGs) | Sim |
| **F3** | `docs-consolidation` | Reorganizar docs no padrão `docs/{architecture,deploy,protheus,ai,product,testing}` e arquivar `.design/phases/` | Sim |
| **F4** | `dedupe-protheus-panel` | Unificar `AdmissionProtheusIntegrationPanel` e revisar drawer legacy | Requer teste |
| **F5** | `protheus-boundary` | Subpacote `protheus/` no backend + `docs/protheus/` | Requer teste |
| **F6** | `advpl-extraction` | Extrair material ADVPL para repo dedicado | Sim |

**Recomendação de próxima fase:** começar por **F1 (README de raiz)** seguida de
**F2 (higiene de versionamento)** — são as de maior impacto, menor risco e
totalmente reversíveis. As fases F4/F5 (que tocam código de produção) só depois,
com testes.

---

*Fim do relatório. Auditoria somente leitura — nenhuma alteração de produção.*
