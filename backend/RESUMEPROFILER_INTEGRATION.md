# Integração do ResumeProfiler ao fluxo de Análise

## Status Atual (Fase 3 — Extração de Evidências)

O `ResumeProfilerService` foi implementado para extrair perfis semânticos de candidatos a partir de currículos.
Funciona como uma camada SEPARADA da análise existente, sem alterar o fluxo de ranking atual.

## Arquitetura

### Componentes Criados

1. **CandidateProfile** (`src/domain/value_objects/candidate_profile.py`)
   - Value object imutável representando evidências extraídas de um currículo
   - Não faz julgamentos de compatibilidade
   - Foco em EVIDÊNCIAS comprovadas

2. **ResumeProfilerService** (`src/application/services/resume_profiler_service.py`)
   - Serviço que gera CandidateProfile a partir de texto de currículo
   - Hash-based caching (SHA-256 dos primeiros 16 caracteres)
   - Fallback seguro quando IA falha (nunca levanta exceção)
   - Non-blocking para a análise existente

3. **Resume Profiler Prompt** (`src/infrastructure/ai/prompts/resume_profiler.py`)
   - Instruções para IA extrair evidências estruturadas
   - Diferencia competências profundas vs. superficiais
   - Extrai liderança, impacto nos negócios, educação, certificações

## Como Ativar ResumeProfiler na Análise

### Opção 1: Sem ResumeProfiler (padrão atual — compatibilidade)

```python
# src/application/services/analysis_service.py
# AnalysisService é inicializado sem resume_profiler_service

async def _analyze_candidate(self, candidate_id: UUID) -> AnalysisResult:
    # Fluxo antigo continua funcionando normalmente
    pass
```

**Resultado:** Análise funciona com o método antigo, sem CandidateProfile.

---

### Opção 2: Com ResumeProfiler (para ativar quando quiser)

```python
# src/application/services/analysis_service.py
from src.application.services.resume_profiler_service import (
    InMemoryCandidateProfileCache,
    ResumeProfilerService,
)
from src.infrastructure.ai.factory import ai_factory

class AnalysisService:
    def __init__(
        self,
        repository: SQLAlchemyAnalysisRepository,
        # ... outras dependências ...
        resume_profiler_service: ResumeProfilerService | None = None,
    ):
        self._resume_profiler = resume_profiler_service
        # ... resto do init ...

    async def analyze(self, candidate_id: UUID, resume_text: str) -> AnalysisResult:
        # Gera CandidateProfile em paralelo com análise existente
        candidate_profile = await self._maybe_generate_candidate_profile(resume_text)
        
        # Fluxo antigo continua intacto
        analysis_result = await self._old_analysis_flow(candidate_id, resume_text)
        
        # Armazena profile para fase 2 (matching)
        if candidate_profile:
            analysis_result.candidate_profile = candidate_profile
        
        return analysis_result

    async def _maybe_generate_candidate_profile(self, resume_text: str) -> CandidateProfile | None:
        if not self._resume_profiler:
            return None
        
        try:
            return await self._resume_profiler.generate_profile(resume_text)
        except Exception as exc:
            logger.warning("candidate_profile_generation_failed", error=str(exc))
            return None
```

---

## Fluxo da Integração

### 1. Ao executar análise completa de candidato

```python
POST /analyses
{
  "candidate_id": "uuid",
  "resume_text": "...",
  "job_id": "uuid"  # opcional — para futura matching phase
}
```

**Sem ResumeProfiler:** Análise segue fluxo antigo, sem CandidateProfile.

**Com ResumeProfiler:**
1. Resume é analisado pelo fluxo antigo (compatibilidade 100%)
2. Em paralelo, `ResumeProfilerService` extrai `CandidateProfile`
3. Se IA falhar no perfil, análise continua (fallback seguro)
4. `CandidateProfile` é armazenado em `analysis_result` para Fase 2

### 2. Armazenamento de CandidateProfile (Opcional — não implementado ainda)

Pode-se adicionar campos a `AnalysisResultModel`:

```python
# Futura migração (não necessária para Fase 3)
ALTER TABLE analysis_results ADD COLUMN candidate_profile_json JSONB;
ALTER TABLE analysis_results ADD COLUMN candidate_profile_hash VARCHAR(16);
```

---

## Diferenças: CandidateProfile vs. Análise Antiga

| Aspecto | Análise Antiga (v1/v2) | CandidateProfile (Novo) |
|---------|------------------------|------------------------|
| Foco | Compatibilidade com vaga | Evidências puras do candidato |
| Fonte | Prompt genérico + resumé | Prompt estruturado + resumé |
| Saída | scores, competências | experiências, skills, educação |
| Dependência | Vaga específica (para ranking) | Nenhuma — independente |
| Persistência | AnalysisResultModel | Opcional (Fase 2) |
| Cache | Não | Hash-based (SHA-256) |

---

## Observabilidade

Quando habilitado, logs estruturados incluem:

### Sucesso

```json
{
  "event": "resume_profiler.ai_response",
  "detected_level": "senior",
  "experience_years": 7.0,
  "completeness": 0.88,
  "confidence": "high",
  "input_tokens": 1200,
  "output_tokens": 2400
}
```

### Falha (não bloqueia)

```json
{
  "event": "resume_profiler.ai_failed",
  "hash": "abc12345",
  "error": "API timeout"
}
```

### Cache Hit

```json
{
  "event": "resume_profiler.cache_hit",
  "hash": "abc12345"
}
```

---

## Testes

### Testes do ResumeProfilerService

```bash
pytest tests/unit/test_resume_profiler_service.py -v
```

Cobre:
- Geração de perfil a partir de currículo
- Cache hits, misses e invalidação
- Diferentes níveis de senioridade (junior → senior → lead)
- Diferentes áreas profissionais (technology, data, financial, etc.)
- Extração de evidências (skills, experiences, education, certifications)
- Impacto nos negócios
- Completeness scoring
- Erro da IA com fallback seguro
- Serialização round-trip

**Resultado:** 24/24 testes passando ✓

### Suite Completa

```bash
pytest tests/unit/ -q
```

---

## Próximas Fases

### Fase 3.1 — Persistência (Opcional)

Se decidir persistir CandidateProfile:
1. Criar migration para adicionar `candidate_profile_json` e hash
2. Armazenar no `AnalysisResultModel`
3. Expor em respostas da API

### Fase 4 — EvidenceMatcher (Matching)

Quando implementado:
```python
evidence_mapping = await evidence_matcher.match(
    job_profile=job_profile,          # Do JobProfilerService
    candidate_profile=candidate_profile  # Do ResumeProfilerService
)
```

Realiza matching semântico entre competências da vaga e evidências do candidato.

### Fase 5 — AdaptiveScorer (Scoring)

```python
score = adaptive_scorer.compute(
    evidence_mapping=evidence_mapping,
    weights=job_profile.adaptive_weights
)
```

---

## Compatibilidade

✅ **Sistemas antigos continuam funcionando 100%:**
- Análise v1/v2 não foi alterada
- Ranking não foi alterado
- Endpoints públicos não mudaram
- ResumeProfilerService é opcional (`None` por padrão)
- Se ResumeProfilerService falhar, análise continua

---

## Rollback

Se precisar desativar:

```python
# Em AnalysisService.__init__
# Remova a injeção de resume_profiler_service
# Ou deixe como None

# A análise continuará funcionando com o fluxo antigo
```

---

## Estrutura de CandidateProfile

```python
CandidateProfile(
    detected_level="senior",  # intern | junior | mid | senior | lead | principal
    estimated_experience_years=7.0,
    current_role="Senior Backend Engineer",
    professional_area="technology",  # 8 áreas profissionais
    experiences=[
        Experience(
            company="TechCorp",
            role="Senior Engineer",
            duration_months=36,
            is_current=True,
            is_leadership=False,
            key_activities=[...],
            technologies_used=[...]
        )
    ],
    evidenced_skills=[
        EvidencedSkill(
            name="Backend Development with Python",
            evidence_text="5 years building APIs",
            confidence="very_high",
            years_evidenced=5.0,
            source="experience"
        )
    ],
    tools_and_systems=["Python", "FastAPI", "PostgreSQL"],
    capabilities=[
        CandidateCapability(
            name="Problem Solving",
            evidence_text="Resolved complex architectural issues",
            strength="high",
            source="experience",
            confidence="high"
        )
    ],
    education=[
        EducationEntry(
            level="bachelor",
            field="Computer Science",
            institution="MIT",
            graduation_year=2020,
            is_completed=True
        )
    ],
    certifications=[
        CertificationEntry(
            name="AWS Solutions Architect",
            issuer="Amazon",
            obtained_date="2021-06",
            is_active=True
        )
    ],
    leadership_evidence=["Managed team of 5 engineers"],
    business_impact_evidence=["Improved API performance by 40%"],
    profile_completeness=0.88,  # 0.0-1.0
    confidence="high",  # very_high | high | medium | low
    resume_hash="abc12345..."
)
```

---

## Properties Úteis

```python
profile = candidate_profile

# Verificar se currículo é bem descrito
if profile.is_well_described:  # >= 0.60
    print("Currículo tem informações suficientes")

# Contar evidências
num_skills = profile.total_skills_evidenced
num_roles = profile.total_experiences

# Verificar liderança
if profile.has_leadership:
    for evidence in profile.leadership_evidence:
        print(f"Liderança: {evidence}")
```

---

## Próximos Passos

1. **Integrar no AnalysisService:** Opcionalmente habilitar na análise existente
2. **Monitorar logs:** Validar que perfis estão sendo gerados corretamente
3. **Fase 4:** Implementar EvidenceMatcher
4. **Fase 5:** Implementar AdaptiveScorer
5. **Fase 6:** Migrar ranking final para usar evidence-based matching

---

## Pontos de Decisão

### 1. Quando ativar na API?

**Opção A:** Imediatamente (não afeta ranking, apenas coleta dados)
- Benefício: Começa a gerar histórico para Fase 4
- Risco: Custo de IA adicional

**Opção B:** Quando precisar para Fase 4 (EvidenceMatcher)
- Benefício: Sem custo desnecessário
- Risco: Sem dados históricos

### 2. Persistir CandidateProfile?

**Opção A:** No AnalysisResultModel (atual plano)
- Benefício: Histórico completo
- Risco: Schema adicional

**Opção B:** Apenas em memória durante análise
- Benefício: Simples, sem persistência
- Risco: Sem histórico para auditoria

### 3. Usar para fase de pré-screening?

CandidateProfile pode ser usado para descartar candidatos antes do matching:
- "Não tem educação mínima" → descarta
- "Nível muito junior" → descarta
- "Experiência em área completamente diferente" → descarta

---
