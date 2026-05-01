# Integração do JobProfiler ao fluxo de Vagas

## Status Atual (Fase 1 — Fundação)

O `JobProfilerService` foi integrado ao `JobService`, mas a injeção de dependência nos endpoints ainda está comentada. Isso permite ativar o recurso com uma pequena mudança no código, sem quebrar a compatibilidade com o fluxo antigo.

## Como Ativar JobProfile na API

### Opção 1: Sem JobProfile (padrão atual — compatibilidade)

```python
# src/interface/api/routers/jobs.py
def _job_service(db: AsyncSession) -> JobService:
    return JobService(SQLAlchemyJobRepository(db))
```

**Resultado:** Vagas funcionam normalmente, sem geração de perfil.

---

### Opção 2: Com JobProfile (para habilitar quando quiser)

```python
# src/interface/api/routers/jobs.py
from src.application.ports.ai_service import AIService
from src.infrastructure.ai.factory import ai_factory
from src.application.services.job_profiler_service import (
    InMemoryJobProfileCache,
    JobProfilerService,
)

def _job_service(db: AsyncSession, ai_service: AIService = Depends(lambda: ai_factory())) -> JobService:
    cache = InMemoryJobProfileCache()
    profiler = JobProfilerService(ai_service=ai_service, cache=cache)
    return JobService(SQLAlchemyJobRepository(db), job_profiler_service=profiler)
```

**Resultado:** Ao criar/editar vaga, `job_profile_json` e `job_profile_hash` são automaticamente preenchidos.

---

## Fluxo Atual da Integração

### 1. Ao criar uma vaga

```python
POST /jobs
{
  "title": "Desenvolvedor Python Sênior",
  "description": "Buscamos um desenvolvedor com 5+ anos...",
  "status": "draft"
}
```

**Sem JobProfiler:** Vaga é criada normalmente.

**Com JobProfiler:** 
1. Vaga é criada no banco
2. `JobProfilerService` é chamado com `title + description`
3. IA extrai `JobProfile` (area, target_level, requirements, etc.)
4. Perfil é persistido em `job_profile_json` e `job_profile_hash`
5. Se IA falhar, vaga continua funcionando (fallback seguro)

### 2. Ao editar uma vaga

```python
PATCH /jobs/{job_id}
{
  "description": "Nova descrição com mais detalhes..."
}
```

**Sem JobProfiler:** Vaga é atualizada.

**Com JobProfiler:** 
- Se `title` ou `description` mudam → novo `JobProfile` é gerado
- Se outro campo muda → `JobProfile` não é regenerado
- Falhas da IA não afetam a edição

### 3. Ao recuperar uma vaga

```python
GET /jobs/{job_id}
```

**Novo campo no response (opcional):**

```json
{
  "id": "uuid",
  "title": "Desenvolvedor Python Sênior",
  "description": "...",
  "job_profile_json": {
    "area": "technology",
    "target_level": "senior",
    "main_mission": "...",
    "critical_requirements": [...],
    "adaptive_weights": {...},
    ...
  },
  "job_profile_hash": "abc12345"
}
```

---

## Banco de Dados

### Campos adicionados a `jobs` table

```sql
ALTER TABLE jobs ADD COLUMN job_profile_json JSONB;
ALTER TABLE jobs ADD COLUMN job_profile_hash VARCHAR(16);
```

**Migração:** `f1e2d3c4b5a6_add_job_profile_fields.py`

---

## Observabilidade

Quando habilitado, os logs estruturados incluem:

### Sucesso

```json
{
  "event": "job_profile_generated",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "area": "technology",
  "target_level": "senior",
  "completeness": 0.85,
  "confidence": "high"
}
```

### Falha (não bloqueia)

```json
{
  "event": "job_profile_generation_failed",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "error": "API timeout"
}
```

---

## Próximas Fases

### Fase 2 — ResumeProfiler + EvidenceMatcher

Quando implementado, o `JobProfile` será usado assim:

```python
# Próxima fase (não implementado ainda)
resume_profile = await resume_profiler.generate(resume_text)
evidence_mapping = await evidence_matcher.match(
    job_profile=job_profile,
    candidate_profile=resume_profile
)
```

### Fase 3 — AdaptiveScorer com pesos dinâmicos

```python
# Próxima fase
score = adapter_scorer.compute(
    evidence_mapping=evidence_mapping,
    weights=job_profile.adaptive_weights  # ← usa pesos da área
)
```

---

## Testes

### Com Job Profiler Ativo

```bash
pytest tests/unit/test_job_service_with_profiler.py -v
```

Cobre:
- Criação com geração de perfil
- Edição com regeneração condicional
- Falhas de IA (fallback seguro)
- Persistência de JSON e hash
- Cache entre vagas

**Resultado:** 10/10 testes passando ✓

### Suite Completa

```bash
pytest tests/unit/ -q
```

**Resultado:** 293/293 testes passando ✓

---

## Próximos Passos

1. **Habilitar na API:** Uncomment as linhas de injeção em `jobs.py`
2. **Monitorar logs:** Validar que perfis estão sendo gerados
3. **Implementar ResumeProfiler:** Fase 2 do blueprint
4. **Implementar EvidenceMatcher:** Fase 3 do blueprint
5. **Integrar AdaptiveScorer:** Usar `job_profile.adaptive_weights`

---

## Compatibilidade

✅ **Sistemas antigos continuam funcionando:**
- `required_skills` (manual) continuam sendo usadas
- `JobCompatibilityCalculator` não foi alterado
- `CandidateRankingService` não foi alterado
- Endpoints públicos não mudaram
- Migrações são reversíveis

---

## Rollback

Se precisar desativar:

```bash
# Reverter migração
alembic downgrade b7d1e3a4c5f8

# Remover JobProfilerService do endpoint
# (volta ao _job_service original)
```

A vaga continuará funcionando normalmente, apenas sem o JobProfile.
