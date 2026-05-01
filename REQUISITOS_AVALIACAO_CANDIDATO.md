# Requisitos de Avaliação de Candidatos - Resume AI System

## 📋 Visão Geral

O sistema avalia candidatos em **dois níveis**:

1. **Análise Baseada em IA** (ScoreCalculator)
   - Extrai e pontura características objetivas do currículo
   - Gera scores por dimensão (Technical, Experience, Education, etc.)
   - Independente da vaga

2. **Compatibilidade com Vaga** (JobCompatibilityCalculator)
   - Compara o candidato com requisitos específicos da vaga
   - Gera match_score e recomendação
   - Aplica regras de deal-breaker (eliminação automática)

---

## 🤖 NÍVEL 1: ANÁLISE DO CURRÍCULO (IA)

### Processamento do Prompt (v2_full_analysis)

**Entrada:** Texto do currículo  
**Saída:** JSON estruturado com

```json
{
  "match_score": 75,
  "level_detected": "senior | pleno | junior | lead | indefinido",
  "strengths": ["evidência 1", "evidência 2"],
  "gaps": ["lacuna 1"],
  "risk_points": ["risco 1"],
  "recommendation": "reject | maybe | interview | strong_match",
  "analysis_summary": "Explicação clara"
}
```

**Princípios da IA:**
- ✅ Baseado em evidências explícitas do currículo
- ✅ Não inventar informações não mencionadas
- ✅ Não inferir além do evidenciado
- ✅ Diferenciar "não possui" vs "não informado"
- ✅ Considerar experiências equivalentes (ex: Python vs Ruby para backend)
- ✅ Adaptar à área da vaga (Tech ≠ Contábil ≠ Comercial)

### Critérios de Scoring IA (0-100)

| Critério | Peso | Descrição |
|----------|------|-----------|
| **Hard Skills** | 0-30 | Ferramentas, tecnologias, conhecimentos técnicos específicos |
| **Experiência Prática** | 0-25 | Aplicação real no trabalho, projetos relevantes |
| **Aderência à Função** | 0-20 | Similaridade entre experiências e a vaga |
| **Senioridade** | 0-15 | Nível compatível (junior/pleno/sênior/lead) |
| **Diferenciais** | 0-10 | Certificações, projetos, autonomia, impacto |

---

## 📊 NÍVEL 2: SCORE BREAKDOWN (ScoreCalculator)

Após extrair dados estruturados, calcula scores por **5 dimensões**:

### Dimensão 1: Technical (35%)

**Métricas:**
- Profundidade: média de proficiência das skills
- Amplitude: número de categorias de tecnologia (min(categorias × 12.5, 100))
- Expertise primária: quantidade de skills "expert" (min(experts × 20, 100))

**Fórmula:**
```
Technical = (profundidade × 0.50) + (amplitude × 0.30) + (expertise × 0.20)
```

**Níveis de Proficiência:**
| Nível | Score |
|-------|-------|
| Basic | 25 |
| Intermediate | 50 |
| Advanced | 75 |
| Expert | 100 |

**Exemplo:**
- 5 skills: Java (expert), Python (advanced), Docker (intermediate), SQL (advanced), React (basic)
- Profundidade: (100 + 75 + 50 + 75 + 25) / 5 = 65
- Amplitude: 3 categorias (backend, devops, frontend) = min(3 × 12.5, 100) = 37.5
- Expertise: 1 expert = min(1 × 20, 100) = 20
- **Score: (65 × 0.5) + (37.5 × 0.3) + (20 × 0.2) = 32.5 + 11.25 + 4 = 47.75**

---

### Dimensão 2: Experience (30%)

**Componentes:**
1. **Base Score por Anos Trabalhados** (tabela de bandas)
2. **Bônus de Liderança** (+8 pontos se tem roles de liderança)
3. **Penalidade de Gaps** (-5 pontos por gap > 6 meses)

**Tabela de Experiência:**
| Anos | Score |
|------|-------|
| 0 | 5 |
| 1+ | 25 |
| 2+ | 40 |
| 3+ | 55 |
| 5+ | 68 |
| 7+ | 78 |
| 10+ | 88 |
| 12+ | 95 |
| 15+ | 100 |

**Fórmula:**
```
Experience = base_score_anos + (8 se tem_liderança) - (5 × gaps_significativos)
```

**Exemplo:**
- 8 anos de experiência → base = 78
- Tem roles de liderança → +8
- 1 gap de 8 meses → -5
- **Score: 78 + 8 - 5 = 81**

---

### Dimensão 3: Education (15%)

**Componentes:**
1. **Base Score do Nível Educacional**
2. **Bônus de Relevância** (campo relevante para a área?)
3. **Bônus de Certificações** (máx 10 pontos)

**Scores por Nível:**
| Nível | Score |
|-------|-------|
| Nenhuma | 10 |
| Ensino Médio | 25 |
| Técnico | 40 |
| Graduação | 62 |
| Pós-Graduação | 72 |
| Mestrado | 83 |
| Doutorado | 95 |

**Bônus de Relevância:**
| Relevância | Bônus |
|-----------|-------|
| Alta | +10 |
| Média | +5 |
| Baixa | 0 |

**Bônus de Certificações:**
- +2.5 por certificação relevante
- Máximo: +10

**Fórmula:**
```
Education = base_nível + bonus_relevância + min(2.5 × num_certs, 10)
```

**Exemplo:**
- Graduação em Eng. Computação → 62
- Campo relevante (Alta) → +10
- 3 certificações (AWS, GCP, Azure) → min(2.5 × 3, 10) = 7.5
- **Score: 62 + 10 + 7.5 = 79.5**

---

### Dimensão 4: Communication (10%)

Avaliação qualitativa da IA sobre o **documento em si**:

**Sub-critérios:**
| Critério | Peso |
|----------|------|
| Estrutura | 30% |
| Clareza | 30% |
| Profissionalismo | 20% |
| Completude | 20% |

**Fórmula:**
```
Communication = (estrutura × 0.30) + (clareza × 0.30) + (profissionalismo × 0.20) + (completude × 0.20)
```

**O que a IA avalia:**
- ✅ Uso de bullet points, hierarquia clara
- ✅ Linguagem objetiva, sem jargão excessivo
- ✅ Tom apropriado, sem erros
- ✅ Todas as seções importantes preenchidas

---

### Dimensão 5: Leadership (10%)

**Indicadores Binários** detectados pela IA:

| Indicador | Pontos | Descrição |
|-----------|--------|-----------|
| has_management | 40 | Gestão de pessoas (team lead, manager, etc.) |
| has_project_lead | 30 | Liderança de projeto/produto |
| has_mentoring | 20 | Mentoria / desenvolvimento de equipe |
| has_cross_team | 10 | Colaboração entre times/áreas |

**Fórmula:**
```
Leadership = soma dos indicadores presentes
```

**Máximo:** 40 + 30 + 20 + 10 = 100

**Exemplo:**
- Tem gestão de equipe (40)
- Tem liderança de projeto (30)
- Sem mentoring (0)
- Tem colaboração cross-team (10)
- **Score: 40 + 30 + 0 + 10 = 80**

---

## 📊 OVERALL SCORE (ScoreBreakdown)

**Fórmula:**
```
OVERALL = (Technical × 0.35) + (Experience × 0.30) + (Education × 0.15) 
          + (Communication × 0.10) + (Leadership × 0.10)
```

**Range:** 0-100  
**Output:** Usado como baseline antes do matching com vaga

---

## 🎯 NÍVEL 3: MATCHING COM VAGA (JobCompatibilityCalculator)

Comparação estruturada entre candidato e requisitos da vaga.

### Dimensões de Matching

| Dimensão | Peso | Critério |
|----------|------|----------|
| **Skills Obrigatórias** | 40% | Cobertura ponderada pelos pesos da vaga |
| **Skills Opcionais** | 20% | Bônus por skills desejáveis presentes |
| **Senioridade** | 20% | Adequação ao nível exigido |
| **Experiência (anos)** | 10% | Atendimento ao mínimo de anos |
| **Educação** | 10% | Atendimento ao nível educacional mínimo |

**Nota:** Pesos são redistribuídos quando categorias estão ausentes.

---

### Skill Matching

#### Skills Obrigatórias (Mandatory)

**Crédito por Proficiency:**
- ❌ Nível abaixo do mínimo → 50% crédito (penaliza mas não bloqueia)
- ✅ Nível igual ao mínimo → 100% crédito
- ✅ Nível acima do mínimo → 100% crédito + flag "exceeds_requirement"

**Cada skill obrigatória pode ter:**
- `weight`: importância relativa (1.0 = padrão)
- `minimum_level`: level mínimo exigido (basic/intermediate/advanced/expert)
- `minimum_years`: anos mínimos com essa skill

**Cálculo:**
```
skill_score = (num_skills_cobertas_100% / total_obrigatórias) × 100
              + (num_skills_50% × 0.5)
mandatory_score = weighted_average(skill_scores)
```

**Exemplo:**
- Vaga exige: Java (obrigatória, advanced, weight=2.0), SQL (obrigatória, intermediate)
- Candidato tem: Java advanced, SQL basic
- Java: 100% (atende o level) × weight 2.0
- SQL: 50% (abaixo do level intermediate) × weight 1.0
- Score: ((100% × 2.0) + (50% × 1.0)) / 3.0 = 83.3

#### Skills Opcionais (Desirable)

- Bônus por skills que o candidato tem além do esperado
- Bônus escalonado (não linear, para evitar distorções)

---

### Senioridade Matching

**Mapeamento de Níveis:**
```
Order: INTERN → JUNIOR → MID → SENIOR → LEAD → PRINCIPAL → DIRECTOR
```

**Score por Distância:**
| Distância | Score |
|-----------|-------|
| 0 (exato) | 100 |
| 1 nível | 75 |
| 2 níveis | 45 |
| 3+ níveis | 20 |

**Penalidade de Sobre-qualificação:**
- Aplicada quando candidato está **2+ níveis acima** do requisito
- Multiplicador: × 0.90 (reduz score em 10%)
- Razão: evitar rotatividade por sub-utilização

**Exemplo:**
- Vaga exige: SENIOR
- Candidato é: DIRECTOR (4 níveis acima)
- Distância = 3 → score = 20 × 0.90 = 18

---

### Experience Matching (Anos)

**Regra Simples:**
```
if candidato_anos >= job_min_years:
  score = 100
elif candidato_anos >= job_min_years × 0.75:
  score = 75
elif candidato_anos >= job_min_years × 0.5:
  score = 50
else:
  score = 25
```

---

### Education Matching

**Mapeamento de Ranks:**
```
none(0) → high_school(1) → technical(2) → bachelor(3) 
→ postgraduate(4) → master(5) → phd(6)
```

**Score por Distância:**
| Distância | Score |
|-----------|-------|
| 0 (atende) | 100 |
| -1 nível | 60 |
| -2 níveis | 30 |

---

### Match Score Overall

**Fórmula:**
```
match_score = (mandatory × 0.40) + (optional × 0.20) 
             + (seniority × 0.20) + (experience × 0.10) 
             + (education × 0.10)
```

**Redistribuição de Pesos:**
- Se sem skills obrigatórias: seus 40% redistribuem para experience + education
- Se sem skills opcionais: seus 20% vão para obrigatórias

---

## 🚫 ELIMINAÇÃO AUTOMÁTICA (Deal-Breakers)

Regras que **rejeitam automaticamente** o candidato sem análise adicional.

### Campos Suportados

#### 1. Location (Localização)
**Operadores:** equals, not_equals, contains, in

```json
{
  "field": "location",
  "operator": "equals",
  "value": "São Paulo",
  "reason": "Vaga requer presença em SP"
}
```
Extrai cidade do currículo e compara.

---

#### 2. Work Model (Modelo de Trabalho)
**Operadores:** equals, not_equals

```json
{
  "field": "work_model",
  "operator": "not_equals",
  "value": "remote",
  "reason": "Vaga é presencial apenas"
}
```
Compara modelo de trabalho preferido/possível do candidato.

---

#### 3. Education Level (Nível Educacional)
**Operadores:** equals, >= (mínimo)

```json
{
  "field": "education_level",
  "operator": ">=",
  "value": "bachelor",
  "reason": "Mínimo: Graduação"
}
```
Compara nível máximo atingido: none < high_school < technical < bachelor < postgraduate < master < phd

---

#### 4. Experience Years (Anos de Experiência)
**Operadores:** equals, >=, <= 

```json
{
  "field": "experience_years",
  "operator": ">=",
  "value": "5",
  "reason": "Mínimo 5 anos"
}
```
Usa total_experience_months / 12.

---

#### 5. Skill (Presença/Ausência)
**Operadores:** contains, not_contains

```json
{
  "field": "skill",
  "operator": "contains",
  "value": "kubernetes",
  "reason": "Obrigatório para o projeto"
}
```
Verifica se skill está na lista de skills do candidato (case-insensitive).

---

#### 6. Language (Idioma)
**Operadores:** equals, contains

```json
{
  "field": "language",
  "operator": "contains",
  "value": "English",
  "reason": "Cliente internacional"
}
```
Busca idiomas declarados no currículo.

---

#### 7. Availability (Disponibilidade)
**Operadores:** equals

```json
{
  "field": "availability",
  "operator": "equals",
  "value": "immediate",
  "reason": "Precisa disponível imediatamente"
}
```

---

#### 8. Custom Text (Campo Customizado)
**Operadores:** contains

```json
{
  "field": "custom_text",
  "operator": "contains",
  "value": "project management",
  "reason": "Menção a experiência com gerenciamento de projetos"
}
```
Busca texto no currículo.

---

### Execução

```python
violations = evaluate_deal_breakers(job.deal_breakers, candidate_data)

if violations:
  # Candidato rejeitado automaticamente
  reason_codes = [
    {
      "type": "deal_breaker",
      "field": "skill",
      "impact": -100.0,
      "expected": "kubernetes",
      "actual": "não encontrado",
      "reason": "Obrigatório para o projeto"
    }
  ]
```

**Impacto:** -100.0 (rejeição automática)

---

## 🎯 RECOMENDAÇÃO FINAL

Após matching com a vaga:

### Regras de Recomendação

```python
if match_score >= 82 AND mandatory_skills_coverage >= 90%:
  recommendation = "STRONG_MATCH"      # ✅ Entrevista + alta prioridade
  
elif match_score >= 65 AND mandatory_skills_coverage >= 75%:
  recommendation = "GOOD_MATCH"        # ✅ Entrevista
  
elif match_score >= 45 AND mandatory_skills_coverage >= 50%:
  recommendation = "POTENTIAL"         # ⚠️ Entrevista condicional
  
else:
  recommendation = "NOT_RECOMMENDED"   # ❌ Rejeição
```

### Deal-Breaker Override

- Se `violations` > 0 → candidato é rejeitado
- **Não há override** (deal-breaker é absolutamente bloqueante)

---

## 📈 FLUXO COMPLETO

```
┌─────────────────────┐
│  1. Upload Currículo │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────┐
│ 2. AI Analysis (v2_prompt)  │
│ - Extrai estrutura IA       │
│ - Gera match_score (0-100)  │
│ - Detecta "maybe/interview" │
└──────────┬──────────────────┘
           │
           ▼
┌──────────────────────────┐
│ 3. ScoreBreakdown        │
│ - Technical (35%)        │
│ - Experience (30%)       │
│ - Education (15%)        │
│ - Communication (10%)    │
│ - Leadership (10%)       │
│ → Overall Score (0-100)  │
└──────────┬───────────────┘
           │
    ┌──────▼──────┐
    │  Associate   │
    │  com Vaga?   │
    └──────┬───────┘
           │
           ▼
┌──────────────────────────┐
│ 4. Deal-Breaker Check    │
│ - Localização            │
│ - Work model             │
│ - Education              │
│ - Skills obrigatórias    │
│ - Outros critérios       │
└──────────┬───────────────┘
      ┌────┴────┐
      │          │
    VIOLAÇÃO   OK
      │          │
      ▼          ▼
   REJECT    JobCompatibility
             Calculator
             └─────┬──────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ 5. Recomendação Final │
        │ - STRONG_MATCH       │
        │ - GOOD_MATCH         │
        │ - POTENTIAL          │
        │ - NOT_RECOMMENDED    │
        └──────────────────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ 6. Ranking & Pipeline │
        │ - Scored candidates  │
        │ - Ordenados por match│
        │ - Prontos p/ seleção │
        └──────────────────────┘
```

---

## 📋 Resumo de Requisitos

### Input Necessário do Candidato
✅ Currículo em texto (PDF/docx/plain text)

### Dados Extraídos Automaticamente
✅ Experiência total (meses)  
✅ Histórico de empresas  
✅ Roles e liderança  
✅ Gaps de emprego  
✅ Skills com proficiency  
✅ Categorias de expertise  
✅ Educação formal  
✅ Certificações  
✅ Qualidade de documento  
✅ Indicadores de liderança  

### Requisitos da Vaga (Input do Recruiter)
✅ Skills obrigatórias (com weight, level mínimo, anos mínimos)  
✅ Skills desejáveis  
✅ Nível de senioridade  
✅ Anos mínimos de experiência  
✅ Nível educacional mínimo  
✅ Deal-breakers (eliminação automática)  

### Output Final
✅ Overall Candidate Score (0-100)  
✅ Score Breakdown (por dimensão)  
✅ Match Score vs Vaga (0-100)  
✅ Mandatory Skills Coverage (%)  
✅ Recomendação (STRONG/GOOD/POTENTIAL/NOT_RECOMMENDED)  
✅ Reason Codes (violações, gaps, pontos fortes)  
✅ Ranking atualizado  

---

## 🔍 Exemplos Práticos

### Exemplo 1: Backend Senior

**Candidato:**
- 8 anos experiência
- Skills: Python (expert), Java (advanced), SQL (advanced), Docker (intermediate)
- Educação: Bacharelado em CC
- 2 roles de liderança (tech lead em 3 anos)
- 1 gap de 4 meses
- Comunicação clara

**Scores Breakdown:**
- Technical: 72 (4 skills, 1 expert, 2+ categorias)
- Experience: 81 (8 anos = 78, +8 liderança, -5 gap)
- Education: 72 (bachelor 62 + relevan 10)
- Communication: 78 (estrutura 80, clareza 80, prof 75, complet 75)
- Leadership: 70 (management + project_lead)
- **Overall: 77**

**Vaga Requirements (Backend Pleno/Senior):**
- Python (obrigatória, advanced, weight=2)
- Java (obrigatória, intermediate, weight=1.5)
- Docker (desejável, intermediate)
- SQL (desejável, intermediate)
- Min 5 anos experiência
- Bachelor+ educação
- Seniority: Senior

**Match Score:**
- Mandatory: 100 (ambas coberta 100%)
- Optional: 90 (tem Docker + SQL)
- Seniority: 100 (exato match)
- Experience: 100 (8 >= 5)
- Education: 100 (atende)
- **Match: 98**
- **Recommendation: STRONG_MATCH** ✅

---

### Exemplo 2: Administrativo Júnior

**Candidato:**
- 2 anos experiência
- Skills: Excel (advanced), Power BI (basic), ERP (intermediate)
- Educação: Nível Médio + Técnico (gestão)
- Sem liderança
- Sem gaps
- Comunicação mediana

**Scores:**
- Technical: 42 (3 skills, sem expert)
- Experience: 40 (2 anos = 40)
- Education: 40 (técnico)
- Communication: 60
- Leadership: 0
- **Overall: 42**

**Vaga Requirements (Administrativo):**
- Excel (obrigatória, intermediate, weight=1)
- SAP ERP (obrigatória, basic, weight=1)
- Min 1 ano
- High school+
- Deal-breaker: work_model != remote

**Checks:**
- Deal-breaker: candidato pode trabalhar remoto? ✅ (depende do currículo)
- Mandatory: Excel advanced (100%) + ERP intermediate (100%) = 100%
- Seniority: N/A (vaga não especifica)
- Experience: 100 (2 >= 1)
- Education: 80 (técnico >= high school)
- **Match: ~92**
- **Recommendation: GOOD_MATCH** ✅

---

## 🛠️ Checklist de Implementação

Certifique-se de que seu sistema:

- [ ] **IA extracts:** total_months, experiences, gaps, skills, categories, education, relevance, certs, communication quality, leadership indicators
- [ ] **ScoreCalculator:** 5 dimensões com pesos corretos
- [ ] **JobCompatibilityCalculator:** matching robusto com redistribuição de pesos
- [ ] **Deal-breaker Evaluator:** 8 campos, lógica exata de operadores
- [ ] **Recommendation Logic:** 4 níveis de recomendação baseados em match + mandatory coverage
- [ ] **Ranking:** Ordenação por match_score, com deal-breakers no topo da rejeição
- [ ] **Audit Trail:** Razões de score, violações, gaps detalhados

