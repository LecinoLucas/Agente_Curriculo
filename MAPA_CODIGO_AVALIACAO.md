# 🗺️ Mapa do Código: Avaliação de Candidatos

Referência rápida aos arquivos importantes no sistema de avaliação.

---

## 📂 Estrutura de Diretórios

```
backend/
├── src/
│   ├── domain/
│   │   ├── services/              ← Lógica pura (zero dependências)
│   │   │   ├── score_calculator.py
│   │   │   ├── job_compatibility_calculator.py
│   │   │   ├── deal_breaker_evaluator.py
│   │   │   └── job_compatibility_calculator.py
│   │   ├── value_objects/
│   │   │   ├── score.py          ← Score(0-100) imutável
│   │   │   └── skill_set.py      ← SkillSet com proficiency
│   │   └── entities/
│   │       ├── analysis.py        ← Análise de currículo
│   │       └── job.py             ← Vaga (com deal_breakers)
│   │
│   ├── application/
│   │   └── services/              ← Orquestração
│   │       ├── analysis_service.py    ← Coordena análise IA
│   │       ├── candidate_ranking_service.py ← Coordena ranking
│   │       └── job_service.py         ← CRUD de vagas
│   │
│   ├── infrastructure/
│   │   ├── ai/
│   │   │   ├── prompts/
│   │   │   │   └── v2_full_analysis.py  ← Prompt da IA
│   │   │   └── adapters/
│   │   │       └── claude_adapter.py    ← Chama Claude API
│   │   │
│   │   ├── repositories/
│   │   │   ├── sqlalchemy_job_repository.py
│   │   │   ├── sqlalchemy_analysis_repository.py
│   │   │   └── ... (outros repos)
│   │   │
│   │   └── database/
│   │       ├── models/
│   │       │   ├── job_model.py      ← DB schema
│   │       │   ├── analysis_model.py
│   │       │   └── ...
│   │       └── migrations/ (Alembic)
│   │
│   └── interface/
│       └── api/
│           ├── routers/
│           │   ├── resumes.py     ← POST /api/v1/resumes
│           │   ├── jobs.py        ← GET/POST/PATCH /api/v1/jobs
│           │   └── pipeline.py    ← GET /api/v1/pipeline/{id}
│           └── schemas/
│               ├── analysis_schemas.py
│               └── job_schemas.py
│
└── tests/
    ├── unit/
    │   ├── test_score_calculator.py
    │   ├── test_job_compatibility_calculator.py
    │   ├── test_deal_breaker_evaluator.py
    │   └── ...
    ├── integration/
    │   ├── test_deal_breaker_ranking.py
    │   ├── test_real_world_matching.py
    │   └── test_job_endpoints.py
    └── e2e/
        └── test_matching_flow_e2e.py
```

---

## 🎯 Arquivos por Funcionalidade

### 1. Score Breakdown (5 Dimensões)

**Arquivo Principal:** `src/domain/services/score_calculator.py`

| Dimensão | Peso | Método |
|----------|------|---------|
| Technical | 35% | `_calculate_technical()` |
| Experience | 30% | `_calculate_experience()` |
| Education | 15% | `_calculate_education()` |
| Communication | 10% | `_calculate_communication()` |
| Leadership | 10% | `_calculate_leadership()` |

**Classes Relacionadas:**
- `ExtractedResumeData` - Dados estruturados do currículo
- `ScoreBreakdown` - Resultado com 5 scores + details
- `Score` - Value object (0-100, Decimal)

**Testes:**
- `tests/unit/test_score_calculator.py` - 50+ casos

---

### 2. Job Compatibility / Matching

**Arquivo Principal:** `src/domain/services/job_compatibility_calculator.py`

| Dimensão | Peso |
|----------|------|
| Skills Obrigatórias | 40% |
| Skills Desejáveis | 20% |
| Senioridade | 20% |
| Experiência | 10% |
| Educação | 10% |

**Classes Relacionadas:**
- `CompatibilityInput` - Entrada (candidato + vaga)
- `CompatibilityResult` - Resultado (match_score + recomendation)
- `SkillMatchDetail` - Detalhe por skill

**Métodos Principais:**
- `calculate()` - Calcula compatibilidade
- `_score_skills()` - Skills matching
- `_score_seniority()` - Senioridade
- `_recommend()` - Gera recomendação

**Testes:**
- `tests/unit/test_job_compatibility_calculator.py`

---

### 3. Deal-Breaker Evaluator

**Arquivo Principal:** `src/domain/services/deal_breaker_evaluator.py`

**Campos Suportados:**
```python
_check_location()         # "location" field
_check_work_model()       # "work_model"
_check_education_level()  # "education_level"
_check_experience_years() # "experience_years"
_check_skill()            # "skill"
_check_language()         # "language"
_check_availability()     # "availability"
_check_custom_text()      # "custom_text"
```

**Resultado:**
- Retorna lista de violations (vazio se OK)
- Cada violation: `{type, field, impact: -100.0, expected, actual, reason}`

**Testes:**
- `tests/integration/test_deal_breaker_ranking.py`

---

### 4. Analysis IA

**Arquivo Principal:** `src/infrastructure/ai/prompts/v2_full_analysis.py`

**Estrutura:**
```python
SYSTEM_PROMPT = """[Instruções de avaliação...] """
NAME = "full_analysis"
VERSION = 2
```

**Entrada:**
- Currículo em texto
- (Opcional) contexto da vaga

**Saída JSON:**
```json
{
  "match_score": 75,
  "level_detected": "senior",
  "strengths": [...],
  "gaps": [...],
  "recommendation": "interview"
}
```

**Adapter:** `src/infrastructure/ai/adapters/claude_adapter.py`

**Testes:**
- `tests/unit/test_analysis_scoring.py`

---

### 5. Orquestração: Services

#### `src/application/services/analysis_service.py`
Coordena análise de currículo:
```python
class AnalysisService:
    async def create_analysis(resume_id, user_id) -> Analysis
    async def get_latest_analysis(resume_id) -> Analysis
```

#### `src/application/services/candidate_ranking_service.py`
Coordena ranking:
```python
class CandidateRankingService:
    async def compute_and_persist(job_id) -> int
    async def get_ranking(job_id) -> JobRanking
    # Internamente:
    # 1. ScoreCalculator (score breakdown)
    # 2. JobCompatibilityCalculator (match)
    # 3. DealBreakerEvaluator (rejeições)
    # 4. Persiste em candidate_job_score
```

#### `src/application/services/job_service.py`
CRUD de vagas:
```python
class JobService:
    async def create(payload: CreateJobRequest) -> Job
    async def update(job_id, payload: UpdateJobRequest) -> Job
    async def add_required_skill(job_id, skill) -> JobRequiredSkillResponse
    async def remove_required_skill(job_id, skill_id)
```

---

### 6. API Endpoints

#### `src/interface/api/routers/resumes.py`
```python
POST /api/v1/resumes              # Upload currículo
GET /api/v1/resumes/{version_id}  # Status análise
```

#### `src/interface/api/routers/jobs.py`
```python
POST /api/v1/jobs                 # Criar vaga
GET /api/v1/jobs/{job_id}         # Detalhe vaga
PATCH /api/v1/jobs/{job_id}       # Editar vaga
POST /api/v1/jobs/{job_id}/skills # Vincular skill
DELETE /api/v1/jobs/{job_id}/skills/{skill_id}
```

#### `src/interface/api/routers/pipeline.py`
```python
GET /api/v1/pipeline/{job_id}     # Candidatos por estágio
GET /api/v1/jobs/{job_id}/ranking # Ranking com scores
PATCH /api/v1/pipeline/{stage}    # Move candidato
```

---

### 7. Schemas

#### `src/interface/api/schemas/job_schemas.py`
```python
class CreateJobRequest        # POST payload
class UpdateJobRequest        # PATCH payload
class DealBreaker             # Deal-breaker schema
class JobResponse             # Response (com deal_breakers)
```

#### `src/interface/api/schemas/analysis_schemas.py`
```python
class AnalysisResult          # Resultado IA
class ScoreBreakdownResponse  # Score breakdown
```

---

### 8. Database Models

#### `src/infrastructure/database/models/job_model.py`
```python
class JobModel:
    deal_breakers: dict  ← JSON array de deal_breakers
    required_skills: relationship ← M-M com skills
```

#### `src/infrastructure/database/models/analysis_model.py`
```python
class AnalysisModel:
    # ExtractedResumeData normalizado
    total_experience_months
    experiences, employment_gaps
    skills, skill_categories
    education_level, education_field_relevance
    communication_quality, leadership_indicators
```

#### Database Tables (Ranking Cache)
```python
class ResumeJobMatchModel        # Cache de ScoreBreakdown
class CandidateJobScoreModel     # Cache de CompatibilityResult
```

---

## 📊 Fluxo Chamadas

### Análise de Currículo
```
POST /api/v1/resumes
  ├─> AnalysisService.create_analysis()
  │   ├─> AIAdapter.analyze_resume()  [async background]
  │   │   ├─> Claude API (v2_full_analysis)
  │   │   └─> Retorna: AnalysisResult JSON
  │   │
  │   ├─> ScoreCalculator.calculate()
  │   │   ├─> ExtractedResumeData
  │   │   └─> Retorna: ScoreBreakdown
  │   │
  │   └─> AnalysisRepository.save()
  │       └─> analysis table + resume_job_match table
  │
  └─> HTTP 202 Accepted
      { version_id, status: "processing" }
```

### Matching com Vaga
```
GET /api/v1/jobs/{job_id}/ranking
  ├─> CandidateRankingService.get_ranking()
  │   │
  │   ├─> Para cada candidato no pipeline:
  │   │   ├─> Load or compute Analysis
  │   │   │
  │   │   ├─> JobCompatibilityCalculator.calculate()
  │   │   │   ├─> _score_skills()
  │   │   │   ├─> _score_seniority()
  │   │   │   ├─> _score_experience()
  │   │   │   ├─> _score_education()
  │   │   │   └─> Retorna: CompatibilityResult
  │   │   │
  │   │   ├─> DealBreakerEvaluator.evaluate_deal_breakers()
  │   │   │   └─> Retorna: violations[]
  │   │   │
  │   │   └─> CandidateJobScoreRepository.save()
  │   │
  │   └─> OrderBy match_score DESC
  │
  └─> HTTP 200
      {
        data: [{match_score, recommendation, ...}],
        total: 42,
        ...
      }
```

---

## 🧪 Testes

### Unit Tests (Domain Services - Puro)

| Arquivo | Cobertura |
|---------|-----------|
| `test_score_calculator.py` | Technical, Experience, Education, Communication, Leadership |
| `test_job_compatibility_calculator.py` | Skills matching, senioridade, pesos redistribuição |
| `test_deal_breaker_evaluator.py` | 8 tipos de campos, operadores |

**Rodando:**
```bash
pytest tests/unit/test_score_calculator.py -v
pytest tests/unit/test_job_compatibility_calculator.py -v
pytest tests/unit/test_deal_breaker_evaluator.py -v
```

### Integration Tests

| Arquivo | O Que Testa |
|---------|-----------|
| `test_deal_breaker_ranking.py` | Deal-breakers + ranking |
| `test_real_world_matching.py` | Fluxo completo candidato→vaga |
| `test_job_endpoints.py` | CRUD + update com skills |

**Rodando:**
```bash
pytest tests/integration/test_deal_breaker_ranking.py -v
pytest tests/integration/test_real_world_matching.py -v
```

### E2E Tests

```bash
pytest tests/e2e/test_matching_flow_e2e.py -v
```

---

## 🔍 Encontrar Código Rápido

### "Onde está a lógica de scoring de experience?"
```
src/domain/services/score_calculator.py
└─ _calculate_experience()
   └─ _experience_base_score()
   └─ _experience_detail()
```

### "Onde definir deal-breakers na vaga?"
```
src/interface/api/schemas/job_schemas.py
└─ class DealBreaker
   └─ field_validator("operator")
   └─ field_validator("value")
```

### "Como deal-breaker é avaliado?"
```
src/domain/services/deal_breaker_evaluator.py
└─ evaluate_deal_breakers()
   ├─ _check_location()
   ├─ _check_skill()
   └─ ... (outros 6 campos)
```

### "Onde ranking é computado?"
```
src/application/services/candidate_ranking_service.py
└─ compute_and_persist()
   └─ JobCompatibilityCalculator.calculate()
```

### "Onde resultado é cached?"
```
src/infrastructure/database/models/
├─ analysis_model.py (ScoreBreakdown)
└─ ... (candidate_job_score_model)
```

---

## 📚 Constantes & Configurações

### Pesos
```python
# ScoreCalculator
_DIMENSION_WEIGHTS = {
    "technical": 0.35,
    "experience": 0.30,
    "education": 0.15,
    "communication": 0.10,
    "leadership": 0.10,
}

# JobCompatibilityCalculator
_DIMENSION_WEIGHTS = {
    "mandatory_skills": 0.40,
    "optional_skills": 0.20,
    "seniority": 0.20,
    "experience": 0.10,
    "education": 0.10,
}
```

### Proficiency Scores
```python
_PROFICIENCY_SCORES = {
    "basic": 25,
    "intermediate": 50,
    "advanced": 75,
    "expert": 100,
}
```

### Education Scores
```python
_EDUCATION_SCORES = {
    "none": 10,
    "high_school": 25,
    "technical": 40,
    "bachelor": 62,
    "postgraduate": 72,
    "master": 83,
    "phd": 95,
}
```

---

## 🔧 Como Adicionar Novo Critério

### Exemplo: Adicionar "Número de Projectos"

1. **Adicionar a ExtractedResumeData:**
   ```python
   @dataclass
   class ExtractedResumeData:
       # ... campos existentes
       num_projects: int  ← NOVO
   ```

2. **IA extrai no v2_full_analysis.py:**
   ```python
   "num_projects": 12,
   ```

3. **ScoreCalculator calcula:**
   ```python
   def _calculate_projects(self, data: ExtractedResumeData) -> Score:
       # Lógica aqui
   ```

4. **Adiciona ao ScoreBreakdown:**
   ```python
   return ScoreBreakdown(
       # ... existing
       projects=self._calculate_projects(data),
   )
   ```

5. **Testa:**
   ```bash
   pytest tests/unit/test_score_calculator.py::test_projects_scoring
   ```

---

## 📖 Próximas Leituras

1. **Implementação Atual:**
   - `src/domain/services/score_calculator.py` (entenda a matemática)
   - `tests/unit/test_score_calculator.py` (veja casos de teste)

2. **Extensão Futura:**
   - `src/domain/services/job_compatibility_calculator.py`
   - `src/application/services/candidate_ranking_service.py`

3. **Integração:**
   - `src/infrastructure/ai/adapters/claude_adapter.py`
   - `src/interface/api/routers/jobs.py`

---

**Última atualização:** 29 de Abril de 2026  
**Versão:** 1.0

