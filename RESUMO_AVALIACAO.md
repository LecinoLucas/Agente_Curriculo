# 📊 Resumo Executivo: Sistema de Avaliação de Candidatos

## O Que o Sistema Faz?

Avalia candidatos em **3 camadas** para conectar melhores talentos com vagas:

```
┌────────────────────────────────────────────────────────┐
│  Currículo do Candidato                                │
└────────────────────┬─────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │   1️⃣ IA Analysis (v2)   │
        │  Extrai e pontura       │
        │  tudo automaticamente    │
        └────────────┬────────────┘
                     │
        ┌────────────▼──────────────────────┐
        │  2️⃣ Candidate Profile Score        │
        │  • Technical (35%)                 │
        │  • Experience (30%)                │
        │  • Education (15%)                 │
        │  • Communication (10%)             │
        │  • Leadership (10%)                │
        │  → Overall 0-100                   │
        └────────────┬──────────────────────┘
                     │
        ┌────────────▼──────────────────────┐
        │  3️⃣ Compatibilidade com Vaga       │
        │  • Skills Match (60% weight)       │
        │  • Senioridade (20%)               │
        │  • Experiência (10%)               │
        │  • Educação (10%)                  │
        │  → Match Score 0-100               │
        │  → Recomendação: STRONG/GOOD/...  │
        └────────────┬──────────────────────┘
                     │
        ┌────────────▼──────────────────────┐
        │  4️⃣ Deal-Breakers (Eliminação)     │
        │  Auto-rejeição por critérios:      │
        │  • Localização                     │
        │  • Work Model                      │
        │  • Educação Mínima                 │
        │  • Skills Obrigatórias             │
        │  • Etc.                            │
        └────────────┬──────────────────────┘
                     │
        ┌────────────▼──────────────────────┐
        │  Ranking Final & Pipeline          │
        │  • Candidatos ordenados            │
        │  • Prontos para seleção            │
        └──────────────────────────────────┘
```

---

## 🎯 Os 5 Pilares de Avaliação

### 1. Technical (35% do Score)

**O que mede:** Expertise técnica do candidato

| Componente | Peso | Como calcula |
|-----------|------|-------------|
| **Profundidade** | 50% | Média de proficiência das skills |
| **Amplitude** | 30% | Quantas áreas tecnológicas domina |
| **Expertise Primária** | 20% | Quantas skills tem nível "expert" |

**Proficiência Levels:**
```
Basic (25) → Intermediate (50) → Advanced (75) → Expert (100)
```

**Exemplo:**
```
Skills: Java (expert), Python (advanced), Docker (intermediate), SQL (advanced)

Profundidade = (100+75+50+75)/4 = 75
Amplitude = 3 áreas × 12.5 = 37.5
Expertise = 1 expert × 20 = 20
Technical = (75×0.5) + (37.5×0.3) + (20×0.2) = 55
```

---

### 2. Experience (30% do Score)

**O que mede:** Qualidade e quantidade de experiência prática

| Componente | O que avalia |
|-----------|-------------|
| **Base Experiência** | Anos totais (tabela de bandas) |
| **Liderança** | +8 pts se teve roles de liderança |
| **Employment Gaps** | -5 pts por gap > 6 meses |

**Tabela de Anos:**
```
0-1 ano → 25 pts
2 anos → 40 pts
3 anos → 55 pts
5 anos → 68 pts
7 anos → 78 pts
10 anos → 88 pts
15+ anos → 100 pts
```

**Exemplo:**
```
8 anos experiência = 78 (base)
+ 8 (teve gestão de equipe)
- 5 (gap de 8 meses)
= 81
```

---

### 3. Education (15% do Score)

**O que mede:** Formação acadêmica e certificações

| Nível | Score | Relevância | Certs |
|-------|-------|-----------|-------|
| Nenhuma | 10 | N/A | +2.5 cada |
| Ensino Médio | 25 | Alta: +10 | Máx +10 |
| Técnico | 40 | Média: +5 | |
| Bacharelado | 62 | Baixa: 0 | |
| Pós-Grad | 72 | | |
| Mestrado | 83 | | |
| Doutorado | 95 | | |

**Exemplo:**
```
Bacharelado (62) + relevância Alta (10) + 3 certs (7.5) = 79.5
```

---

### 4. Communication (10% do Score)

**O que mede:** Qualidade do documento/currículo

A IA avalia:

| Critério | Peso | O que significa |
|----------|------|----------------|
| **Estrutura** | 30% | Usa bullet points, hierarquia clara |
| **Clareza** | 30% | Linguagem objetiva, sem jargão |
| **Profissionalismo** | 20% | Tom apropriado, sem erros |
| **Completude** | 20% | Seções importantes preenchidas |

**Score:** 0-100 (cada critério é avaliado 0-100 pela IA)

---

### 5. Leadership (10% do Score)

**O que mede:** Experiência em liderança

| Indicador | Pontos | Quando aplica |
|-----------|--------|--------------|
| **Management** | 40 | Gestão de pessoas (team lead, manager) |
| **Project Lead** | 30 | Liderança de projeto/produto |
| **Mentoring** | 20 | Mentoria / desenvolvimento de equipe |
| **Cross-Team** | 10 | Colaboração entre times/áreas |

**Score:** Soma dos presentes (máx 100)

**Exemplo:**
```
Tem management (40) + project lead (30) + cross-team (10) = 80
```

---

## 🏆 Fórmula do Overall Score

```
OVERALL = (Technical × 0.35) + (Experience × 0.30) 
        + (Education × 0.15) + (Communication × 0.10) 
        + (Leadership × 0.10)
```

**Range:** 0-100

---

## 🤝 Matching com a Vaga

Após calcular o score do candidato, compara com **requisitos específicos da vaga**:

### Peso das Dimensões no Matching

| Dimensão | Peso | O que avalia |
|----------|------|------------|
| **Skills Obrigatórias** | 40% | Cobertura de skills que a vaga exige |
| **Skills Desejáveis** | 20% | Bônus por skills adicionais |
| **Senioridade** | 20% | Fit de nível (junior/pleno/senior/etc) |
| **Experiência** | 10% | Anos mínimos atendidos |
| **Educação** | 10% | Nível mínimo atendido |

---

### Skills: Credibilidade Parcial

Se a vaga exige "Java avançado":

```
Candidato tem Java:
  ✅ Advanced ou Expert → 100% crédito
  ⚠️ Intermediate → 50% crédito (penaliza mas não bloqueia)
  ❌ Basic → 50% crédito
  ❌ Não tem → 0% crédito
```

---

### Senioridade: Distância de Níveis

```
INTERN → JUNIOR → MID → SENIOR → LEAD → PRINCIPAL → DIRECTOR
```

**Score por distância:**

| Vaga exige SENIOR | Candidato é | Distância | Score |
|------------------|-------------|----------|-------|
| - | SENIOR | 0 | 100 ✅ |
| - | MID | 1 | 75 |
| - | JUNIOR | 2 | 45 |
| - | INTERN | 3+ | 20 |

**Penalidade sobre-qualificação:**
- Se candidato é **2+ níveis acima** → score × 0.90
- Motivo: evitar rotatividade

---

### Recomendação Final

Baseado em `match_score` + `mandatory_skills_coverage`:

```
┌─────────────────────────────────────────────────────┐
│ if match_score ≥ 82 AND mandatory_coverage ≥ 90%   │
│   → STRONG_MATCH ✅                                  │
│   → Prioridade alta para entrevista                 │
├─────────────────────────────────────────────────────┤
│ if match_score ≥ 65 AND mandatory_coverage ≥ 75%   │
│   → GOOD_MATCH ✅                                    │
│   → Entrevista                                       │
├─────────────────────────────────────────────────────┤
│ if match_score ≥ 45 AND mandatory_coverage ≥ 50%   │
│   → POTENTIAL ⚠️                                     │
│   → Entrevista condicional                          │
├─────────────────────────────────────────────────────┤
│ else                                                 │
│   → NOT_RECOMMENDED ❌                               │
│   → Rejeição                                         │
└─────────────────────────────────────────────────────┘
```

---

## 🚫 Deal-Breakers (Eliminação Automática)

Regras que **rejeitam candidato imediatamente**:

| Campo | Operadores | Exemplo |
|-------|-----------|---------|
| **Location** | equals, ≠, contains, in | Deve ser SP apenas |
| **Work Model** | equals, ≠ | Só presencial |
| **Education** | equals, >= | Mínimo: Bacharelado |
| **Experience Years** | equals, >=, <= | Mínimo 5 anos |
| **Skill** | contains, not_contains | Obrigatório: Kubernetes |
| **Language** | equals, contains | Precisa falar Inglês |
| **Availability** | equals | Disponível imediatamente |
| **Custom Text** | contains | Menção a "agile coach" |

**Impacto:** -100 (rejeição total, sem appeal)

---

## 📊 Exemplo Prático Completo

### Cenário: Vaga de Backend Senior (Python)

**Candidato: João**
- 7 anos experiência
- Python (expert), Java (advanced), Docker (intermediate), SQL (advanced)
- Bacharelado em CC (relevância alta)
- 2 certificações (AWS, GCP)
- Foi tech lead por 3 anos
- Sem employment gaps
- Currículo estruturado e profissional

**Scores do João:**
```
Technical:     72 (4 skills, 1 expert, 3 categorias)
Experience:    86 (7 anos base=78 + 8 liderança + 0 gaps)
Education:     79 (bachelor 62 + relevância 10 + 2 certs 7)
Communication: 82 (estrutura 85, clareza 85, prof 80, complet 78)
Leadership:    70 (management + project_lead)
─────────────────────────────────────────
OVERALL:       77 ✅
```

**Requisitos da Vaga:**
```
Skills Obrigatórias:
  • Python (advanced, weight=2) ✅ João tem expert
  • Docker (intermediate, weight=1) ✅ João tem intermediate
Skills Desejáveis:
  • Java (advanced) ✅ João tem advanced
  • Kubernetes ❌ João não tem
Senioridade: Senior ✅ João é Mid/Senior
Experiência: Min 5 anos ✅ João tem 7
Educação: Bachelor+ ✅ João tem Bachelor
Deal-breakers: Nenhum
```

**Matching Score:**
```
Mandatory Skills: 100% (Python expert + Docker intermediate)
Optional Skills:  95% (tem Java, falta Kubernetes)
Seniority:       100% (perfeito match)
Experience:      100% (7 >= 5)
Education:       100% (bachelor >= requisito)
─────────────────────────────────────
MATCH SCORE:      99 ✅✅✅
Mandatory Coverage: 100%
─────────────────────────────────────
RECOMENDAÇÃO:    STRONG_MATCH ✅
```

**Próximas Ações:**
1. ✅ Entrevista técnica de 1h
2. ✅ Conversa com gerente
3. ✅ Eventual oferta

---

### Cenário 2: Candidato Potencial

**Candidato: Maria**
- 3 anos experiência
- Python (intermediate), SQL (basic)
- Nível Médio Completo + Técnico em Programação
- Sem certificações
- Sem experiência em liderança
- 1 gap de 6 meses
- Currículo simples mas claro

**Scores da Maria:**
```
Technical:     38
Experience:    40 (3 anos base=55 - 5 gap - 0 liderança)
Education:     40 (técnico)
Communication: 55
Leadership:    0
─────────────────────────────────────
OVERALL:       40 ⚠️ (abaixo do ideal)
```

**Matching com mesma vaga:**
```
Mandatory Skills: 40% (Python apenas, mas intermediate não é advanced)
Optional Skills:  0% (falta Java)
Seniority:       45% (Junior vs Senior = 2 níveis)
Experience:      50% (3 anos < 5 anos)
Education:       60% (Técnico < Bachelor)
─────────────────────────────────────
MATCH SCORE:      42 ⚠️
Mandatory Coverage: 40%
─────────────────────────────────────
RECOMENDAÇÃO:    NOT_RECOMMENDED ❌
```

**Por quê?**
- ❌ Mandatory skills coverage < 50%
- ❌ Match score < 45%
- ❌ Nível muito abaixo do requisito

**Ação Recomendada:**
- Sugerir Maria para vagas Junior/Mid
- Manter no banco de talentos para futuro

---

## 🔍 O Que o Sistema NÃO Faz

- ❌ Não avalia "soft skills" subjetivos (apenas via análise IA)
- ❌ Não substitui entrevista humana
- ❌ Não previne viés (mas padroniza o processo)
- ❌ Não garante sucesso (apenas prevê compatibilidade)
- ❌ Não avalia background/reputação (apenas currículo)

---

## ✅ Checklist para Recruiter

Antes de usar o sistema:

- [ ] Vaga está com **skills obrigatórias e desejáveis** bem definidas?
- [ ] **Seniority esperada** está clara?
- [ ] **Experiência mínima** em anos foi especificada?
- [ ] **Educação mínima** foi definida?
- [ ] **Deal-breakers críticos** foram configurados?
- [ ] **Pesos de skills** refletem importância real?

Depois de usar:

- [ ] Revisar **STRONG_MATCH** candidates em prioridade
- [ ] Avaliar **GOOD_MATCH** conforme necessidade
- [ ] Considerar **POTENTIAL** se faltam candidatos
- [ ] Rejeitar **NOT_RECOMMENDED** (ou apenas com justificativa)
- [ ] Documentar razão de cada **deal-breaker** acionado

---

## 📈 Métricas que Importam

| Métrica | O que significa |
|---------|----------------|
| **Overall Score** | Qualidade "absoluta" do candidato (0-100) |
| **Match Score** | Fit com essa vaga específica (0-100) |
| **Mandatory Coverage %** | % de skills obrigatórias que tem |
| **Recommendation** | STRONG/GOOD/POTENTIAL/NOT_RECOMMENDED |
| **Reason Codes** | Por quê foi aceito ou rejeitado |

---

## 🎯 Próximas Leituras

Para entender melhor:

1. **REQUISITOS_AVALIACAO_CANDIDATO.md** - Documentação técnica completa
2. **ScoreCalculator** - Código de calculo de dimensões
3. **JobCompatibilityCalculator** - Código de matching
4. **DealBreakerEvaluator** - Código de eliminação automática

---

**Este sistema foi desenvolvido para ser:**
- ✅ Objetivo (baseado em evidências)
- ✅ Justo (critérios padronizados)
- ✅ Transparente (cada score é auditável)
- ✅ Escalável (processa N candidatos)
- ✅ Aprimorável (versões de scoring)

