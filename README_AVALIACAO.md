# 📚 Documentação: Sistema de Avaliação de Candidatos

## 🎯 Comece Aqui

Você está aqui porque quer entender **como seu sistema avalia candidatos**. Este índice ajuda a navegar pela documentação.

---

## 📖 Documentos Disponíveis

### 1. **RESUMO_AVALIACAO.md** ⭐ COMECE AQUI
**Duração:** 10 min  
**Nível:** Executivo

Para entender rapidamente:
- O que o sistema faz (visão geral)
- 5 pilares de avaliação (Technical, Experience, Education, etc)
- Como matching funciona
- Recomendações (STRONG/GOOD/POTENTIAL/NOT_RECOMMENDED)
- Deal-breakers (eliminação automática)
- 2 exemplos práticos completos

📌 **Leia isto primeiro se:** Você é não-técnico, recruiter, ou quer visão geral

---

### 2. **REQUISITOS_AVALIACAO_CANDIDATO.md** 📊 TÉCNICO
**Duração:** 30 min  
**Nível:** Engenheiro/Desenvolvedor

Para entender em detalhe:
- Estrutura normalizada (ExtractedResumeData)
- Fórmulas matemáticas de cada dimensão
- Scoring: técnica, experiência, educação, comunicação, liderança
- Pesos e constantes exatas
- Tabelas de conversão (experience bands, education scores, etc)
- Deal-breaker: 8 tipos de campos e lógica
- Fluxo completo passo-a-passo
- Checklist de implementação

📌 **Leia isto se:** Você precisa implementar, debugar, ou entender fórmulas

---

### 3. **ARQUITETURA_AVALIACAO.md** 🏗️ ARQUITETURA
**Duração:** 20 min  
**Nível:** Arquiteto/Tech Lead

Para entender estrutura:
- Diagrama arquitetural completo (API → Services → Domain → DB)
- Fluxo de análise de currículo (sequência)
- Fluxo de matching com vaga (sequência)
- Estrutura de dados normalizada
- Schema database (essencial)
- Padrões de design (Service Layer, Domain, Repository, Value Object)
- Garantias do sistema

📌 **Leia isto se:** Você precisa manter/extender o sistema

---

### 4. **FIX_422_ERROR.md** 🐛 BUGFIX RECENTE
**Duração:** 5 min  
**Nível:** Qualquer um

Solução para erro 422 ao editar vagas com skills:
- Causa exata identificada
- Problemas encontrados (operadores inválidos, tipos Decimal)
- Soluções implementadas
- Validações adicionadas

📌 **Leia isto se:** Você está trabalhando na correção de bugs

---

## 🗂️ Navegação Rápida

### Por Persona

**👔 Recruiter / Product Manager**
1. Leia: RESUMO_AVALIACAO.md (seções principais)
2. Foque em: Recomendações, Deal-breakers, Exemplos
3. Ignore: Fórmulas matemáticas

**👨‍💻 Engenheiro Python/FastAPI**
1. Leia: RESUMO_AVALIACAO.md (overview)
2. Leia: ARQUITETURA_AVALIACAO.md (estrutura)
3. Consulte: REQUISITOS_AVALIACAO_CANDIDATO.md (detalhas)
4. Use: Código em `src/domain/services/`

**🏗️ Arquiteto / Tech Lead**
1. Leia: ARQUITETURA_AVALIACAO.md (fluxo)
2. Leia: REQUISITOS_AVALIACAO_CANDIDATO.md (completo)
3. Revise: Database schema e padrões
4. Planeje: Escalabilidade, cache, A/B testing

**🧪 QA / Tester**
1. Leia: RESUMO_AVALIACAO.md (exemplos)
2. Leia: REQUISITOS_AVALIACAO_CANDIDATO.md (casos especiais)
3. Use: Checklist de testes

---

## 🎓 Conceitos Chave

### Score vs Match Score

| Conceito | O Que É | Range | Quando |
|----------|---------|-------|---------|
| **Overall Score** | Qualidade absoluta do candidato | 0-100 | Sempre (baseado em currículo) |
| **Match Score** | Compatibilidade com vaga específica | 0-100 | Quando associado a vaga |

**Exemplo:**
- Candidato João: Overall Score = 77 (bom em geral)
- João vs Vaga Backend: Match Score = 82 (excelente fit)
- João vs Vaga Frontend: Match Score = 45 (fit ruim)

---

### As 5 Dimensões

```
┌────────────────────────────────────────┐
│        OVERALL SCORE (0-100)           │
├────────────────────────────────────────┤
│ 1. Technical (35%)         [0-100]     │
│    Profundo em skills técnicas         │
│                                        │
│ 2. Experience (30%)        [0-100]     │
│    Anos + liderança + gaps             │
│                                        │
│ 3. Education (15%)         [0-100]     │
│    Nível + relevância + certificações  │
│                                        │
│ 4. Communication (10%)      [0-100]     │
│    Qualidade do documento              │
│                                        │
│ 5. Leadership (10%)        [0-100]     │
│    Gestão, liderança, mentoria        │
└────────────────────────────────────────┘
```

---

### Deal-Breaker vs Match Score

| Aspecto | Deal-Breaker | Match Score |
|---------|--------------|-----------|
| **Bloqueia** | ✅ Sim (rejeição 100%) | ❌ Não (apenas reduz score) |
| **Appeal** | ❌ Nenhum | ✅ Pode entrevistar mesmo com score baixo |
| **Quando usar** | Requisitos absolutamente críticos | Preferências relativas |

**Exemplo:**
- Deal-breaker: "Localização = São Paulo apenas"
- Match score baixo: "Sem experiência em Kubernetes (opcional)"

---

### Recomendações

```
┌─────────────────────────────────────────────────┐
│ STRONG_MATCH  ✅✅✅                             │
│ Match ≥82 AND Mandatory Coverage ≥90%         │
│ → Entrevista, alta prioridade                  │
├─────────────────────────────────────────────────┤
│ GOOD_MATCH    ✅✅                              │
│ Match ≥65 AND Mandatory Coverage ≥75%         │
│ → Entrevista                                    │
├─────────────────────────────────────────────────┤
│ POTENTIAL     ⚠️                                │
│ Match ≥45 AND Mandatory Coverage ≥50%         │
│ → Entrevista condicional (se faltam candidatos)│
├─────────────────────────────────────────────────┤
│ NOT_RECOMMENDED ❌                               │
│ Demais casos                                    │
│ → Rejeição                                      │
└─────────────────────────────────────────────────┘
```

---

## 🔍 Perguntas Frequentes

### P: Por que meu candidato teve score alto mas low match score com a vaga?
**R:** Overall score = qualidade absoluta. Match score = fit com essa vaga.  
Um candidato pode ser excelente em geral mas não ter as skills específicas que essa vaga precisa.

---

### P: Deal-breaker pode ser overridado?
**R:** **Não.** Deal-breakers são bloqueantes absolutamente. Se falha, candidato é rejeitado automaticamente (-100.0). Não há override possível.

---

### P: Como funções a IA contribuem para o score?
**R:** A IA:
1. Extrai dados estruturados do currículo
2. Avalia qualidade de comunicação (0-100)
3. Detecta indicadores de liderança
4. **NÃO** gera o score final (ScoreCalculator faz isso)

---

### P: Qual é o tempo de processamento?
**R:**
- Upload → Análise IA: **~3-10 segundos** (background)
- Matching com vaga: **<100ms** (se em cache)
- Ranking de 100 candidatos: **~1 segundo** (se todos em cache)

---

### P: Como o sistema lida com gaps de emprego?
**R:** 
- Gaps **≤6 meses**: ignorados (comum, não penaliza)
- Gaps **>6 meses**: -5 pontos por gap no Experience score
- Múltiplos gaps: acumulam penalidade

---

### P: Posso customizar os pesos?
**R:** 
Atual: Não (hardcoded em constantes)  
Roadmap: Sim (próxima versão com custom weights por vaga)

---

## 🛠️ Implementação Checklist

Se você está implementando o sistema:

### Backend
- [ ] ScoreCalculator implementado com 5 dimensões
- [ ] JobCompatibilityCalculator com matching correto
- [ ] DealBreakerEvaluator com 8 campos
- [ ] Database schema com caching
- [ ] API endpoints para análise e ranking
- [ ] Background jobs para análise IA

### Frontend
- [ ] Exibição de score breakdown (gráficos)
- [ ] Ranking ordenado por match score
- [ ] Filtros por recomendação
- [ ] Deal-breaker warnings
- [ ] Auditoria de reason codes

### Tests
- [ ] Unit tests de ScoreCalculator (100+ casos)
- [ ] Unit tests de JobCompatibilityCalculator
- [ ] Integration tests de fluxo completo
- [ ] E2E tests de análise e matching

---

## 📞 Contato & Suporte

Dúvidas sobre a documentação?

1. **Técnicas:** Veja código em `src/domain/services/`
2. **Fórmulas:** Consulte REQUISITOS_AVALIACAO_CANDIDATO.md
3. **Arquitetura:** Veja ARQUITETURA_AVALIACAO.md
4. **Exemplos:** Use casos práticos em RESUMO_AVALIACAO.md

---

## 📈 Versionamento

| Versão | Data | Mudanças |
|--------|------|----------|
| v1.0 | 2026-04-29 | Documentação inicial completa |
| - | - | (próximas atualizações aqui) |

---

## 🎯 Roadmap (O Que Vem Depois)

- [ ] Custom scoring weights por vaga
- [ ] A/B testing de weights
- [ ] Machine learning para prever qualidade de hire
- [ ] Integração com HRIS systems
- [ ] Real-time ranking updates (WebSocket)
- [ ] Feedback loop (hire quality vs score)
- [ ] Multi-language support

---

**Última atualização:** 29 de Abril de 2026  
**Versão da documentação:** 1.0  
**Status:** Completa e auditada

