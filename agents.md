# SISTEMA DE IA PARA ANÁLISE DE CANDIDATOS

## 📋 Visão Geral

Sistema de matching de candidatos com vagas usando IA. Componentes: **Backend (FastAPI + SQLAlchemy)**, **Frontend (React + TypeScript)**, **Database (PostgreSQL)**, **AI Service (Claude API)**.

**Stack:**
- Backend: Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, asyncio
- Frontend: React 18+, TypeScript, Vite, shadcn/ui
- Database: PostgreSQL 14+, SQLite para testes
- AI: Anthropic Claude API (prompt caching)

---

## 🏗️ Arquitetura

### Backend - Camadas

```
src/
├── domain/               # Entities, value objects, business logic
│   ├── entities/         # Job, Resume, Candidate, User
│   ├── value_objects/    # JobProfile, CandidateProfile, Scoring
│   └── services/         # Domain service logic
├── application/          # Use cases, services
│   ├── services/         # JobService, ResumeService, CandidateService, Ranking
│   └── dto/             # Data transfer objects
├── infrastructure/       # Database, repositories, external services
│   ├── database/        # Models (SQLAlchemy ORM), migrations (Alembic)
│   ├── repositories/    # Data access layer
│   └── external/        # AI service, API clients
└── interface/           # Controllers, API routes, schemas
    ├── api/             # Routers, dependencies
    └── schemas/         # Pydantic request/response models
```

### Fluxos de Dados Principais

#### 1️⃣ **Cadastro de Vaga**
```
POST /jobs
  → CreateJobRequest validado
  → JobService.create(body, user_id)
    → JobModel inserido
    → _maybe_generate_job_profile() (async, fire-and-forget)
      → JobProfilerService.generate_profile(...)
        → Caching via hash (title+description+requirements+skills)
        → AI chamado se não em cache
        → JobProfile serializado → job_profile_json
      → job_profile_hash atualizado
    → JobQualityValidator calcula score (0-100)
  → JobResponse retornado
```

**Campos estruturados adicionados (2026-04-29):**
- `job_area`: Enum (technology, data, financial, fiscal, accounting, administrative, commercial, operational, hr, leadership)
- `responsibilities`: Texto livre (responsabilidades principais)
- `experience_context`: Texto livre (contexto de experiência esperado)
- `behavioral_requirements`: Lista JSON (soft skills)
- `priority`: Enum (low, normal, high, urgent)

#### 2️⃣ **Envio de Currículo**
```
POST /resumes (upload file + extract text)
  → DocumentAIService extrai texto
  → ResumeProfilerService analisa texto
    → ResumeProfile serializado → resume_profile_json
  → Resume inserido com perfil
```

#### 3️⃣ **Matching e Ranking**
```
POST /jobs/{job_id}/scoring
  → CandidateRankingService.compute_and_persist(job_id)
    → Para cada candidato no pipeline da vaga:
      → JobCompatibilityCalculator.calculate(job_profile, candidate_profile)
      → Score armazenado
    → Ranking gerado (top 50, ordenado por score DESC)
  → GET /jobs/{job_id}/ranking retorna rankings persisted
```

**Score é multi-fator:**
- Technical Competencies (skill match)
- Practical Experience (seniority, years)
- Role Fit (job responsibilities vs resume experience)
- Seniority Alignment (seniority_level match)
- Education (education_level match)
- (Leadership-specific: leadership_evidence)

#### 4️⃣ **Validação de Qualidade**
```
GET /jobs/{job_id}/quality
  → JobQualityValidator._evaluate(job)
    → Score = title(10) + description(20) + requirements(10)
             + seniority(10) + skills(20) + education(5)
             + experience(5) + weight(10) + count(5) + deal_breakers(5)
             + job_area(5) + responsibilities(10) = max 100
  → Status: weak(<50), acceptable(50-74), good(>=75)
  → can_publish = status != "weak"
```

---

## 🔑 Conceitos Críticos

### Job Profile (`job_profile_json`)
Serialized `JobProfile` value object. Gerado pelo profiler (AI ou determinístico).

**Shape:**
```json
{
  "area": "technology",
  "target_level": "senior",
  "main_mission": "...",
  "critical_requirements": [{"name","description","is_mandatory","importance_weight","evidence_examples"}],
  "desirable_requirements": [...],
  "responsibilities": [...],
  "required_tools": [...],
  "required_capabilities": [...],
  "seniority_signals": [...],
  "adaptive_weights": {"technical_competencies":0.35, "practical_experience":0.30, ...},
  "job_completeness_score": 0.85,
  "confidence": "high",
  "description_hash": "abc123def456"
}
```

**Hash:** Determinístico baseado em (title, description, requirements, seniority_level, minimum_years_experience, minimum_education_level, linked_skills, responsibilities, experience_context, behavioral_requirements, job_area). Muda se qualquer desses mudar → recompute profile.

### Candidate Profile (`resume_profile_json`)
Similar, mas para candidatos. Contém extracted skills, education, experience, seniority signals.

### Deal-Breakers
Critérios de **exclusão automática** (vaga-level). Se candidato falha em um, score = 0.

**Tipos:** location, work_model, education_level, experience_years, skill, language, availability, custom_text.

---

## 🗄️ Database Schema - Tabelas Principais

| Tabela | Propósito | Key Fields |
|--------|-----------|-----------|
| `users` | Autenticação/autorização | id, email, role |
| `jobs` | Vagas | id, title, description, job_area, responsibilities, job_profile_json, status |
| `job_required_skills` | Skills requeridas por vaga | job_id, skill_id, is_mandatory, weight |
| `skills` | Skill catalog | id, name, category, aliases |
| `resumes` | Documentos de currículo | id, file_name, extracted_text, resume_profile_json |
| `candidates` | Perfil do candidato | id, name, email, contact, resume_id, resume_profile_json |
| `candidate_pipelines` | Candidato ↔ Vaga | candidate_id, job_id, status, score |
| `candidate_pipeline_scores` | Histórico de scores | candidate_id, job_id, score, score_version |
| `scoring_versions` | Versões do algoritmo | id, version, is_active, weights |

**Migrations:** Alembic em `backend/alembic/versions/`. Latest: `i7e2a5f9d3c1` (job structural fields - 2026-04-29).

---

## 🎯 Endpoints Críticos

### Jobs
```
POST   /api/v1/jobs                        # Criar vaga
GET    /api/v1/jobs                        # Listar vagas (paginado)
GET    /api/v1/jobs/{job_id}               # Detalhe
PATCH  /api/v1/jobs/{job_id}               # Atualizar
PATCH  /api/v1/jobs/{job_id}/publish       # Publicar (valida quality)
PATCH  /api/v1/jobs/{job_id}/pause         # Pausar
DELETE /api/v1/jobs/{job_id}               # Soft delete
GET    /api/v1/jobs/{job_id}/quality       # Quality score
GET    /api/v1/jobs/{job_id}/ranking       # Ranking de candidatos
POST   /api/v1/jobs/{job_id}/scoring       # Recomputar scores
```

### Resumes / Candidates
```
POST   /api/v1/resumes                     # Upload + extract
GET    /api/v1/resumes                     # Listar
GET    /api/v1/candidates                  # Listar candidatos
GET    /api/v1/candidates/{id}             # Detalhe
PATCH  /api/v1/candidates/{id}             # Editar candidato
```

### Pipeline
```
GET    /api/v1/pipeline/{job_id}           # Candidatos por vaga
PATCH  /api/v1/candidates/{id}/pipeline    # Move status (rejected, accepted, etc)
```

---

## ⚙️ Configuração & Deployment

### Environment Variables (Backend)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/resume_ai
ANTHROPIC_API_KEY=sk-...
JWT_SECRET=...
ENVIRONMENT=production|development
LOG_LEVEL=INFO
```

### Frontend Build
```bash
cd frontend
npm install
npm run build    # → dist/
npm run dev      # Dev server com HMR
```

### Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m pytest tests/ -v
uvicorn src.main:app --reload
```

---

## 🚨 Regras Críticas (DO NOT BREAK)

| Regra | Por quê | Impacto |
|-------|---------|--------|
| **Candidato pode existir sem vaga** | Candidatos são importados antes de vagas | Matching quebra se assumir vaga_id FK |
| **Vaga muda → reprocess candidatos** | Score fica stale se vaga_profile_json não reatualizar | Ranking incorreto |
| **Hash muda → profile regenera** | Evita re-AI em dados iguais | Custos de API explodem |
| **Deal-breaker falha → score = 0** | Eliminação é definitiva | Candidatos ruins aparecem |
| **Publish valida quality >= "acceptable"** | Vagas fracas criam ruído | Muitos candidatos inúteis |
| **Ranking é persisted, não inline** | Computar inline é lento (N² candidatos) | UI congela |

---

## 📊 Status do Projeto (2026-04-29)

### ✅ Completado
- [x] Phase 3: ResumeProfiler + CandidateProfile (24 testes passing)
- [x] Objective validation: education/experience fields (88 testes)
- [x] Deal-breakers: auto-rejection com UNKNOWN state (183 testes)
- [x] Real-world matching: E2E test pipeline (2 testes)
- [x] Data quality system: invalid marking com audit trails (15 testes)
- [x] Job structural fields: job_area, responsibilities, experience_context, behavioral_requirements, priority (NOVO)

### 🔄 Em Progresso
- [ ] JobQualityValidator: +15pts novo scoring (job_area +5, responsibilities +10)
- [ ] Frontend: nova aba "Detalhes" com behavioral_requirements chips

### 📅 Próximas Fases
- [ ] Phase 4: Adaptive scoring based on job_area (leadership_evidence para HR, technical_competencies para Tech, etc)
- [ ] Advanced filtering: search by job_area, priority, deal_breaker criteria
- [ ] Analytics: candidato/vaga metrics, time-to-hire

---

## 🐛 Problemas Conhecidos & Soluções

### Problema: Job profile muda, ranking fica stale
**Causa:** `_maybe_generate_job_profile()` é fire-and-forget; candidatos antigos não recalculam.
**Solução:** `POST /jobs/{job_id}/scoring` recomputar scores (deve ser chamado manualmente ou via webhook).

### Problema: Quality score muda mas publicação não é revalidada
**Causa:** Score calculado na publicação, não atualizado depois.
**Solução:** Ao editar vaga, invalidar publicação se score < "acceptable" (ainda TODO).

### Problema: Deal-breaker validation é case-sensitive
**Causa:** Texto livre no `value` field não é normalizado.
**Solução:** Normalizar antes de salvar (`.lower().strip()`).

### Problema: Skills duplicadas (aliases)
**Causa:** Mesmo skill com nomes diferentes (e.g., "JavaScript" vs "JS").
**Solução:** Alias matching via `skill.aliases` JSONB + skill.normalized_name.

### Problema: Validação falha ao listar vagas com job_area em português
**Causa:** Database contém valores legados em português (e.g., "Operacional", "Tecnologia"), mas `JobResponse` schema espera enum em inglês.
**Solução:** Field validator em `JobResponse` (`src/interface/api/schemas/job_schemas.py`):
1. Normaliza português → inglês via `LEGACY_JOB_AREA_MAP` (operacional→operational, tecnologia→technology, etc)
2. Aceita inglês válido direto (technology, data, etc)
3. **Valores inválidos:** Loga `WARNING` e define job_area=None (não quebra API)

Mapeamentos:
- operacional / tecnologia / dados / financeiro / fiscal / contabilidade / contábil / administrativo / comercial / rh / recursos humanos / liderança

**Se novos valores no banco:** Script `scripts/check_legacy_job_areas.py` encontra unmapped values. Adicione ao `LEGACY_JOB_AREA_MAP`.
**Importante:** Nunca remova `LEGACY_JOB_AREA_MAP` ou validator sem migration de dados.

---

## 🧪 Testing Strategy

### Backend
```bash
pytest tests/ -v --cov=src     # Coverage por module
pytest tests/test_job_structural_fields.py -v  # Novo
```

**Cobertura esperada:**
- Unit: services, value_objects, repositories
- Integration: API endpoints + database
- E2E: Full pipeline (resume upload → matching → ranking)

### Frontend
```bash
npm run test                    # Vitest
npm run type-check             # TypeScript
npm run lint                   # ESLint
```

---

## 📝 Checklist de Alteração

Ao fazer mudanças, garantir:

- [ ] Migration criada (`alembic revision --autogenerate`)
- [ ] Migration é idempotente (usa `inspector` para checar existência)
- [ ] ORM model atualizado (job_model.py, candidate_model.py, etc)
- [ ] Schema Pydantic atualizado (CreateRequest, UpdateRequest, Response)
- [ ] Service layer atualiza job_profile_hash se dados estruturais mudarem
- [ ] JobQualityValidator recalculado se novos campos adicionados
- [ ] Frontend types (domain.ts) sincronizados
- [ ] Testes unitários/integração criados
- [ ] `npm run build` frontend sem erros TypeScript
- [ ] `pytest` backend sem falhas
- [ ] **Se alterando job_area:** garantir `LEGACY_JOB_AREA_MAP` permanece em sync com valores do banco (ver seção "Problema: Validação falha ao listar vagas com job_area em português")

---

## 📖 Documentação & Files Chave

| Arquivo | Propósito |
|---------|-----------|
| `agents.md` | **ESTE arquivo** - guia para IA |
| `backend/CLAUDE.md` | Instruções backend (se existir) |
| `backend/IMPLEMENTATION_SUMMARY.md` | Resumo Phase 3 |
| `backend/JOBPROFILER_INTEGRATION.md` | Detalhes profiler |
| `backend/RESUMEPROFILER_INTEGRATION.md` | Detalhes resume profiler |
| `frontend/src/types/domain.ts` | TypeScript types |
| `backend/src/domain/value_objects/job_profile.py` | JobProfile dataclass |
| `backend/src/application/services/job_profiler_service.py` | Geração de perfil |
| `backend/src/interface/api/schemas/job_schemas.py` | **CRÍTICO:** JobResponse com normalização job_area (LEGACY_JOB_AREA_MAP) |

---

## 🔐 Segurança & Best Practices

- **SQL Injection:** ✅ SQLAlchemy ORM (parameterized queries)
- **XSS:** ✅ React DOM escaping (não use dangerouslySetInnerHTML)
- **CSRF:** ✅ FastAPI dependency on trusted headers
- **Auth:** JWT tokens com exp, refresh rotation
- **Data:** No sensitive data em logs; AI API caching seguro (Anthropic managed)

---

## 💡 Quick Ref: O que Fazer Quando...

### ...adicionar campo à vaga
1. Atualizar `JobModel` (job_model.py)
2. Adicionar a `CreateJobRequest`, `UpdateJobRequest`, `JobResponse` (job_schemas.py)
3. Atualizar `JobService.create/update()` (job_service.py)
4. Se afeta matching: repassar ao `JobProfilerService.generate_profile()`
5. Se afeta quality score: atualizar `JobQualityValidatorService._evaluate()`
6. Migration: `alembic revision --autogenerate`
7. Frontend: atualizar `Job` type em domain.ts, form em VagasPage.tsx

### ...importar vagas de IA/LinkedIn (JSON português/inglês)
Admin → Importação de Vagas:
- ✅ Frontend aceita **português E inglês** (não bloqueia por idioma)
- ✅ **Normaliza automaticamente** para inglês (padrão backend)
- ✅ Valida campos obrigatórios (title, description)
- ✅ Avisa warnings quando há normalização

**job_area mapping (PT/EN → EN, padrão backend):**
- dados/data → data
- tecnologia/technology/tech → technology
- financeiro/financial → financial
- fiscal → fiscal
- contábil/contabilidade/accounting → accounting
- administrativo/administrative → administrative
- comercial/vendas/commercial → commercial
- operacional/operational → operational
- rh/recursos humanos/hr → hr
- liderança/leadership → leadership

**Backend:** JobResponseSchema também normaliza PT→EN para exibição (ver deal_breakers_feature.md)

Implementação: `src/services/jobImportSmartService.ts`
- `normalizeJobArea()`: mapeia PT/EN → EN (padrão backend)
- `parseRawInput()`: melhor mensagens de erro
- `normalizeSingleJob()`: valida campos obrigatórios, avisa normalizações

### ...consertar bug em matching
1. Verificar `job_profile_json` está gerado corretamente
2. Verificar `resume_profile_json` está gerado corretamente
3. Debugar `JobCompatibilityCalculator.calculate(job, candidate)`
4. Recomputar com `POST /jobs/{job_id}/scoring`
5. Verificar deal_breakers (eliminação automática)

### ...descobrir novos valores job_area não mapeados
```bash
DATABASE_URL=postgresql://user:pass@localhost/resume_ai python scripts/check_legacy_job_areas.py
```
Script lista todos valores no banco e marca quais estão mapeados em `LEGACY_JOB_AREA_MAP`.

### ...corrigir comportamento do pipeline por status
Pipeline agora respeita status da vaga:
- **draft** → EmptyState com botão "Publicar vaga" (não renderiza board)
- **published** → pipeline funcional, novo candidato habilitado
- **paused** → pipeline visível, mas ações desabilitadas (opacity-60, pointer-events-none)
- **closed** → pipeline em modo somente leitura

Implementação:
- Helper: `canUsePipeline(status)` retorna `published | paused`
- Flags: `isDraft`, `canUse`, `isReadOnly`
- KanbanColumn: novo prop `disabled` (desabilita cards e cliques)
- Botão "Novo candidato": `disabled={!canUse}`

### ...rodar testes completos
```bash
# Backend
cd backend && alembic upgrade head && pytest tests/ -v

# Frontend
cd frontend && npm run build
```

---

**Last Updated:** 2026-04-29  
**Maintained By:** Claude + User (Lécino Lucas)
