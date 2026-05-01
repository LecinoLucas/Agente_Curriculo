# 🏗️ Arquitetura do Sistema de Avaliação

## Fluxo Arquitetural Completo

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│                   (VagasPage, PipelinePage)                      │
└─────────┬─────────────────────────────────┬────────────────────┘
          │                                 │
          │ POST /api/v1/resumes             │ GET /api/v1/jobs/{id}/ranking
          │ (upload + analysis)              │ GET /api/v1/pipeline/{id}
          │                                 │
          ▼                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI/Python)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              API Layer (src/interface/api)               │    │
│  │  • routers/resumes.py (análise)                          │    │
│  │  • routers/jobs.py (vagas)                               │    │
│  │  • routers/pipeline.py (pipeline)                        │    │
│  │  • schemas/analysis_schemas.py                           │    │
│  └──────────────────────────────────────────────────────────┘    │
│                               │                                   │
│                               ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │        Application Layer (src/application/services)     │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  AnalysisService                                   │ │    │
│  │  │  • Coordena análise de currículo                  │ │    │
│  │  │  • Chama IA em background (background job)        │ │    │
│  │  │  • Retorna versionando de análise                 │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  CandidateRankingService                          │ │    │
│  │  │  • Coordena cálculo de ranking por vaga          │ │    │
│  │  │  • Aplica ScoreCalculator                        │ │    │
│  │  │  • Aplica JobCompatibilityCalculator             │ │    │
│  │  │  • Persiste scores (cache pra não recalcular)    │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  JobService                                       │ │    │
│  │  │  • CRUD de vagas                                 │ │    │
│  │  │  • Deal-breaker management                       │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  PipelineService                                 │ │    │
│  │  │  • Move candidatos entre estágios               │ │    │
│  │  │  • Aplica deal-breakers                         │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                               │                                   │
│                               ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │      Domain Services (src/domain/services) [PURO]       │    │
│  │      ▲                                                   │    │
│  │      └─ Zero dependências externas, 100% testável       │    │
│  │                                                          │    │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐ │    │
│  │  │ ScoreCalculator  │  │ JobCompatibilityCalculator   │ │    │
│  │  │ ─────────────── │  │ ──────────────────────────── │ │    │
│  │  │ Input:          │  │ Input:                       │ │    │
│  │  │ ExtractedResume │  │ • Candidate skills (SkillSet)│ │    │
│  │  │ Data            │  │ • Required skills (list)     │ │    │
│  │  │                 │  │ • Candidate seniority        │ │    │
│  │  │ Output:         │  │ • Job requirements           │ │    │
│  │  │ ScoreBreakdown  │  │                              │ │    │
│  │  │ (5 dimensões)   │  │ Output:                      │ │    │
│  │  │                 │  │ CompatibilityResult          │ │    │
│  │  │ • Technical(35%)│  │ • match_score                │ │    │
│  │  │ • Experience(30)│  │ • recomendation              │ │    │
│  │  │ • Education(15)│  │ • matched_skills             │ │    │
│  │  │ • Comm(10%)    │  │ • missing_mandatory          │ │    │
│  │  │ • Leadership(10)│  │ • reason_codes               │ │    │
│  │  └──────────────────┘  └──────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────────┐ │    │
│  │  │  DealBreakerEvaluator                               │ │    │
│  │  │  • Avalia regras de eliminação automática           │ │    │
│  │  │  • 8 tipos de campos (location, work_model, etc)    │ │    │
│  │  │  • Retorna violações                                │ │    │
│  │  └──────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                               │                                   │
│                               ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │         Infrastructure: AI & Repositories                │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  AIAdapter (src/infrastructure/ai)                 │ │    │
│  │  │  • Integra com Claude API (Anthropic)             │ │    │
│  │  │  • Prompt templates (v2_full_analysis)            │ │    │
│  │  │  • Cache de análises (para economizar tokens)     │ │    │
│  │  │  • Retry logic e tratamento de erros              │ │    │
│  │  │                                                   │ │    │
│  │  │  Entrada:                                        │ │    │
│  │  │    • Resume text (pode ser PDF/docx→text)       │ │    │
│  │  │    • Job context (opcional)                     │ │    │
│  │  │                                                   │ │    │
│  │  │  Saída:                                          │ │    │
│  │  │    • AnalysisResult JSON                         │ │    │
│  │  │    • ExtractedResumeData (estruturado)           │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │  Repositories (SQL + AsyncSession)                 │ │    │
│  │  │  • JobRepository                                 │ │    │
│  │  │  • AnalysisRepository                            │ │    │
│  │  │  • CandidateRepository                           │ │    │
│  │  │  • PipelineRepository                            │ │    │
│  │  │  • ResumeJobMatchRepository (scores)             │ │    │
│  │  │  • CandidateJobScoreRepository                   │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                               │                                   │
│                               ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │         Database Layer (SQLAlchemy + Alembic)           │    │
│  │                                                          │    │
│  │  Tables principais:                                    │    │
│  │  ├─ resume_job_match                                  │    │
│  │  │  └─ Caches do score breakdown (não recalcula)     │    │
│  │  │                                                    │    │
│  │  ├─ candidate_job_score                              │    │
│  │  │  └─ Caches de compatibilidade com vaga            │    │
│  │  │                                                    │    │
│  │  ├─ analysis (análise de currículo)                 │    │
│  │  │  └─ ExtractedResumeData normalizado              │    │
│  │  │                                                    │    │
│  │  ├─ job (vagas)                                      │    │
│  │  │  └─ deal_breakers (JSON array)                    │    │
│  │  │  └─ required_skills (relação M-M)               │    │
│  │  │                                                    │    │
│  │  └─ job_pipeline_stage (stages/fases)               │    │
│  │     └─ Rastreamento de candidatos por estágio       │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
        │                                  │
        │                                  │
        ▼                                  ▼
  ┌──────────────────────┐          ┌──────────────────────┐
  │  Claude API           │          │  PostgreSQL Database │
  │  (Anthropic)          │          │  (with async)        │
  │                       │          │                      │
  │ • full_analysis v2    │          │ Schema: v1+          │
  │ • prompt caching      │          │ Migrations: Alembic  │
  │ • streaming (async)   │          │                      │
  └──────────────────────┘          └──────────────────────┘
```

---

## 🔄 Ciclo de Avaliação (Sequência)

### 1. Upload e Análise de Currículo

```
Frontend                 Backend
   │                       │
   │─ POST /api/v1/resumes─────>
   │  { file, user_id }    │
   │                       ▼
   │                  AnalysisService
   │                       │
   │                       ├─> Extrai texto (PDF/docx→text)
   │                       │
   │                       ├─> Enfileira job: ai_analysis
   │                       │   (background worker)
   │                       │
   │                    ┌──▼───────┐
   │◄─ 202 Accepted ────┤ Analysis │
   │  { version_id }    │ queued   │
   │                    └──────────┘
   │
   │  [Enquanto isso, em background]
   │
   │  AIAdapter
   │   ├─> Chama Claude v2_full_analysis
   │   │   • Envia prompt cacheável (system)
   │   │   • Envia currículo (user)
   │   │   • Recebe: match_score, strengths, gaps, etc
   │   │
   │   ├─> Extrai dados estruturados
   │   │   → ExtractedResumeData
   │   │
   │   └─> Salva em DB (analysis table)
   │
   │  ScoreCalculator.calculate()
   │   ├─> Calcula Technical(35%)
   │   ├─> Calcula Experience(30%)
   │   ├─> Calcula Education(15%)
   │   ├─> Calcula Communication(10%)
   │   ├─> Calcula Leadership(10%)
   │   │
   │   └─> Retorna ScoreBreakdown
   │
   │  Salva em resume_job_match table
   │  (cache para não recalcular)
```

---

### 2. Matching com Vaga Específica

```
Frontend (PipelinePage)    Backend (CandidateRankingService)
   │                              │
   │─ GET /api/v1/jobs/{id}/ranking──────>
   │                              │
   │                              ▼
   │                       Check cache
   │                       (candidate_job_score)
   │                              │
   │                         ┌────┴─────┐
   │                    Cache hit      Cache miss
   │                         │              │
   │                    ┌────▼─────┐       │
   │                    │Return    │       │
   │                    │cached    │       │
   │                    │result    │       │
   │                    └──────────┘       │
   │                                       ▼
   │                          JobCompatibilityCalculator
   │                              │
   │                              ├─> Score Skills (40%)
   │                              │   ├─ Mandatory: weighted coverage
   │                              │   └─ Optional: bonus
   │                              │
   │                              ├─> Score Seniority (20%)
   │                              │   └─ Distância de níveis
   │                              │
   │                              ├─> Score Experience (10%)
   │                              │   └─ Anos vs mínimo
   │                              │
   │                              ├─> Score Education (10%)
   │                              │   └─ Nível vs mínimo
   │                              │
   │                              ├─> Redistribuir pesos
   │                              │   (se sem some category)
   │                              │
   │                              ├─> Calcula overall
   │                              │
   │                              └─> Retorna CompatibilityResult
   │                                  • match_score
   │                                  • mandatory_coverage
   │                                  • reason_codes
   │                                  • recomendation
   │
   │                       DealBreakerEvaluator
   │                              │
   │                              ├─> Itera over job.deal_breakers
   │                              │
   │                              ├─> Para cada:
   │                              │   • _check_location()
   │                              │   • _check_work_model()
   │                              │   • _check_education_level()
   │                              │   • _check_experience_years()
   │                              │   • _check_skill()
   │                              │   • _check_language()
   │                              │   • _check_availability()
   │                              │   • _check_custom_text()
   │                              │
   │                              └─> Coleta violations
   │                                  (se houver: impact = -100.0)
   │
   │                       Salva em candidate_job_score
   │                       (cache para futuro)
   │
   │  ┌──────────────────────────────────────┐
   │◄─┤ JSON Ranking                         │
   │  │ {                                    │
   │  │   candidates: [                      │
   │  │     {                                │
   │  │       match_score: 82,               │
   │  │       recomendation: "STRONG_MATCH", │
   │  │       mandatory_coverage: 92%,       │
   │  │       reason_codes: [...]            │
   │  │     }                                │
   │  │   ]                                  │
   │  │ }                                    │
   │  └──────────────────────────────────────┘
   │
   └─ Renderiza ranking ordenado
      (STRONG/GOOD/POTENTIAL/NOT_RECOMMENDED)
```

---

### 3. Transição de Estágios (Pipeline)

```
Frontend (Drag & Drop)      Backend (PipelineService)
   │                              │
   │─ PATCH /pipeline/{stage}──────>
   │  { candidate_id, job_id }   │
   │                              ▼
   │                       DealBreakerEvaluator
   │                              │
   │                         ┌────▼─────┐
   │                    Deal-breaker   OK
   │                   violation      │
   │                         │        │
   │                    ┌────▼──────┐ │
   │                    │Return 409 │ │ (Conflict)
   │                    │"Candidate │ │
   │                    │rejected"  │ │
   │                    └───────────┘ │
   │                                  ▼
   │                          Move to new stage
   │                          Update job_pipeline_stage
   │                              │
   │  ◄─ 200 OK ──────────────────┘
   │
   └─ Renderiza novo estado
```

---

## 📊 Fluxo de Dados (Normalizado)

### Estrutura 1: Currículo → ExtractedResumeData

```
Currículo (texto)
    │
    ▼
AI (v2_full_analysis)
    │
    ├─> Experiência
    │   ├─ total_experience_months
    │   ├─ experiences[]: {company, role, duration_months, is_leadership}
    │   └─ employment_gaps[]: {start, end, duration_months}
    │
    ├─> Skills
    │   ├─ skills[]: {name, proficiency_level, years_experience}
    │   └─ skill_categories[]: ["backend", "devops", ...]
    │
    ├─> Educação
    │   ├─ highest_education_level: "bachelor"
    │   ├─ education_field_relevance: "high" | "medium" | "low"
    │   └─ certifications[]: {name, issuer, date}
    │
    ├─> Comunicação
    │   └─ communication_quality: {
    │       structure: 80,
    │       clarity: 75,
    │       professionalism: 85,
    │       completeness: 70
    │     }
    │
    └─> Liderança
        └─ leadership_indicators: {
            has_management: true,
            has_project_lead: true,
            has_mentoring: false,
            has_cross_team: true
          }

    ▼
ScoreBreakdown {
  overall: Score(75),
  technical: Score(72),
  experience: Score(81),
  education: Score(79),
  communication: Score(78),
  leadership: Score(70),
  details: { ... }
}
```

### Estrutura 2: Vaga → RequiredSkill[]

```
Job {
  id: UUID,
  title: "Backend Senior",
  description: "...",
  status: "published",
  seniority_level: "senior",
  minimum_education_level: "bachelor",
  minimum_years_experience: 5,
  
  deal_breakers: [
    {
      field: "location",
      operator: "equals",
      value: "São Paulo",
      reason: "...",
      is_active: true
    }
  ],
  
  required_skills: [  ← M-M relationship
    {
      skill_id: UUID,
      skill_name: "Python",
      is_mandatory: true,
      weight: 2.0,
      minimum_level: "advanced",
      minimum_years: 3
    }
  ]
}
```

### Estrutura 3: CompatibilityResult

```
CompatibilityResult {
  match_score: Score(82),
  mandatory_skills_score: Score(95),
  optional_skills_score: Score(88),
  seniority_score: Score(100),
  experience_score: Score(90),
  education_score: Score(100),
  
  mandatory_skills_coverage: 95%,
  recommendation: "STRONG_MATCH",
  
  matched_skills: ["Python", "Docker"],
  missing_mandatory_skills: [],
  missing_optional_skills: ["Kubernetes"],
  bonus_skills: ["Terraform", "Prometheus"],
  exceeds_skills: ["Python (expected advanced, has expert)"],
  
  skill_details: [
    SkillMatchDetail { ... },
    ...
  ],
  
  match_summary: "Excelente match..."
}
```

---

## 🗄️ Schema Database (Essencial)

### resume_job_match
```sql
CREATE TABLE resume_job_match (
  id UUID PRIMARY KEY,
  version_id UUID (→ AnalysisModel),
  
  -- Scores (ScoreBreakdown)
  overall_score DECIMAL(5,2),
  technical_score DECIMAL(5,2),
  experience_score DECIMAL(5,2),
  education_score DECIMAL(5,2),
  communication_score DECIMAL(5,2),
  leadership_score DECIMAL(5,2),
  
  -- Detalhes JSON
  details JSONB,  -- {weights, technical_detail, ...}
  
  created_at TIMESTAMP,
  version UUID (para tracking de ScoreCalculator changes)
);
```

### candidate_job_score
```sql
CREATE TABLE candidate_job_score (
  id UUID PRIMARY KEY,
  candidate_id UUID (→ CandidateModel),
  job_id UUID (→ JobModel),
  
  -- CompatibilityResult
  match_score DECIMAL(5,2),
  mandatory_skills_score DECIMAL(5,2),
  optional_skills_score DECIMAL(5,2),
  seniority_score DECIMAL(5,2),
  experience_score DECIMAL(5,2),
  education_score DECIMAL(5,2),
  
  mandatory_skills_coverage DECIMAL(5,2),
  recommendation VARCHAR (STRONG_MATCH|GOOD_MATCH|...)
  
  -- Detalhes
  matched_skills TEXT[],
  missing_mandatory TEXT[],
  missing_optional TEXT[],
  bonus_skills TEXT[],
  skill_details JSONB,
  
  -- Rastreamento
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  score_version UUID (para tracking de JobCompatibilityCalculator changes)
);
```

### analysis
```sql
CREATE TABLE analysis (
  id UUID PRIMARY KEY,
  version_id UUID UNIQUE,  ← Histórico
  resume_id UUID (→ ResumeModel),
  
  -- ExtractedResumeData normalizado
  total_experience_months INT,
  experiences JSONB,
  employment_gaps JSONB,
  
  skills JSONB,
  skill_categories TEXT[],
  
  highest_education_level VARCHAR,
  education_field_relevance VARCHAR,
  certifications JSONB,
  
  communication_quality JSONB,
  leadership_indicators JSONB,
  
  -- AI Metadata
  ai_confidence DECIMAL,
  ai_model VARCHAR,
  ai_prompt_version INT,
  
  status VARCHAR (completed|failed|...)
  created_at TIMESTAMP
);
```

---

## 🔄 Padrões de Design

### 1. Service Layer (Orquestração)

```python
class CandidateRankingService:
    def compute_and_persist(job_id: UUID) -> int:
        # 1. Load job + required skills
        # 2. Get all candidates in pipeline
        # 3. For each candidate:
        #    a. Load analysis (get or recalculate)
        #    b. JobCompatibilityCalculator.calculate()
        #    c. DealBreakerEvaluator.evaluate()
        #    d. Persist CompatibilityResult
        # 4. Return count_scored
```

### 2. Domain Services (Puro)

```python
class ScoreCalculator:
    # Zero I/O, zero dependencies
    def calculate(data: ExtractedResumeData) -> ScoreBreakdown:
        # Aritmética pura, Decimal, auditável
```

### 3. Repository Pattern (Data Access)

```python
class CandidateJobScoreRepository:
    async def save(result: CompatibilityResult)
    async def get_by_candidate_and_job(candidate_id, job_id)
    async def list_by_job_ordered_by_score(job_id) -> list[...]
```

### 4. Value Object (Imutável)

```python
@dataclass(frozen=True)
class Score:
    value: Decimal
    
    @classmethod
    def of(cls, value: Decimal | int | float) -> Score:
        # Normaliza e valida 0-100
        return cls(Decimal(str(value)).quantize(...))
```

---

## ✅ Garantias do Sistema

### Puro Domain Layer
```
✅ ScoreCalculator + JobCompatibilityCalculator são:
   • Zero dependências externas
   • 100% determinístico
   • Completamente testável em unidade
   • Auditável (cada score tem razão)
```

### Async & Cache-Friendly
```
✅ CandidateRankingService:
   • Async I/O (PostgreSQL)
   • Cache hits em candidate_job_score
   • Não recalcula sem razão
   • Background jobs para análise (não bloqueia)
```

### Fail-Safe
```
✅ DealBreakerEvaluator:
   • Rejeições são absolutas (-100.0)
   • Sem override possível
   • Rastreáveis (reason code)
```

---

## 🚀 Próximos Passos

Para escalar:

1. **Versionamento de Score:** Track ScoreCalculator versão
2. **A/B Testing:** Compare versões de weights
3. **Custom Weights:** Permitir recruiter customizar por vaga
4. **Feature Store:** Cache intermediate calculations
5. **Real-time Updates:** WebSocket para ranking updates

