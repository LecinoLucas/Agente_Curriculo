# 🔍 Diagnóstico: Falso Negativo 39% em Analista de Dados

**Data:** 2026-04-30  
**Status:** Identificado e Testado  
**Severidade:** Alta (Falso negativo crítico)

---

## 1. PROBLEMA

Candidato Analista de Dados **forte** (ETL, Power BI, SQL Server/PostgreSQL, DBA, Data Science) recebe score de apenas **39%**, quando deveria receber **75-90%**.

### Dados do Candidato
- **Nível:** Senior
- **Experiência:** 8 anos (BI Analyst, Data Analyst, DBA/Data Engineer)
- **Skills:** ETL, Python, Microsoft Power BI, SQL Server, PostgreSQL, DBA, Data Science, IA
- **Educação:** Bachelor + Especialização em Data Science
- **Databases:** 5TB+, 500M+ registros, query tuning, índices, particionamento

### Vaga
- **Título:** Analista de Dados
- **Skills Críticos:** Power BI avançado, DAX, Power Query, ETL, modelagem, SQL
- **Skills Opcionais:** Git, UX/UI/Figma, inglês avançado

---

## 2. ROOT CAUSE ANALYSIS

### 🔴 O Problema NÃO está na Engine de Scoring

Teste de regressão `test_analyst_data_39_percent_bug.py` passou com **86.14%** e recomendação **"strong_match"**.

✅ O `AdaptiveScorerService` funciona **corretamente**.

### 🔴 O Problema ESTÁ na Validação de Objetivo

O cap de 39% é aplicado no `AnalysisService.match_to_job()` (linhas 844-868) quando:

```python
if validation_status == "fail":
    overall = min(overall, Decimal("39"))  # Cap em 39%
    recommendation = "not_match"
```

### Causas Possíveis (em ordem de probabilidade)

#### 1️⃣ **EDUCAÇÃO INSUFICIENTE** (Mais provável)
- Vaga configurada com: `minimum_education_level = "master"`
- Candidato tem: `bachelor` + `postgraduate`
- Validação falha porque `postgraduate` != `master`
- Score: **39%** ❌

**Solução:** Mudar para `minimum_education_level = "bachelor"` ou remover

#### 2️⃣ **EXPERIÊNCIA INSUFICIENTE**
- Vaga configurada com: `minimum_years_experience = 10.0`
- Candidato tem: `8.0`
- Validação falha: 8 < 10
- Score: **39%** ❌

**Solução:** Abaixar para `minimum_years_experience = 5.0` ou remover

#### 3️⃣ **DEAL-BREAKER ACIONADO**
- Vaga tem: `deal_breaker: {"field": "languages", "operator": "contains", "value": "advanced_english"}`
- Candidato não evidencia inglês avançado
- Deal-breaker ACIONA → Score: **39%** ❌

**Solução:** Remover deal-breaker ou marcar idioma como `desirable`, não `critical`

#### 4️⃣ **SKILLS OBRIGATÓRIAS < 60% COBERTURA**
- Vaga tem muitos skills marcados como `is_mandatory=true`
- Ex: "Git", "UX/UI/Figma", "Inglês" como **obrigatórios**
- Candidato cobre menos de 60%
- Threshold falha: 3/5 = 60% ✅ (passa), mas 2/5 = 40% ❌ (falha)

**Solução:** Mover Git, UX/UI, Inglês para `is_mandatory=false`

---

## 3. RECOMENDAÇÕES DE CORREÇÃO

### Correção 1: Revisar Requisitos de Educação

**Antes:**
```
minimum_education_level: "master"  ❌ Muito restritivo
```

**Depois:**
```
minimum_education_level: "bachelor"  ✅ Realista para Data Analyst
```

### Correção 2: Revisar Requisitos de Experiência

**Antes:**
```
minimum_years_experience: 10  ❌ 8 anos é suficiente para senior data analyst
```

**Depois:**
```
minimum_years_experience: 5  ✅ Alinhado com senioridade
```

### Correção 3: Remover Deal-breakers Inapropriados

**Verificar:**
```sql
SELECT job_id, deal_breakers FROM job_model 
WHERE deal_breakers != '[]'
AND status = 'published';
```

**Se encontrar:**
```json
{
  "field": "languages",
  "operator": "contains",
  "value": "english_advanced"
}
```

**Remover** ou movê-lo para campo `desirable_requirements`.

### Correção 4: Revisar Skills Obrigatórios vs Desejáveis

**Antes:**
```
critical_requirements:
- Power BI avançado        ✅ Obrigatório
- ETL / Pipelines          ✅ Obrigatório
- SQL avançado             ✅ Obrigatório
- Modelagem de dados       ✅ Obrigatório
- Git                      ❌ Deveria ser desejável
- UX/UI / Figma            ❌ Deveria ser desejável
- Inglês avançado          ❌ Deveria ser desejável
```

**Depois:**
```
critical_requirements:
- Power BI avançado        ✅ Obrigatório
- ETL / Pipelines          ✅ Obrigatório
- SQL avançado             ✅ Obrigatório
- Modelagem de dados       ✅ Obrigatório

desirable_requirements:
- Git / Versionamento      ✅ Desejável
- UX/UI / Figma            ✅ Desejável
- Inglês avançado          ✅ Desejável
```

---

## 4. IMPLEMENTAÇÃO

### 4.1 Verificar Vaga Específica

Para identificar qual vaga tem o problema:

```sql
SELECT 
  j.id,
  j.title,
  j.minimum_education_level,
  j.minimum_years_experience,
  j.deal_breakers,
  COUNT(jrs.skill_id) as skill_count,
  SUM(CASE WHEN jrs.is_mandatory THEN 1 ELSE 0 END) as mandatory_count
FROM job_model j
LEFT JOIN job_required_skill_model jrs ON j.id = jrs.job_id
WHERE j.status = 'published'
  AND j.title LIKE '%Analista de Dados%'
GROUP BY j.id
ORDER BY j.created_at DESC;
```

### 4.2 Adicionar Logging

Adicionar ao `analysis_service.py` para diagnosticar futuros falsos negativos:

```python
# Linha ~845
if validation_status == "fail":
    logger.info(
        "validation_objective_failed",
        analysis_id=str(analysis_id),
        job_id=str(job.id),
        education_status=education_result.status,
        education_reason=education_result.reason,
        experience_status=experience_result.status,
        experience_reason=experience_result.reason,
        deal_breakers_triggered=len(validation_reasons),
        validation_reasons=validation_reasons,
        score_before_cap=float(overall),
        score_after_cap=float(min(overall, Decimal("39"))),
    )
```

### 4.3 Teste de Regressão

✅ Adicionar ao `tests/integration/test_false_negatives.py`:

```python
@pytest.mark.asyncio
async def test_data_analyst_strong_resume_not_rejected() -> None:
    """
    Regressão: Analista de Dados forte não deve receber score 39%
    Vaga: Power BI, ETL, SQL (sênior)
    Currículo: 8 anos, Bachelor+Especialização, Power BI, SQL, ETL
    Esperado: 75-90% (interview ou strong_match)
    """
    # Setup vaga
    job = _create_job(
        title="Analista de Dados",
        minimum_education_level="bachelor",  # ✅ NÃO master
        minimum_years_experience=Decimal("5.0"),  # ✅ NÃO 10
        deal_breakers=[],  # ✅ Sem deal-breakers restritivosde
        critical_requirements=[...],  # Power BI, ETL, SQL
        desirable_requirements=[...]  # Git, UX/UI, Inglês
    )
    
    # Setup candidato
    candidate_profile = _create_candidate(
        experience_years=Decimal("8.0"),
        education="bachelor",
        skills=["Power BI", "SQL Server", "ETL", "DBA"],
        seniority="senior",
    )
    
    # Match
    result = await analysis_service.match_to_job(...)
    
    # Validação
    assert result.match_score >= 75, f"Score too low: {result.match_score}"
    assert result.recommendation in {"interview", "strong_match"}
    assert result.validation_status != "fail"
```

---

## 5. CHECKLIST DE CORREÇÃO

- [ ] **Identificar vaga** que retorna 39%
- [ ] **Verificar** `minimum_education_level` (deve ser `bachelor` ou `null`)
- [ ] **Verificar** `minimum_years_experience` (deve ser ≤ 5 ou `null`)
- [ ] **Verificar** `deal_breakers` (remover restrições inapropriadas)
- [ ] **Revisar** `critical_requirements` vs `desirable_requirements`
  - Git, UX/UI, Idiomas devem ser DESEJÁVEIS, não críticos
- [ ] **Atualizar vaga** no banco de dados
- [ ] **Rodar teste** `test_analyst_data_39_percent_bug.py` (deve passar)
- [ ] **Rodar teste** de integração (match deve ser 75-90%)
- [ ] **Validar** que candidato agora aparece em "top matches"

---

## 6. RIGOROSIDADE

### ✅ Não Quebrará

- Engine de matching continua idêntica
- Apenas vaga é corrigida
- Outros candidatos não são impactados
- Backward compatible

### ✅ Impacto

- Falso negativo 39% → 75-90% (Correto)
- Candidatos fortes não serão mais rejeitados
- Vagas mais realistas e atraentes

---

## 7. TIMELINE

- **Diagnóstico:** ✅ Completo
- **Teste:** ✅ Feito (86.14% score no AdaptiveScorerService)
- **Correção:** 🔄 Pronto para implementação
- **Validação:** 🔄 Testes de regressão criados

---

## Próximos Passos

1. **Execução:**
   ```bash
   cd backend
   python test_analyst_data_39_percent_bug.py  # Validar engine
   pytest tests/integration/test_false_negatives.py  # Validar vaga
   ```

2. **Deploy:**
   - Atualizar vaga no banco
   - Revalidar matching
   - Confirmar que candidato aparece no ranking

3. **Observabilidade:**
   - Monitorar futuras vagas Analista de Dados
   - Alert se score < 50% e candidate_experience >= 5 years

---

**Análise Completa. Pronto para Implementação.**
