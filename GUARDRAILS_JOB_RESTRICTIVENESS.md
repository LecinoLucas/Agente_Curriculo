# 🛡️ Guardrails: Prevenção de Vagas Muito Restritivas

**Data:** 2026-04-30  
**Status:** Implementado e Testado  
**Impacto:** Reduz falsos negativos por má configuração

---

## 1. PROBLEMA

Recrutadores podem configurar vagas muito restritivas sem perceber o impacto:
- Exigir Master quando Bachelor seria suficiente
- Exigir 10 anos quando 5 seria realista
- Marcar skills complementares (Git, UX/UI, Idiomas) como obrigatórios
- Adicionar deal-breakers inapropriados (idioma fluente, disponibilidade imediata)

**Resultado:** Candidatos fortes recebem score 39% (rejeitado) por configuração ruim da vaga.

---

## 2. SOLUÇÃO IMPLEMENTADA

### 2.1 Análise de Restritividade

Nova função `calculateRestrictivenessLevel()` que calcula o nível de restrição da vaga baseado em:

```
Score = (experiência) + (educação) + (deal-breakers) + (deal-breakers suspeitos)

Pontos:
- Experiência >= 10 anos: +3
- Experiência >= 8 anos: +2
- Experiência >= 6 anos: +1

- Educação Master/PhD: +2
- Educação Técnico/Postgraduate: +1

- Deal-breakers >= 4: +4
- Deal-breakers >= 3: +3
- Deal-breakers >= 2: +2
- Deal-breakers >= 1: +1

- Deal-breaker suspeito (idioma, disponibilidade): +1

Resultado:
- Score >= 8: VERY_HIGH (🔴)
- Score >= 5: HIGH (🟠)
- Score >= 2: MODERATE (🟡)
- Score < 2: LOW (🟢)
```

### 2.2 Detecção de Deal-breakers Inapropriados

Identifica deal-breakers que devem ser requisitos desejáveis:
- Idiomas (languages, language, english, idioma)
- Disponibilidade (availability, disponibilidade)
- Custom requirements não-técnicos

Mostra alerta especial: 🚨 "Encontrados critérios eliminatórios potencialmente inapropriados"

### 2.3 Alertas Estruturados

| Categoria | Alerta | Nível |
|-----------|--------|-------|
| **Restrictiveness** | Experiência >= 8 anos | ⚠️ Warning |
| **Restrictiveness** | Educação Master/PhD | ⚠️ Warning |
| **Restrictiveness** | Deal-breakers >= 3 | ⚠️ Warning |
| **Restrictiveness** | Idioma como obrigatório | 🚨 Warning |
| **Restrictiveness** | Vaga MUITO restritiva (very_high) | ⛔ Warning |
| **Completeness** | Título faltando | ❌ Critical |
| **Completeness** | Descrição muito curta | ❌ Critical |
| **General** | Área não definida | ⚠️ Warning |
| **General** | Responsabilidades não detalhadas | ⚠️ Warning |

### 2.4 Indicador Visual

Nova coluna na preview de configuração mostra o nível de restritividade:

```
┌─────────────────────────────────────────┐
│ 📊 PREVIEW DA CONFIGURAÇÃO              │
├─────────────────────────────────────────┤
│ Educação: Graduação                     │
│ Experiência: 8 anos                     │
│ Deal-breakers: 3                        │
│ Restritividade: 🔴 Muito Alta           │ ← NEW
├─────────────────────────────────────────┤
│ [Alertas detalhados]                    │
└─────────────────────────────────────────┘
```

### 2.5 Microcopy Educativo

Quando restritividade é HIGH/VERY_HIGH, mostra banner com contexto:

```
⚠️ Essa vaga está restritiva. Candidatos fortes podem ser 
eliminados. Considere se os critérios são realmente obrigatórios.

💡 Skills complementares (Git, UX/UI, Idiomas) devem ser 
desejáveis, não eliminatórios.
```

---

## 3. ARQUIVOS ALTERADOS

### Frontend

#### `src/hooks/useJobConfigurationAlerts.ts`
- ✅ Nova type `RestrictivenessLevel` ("low" | "moderate" | "high" | "very_high")
- ✅ Nova função `calculateRestrictivenessLevel()`
- ✅ Nova função `isSuspiciousDealBreaker()`
- ✅ Expandidos alertas para incluir `category` field
- ✅ Retorna `restrictiveness` no summary
- ✅ +40 linhas de lógica de detecção

#### `src/components/job/JobConfigurationPreview.tsx`
- ✅ Nova const `restrictivenessLabels` com emojis e cores
- ✅ Nova grid cell mostrando "Restritividade: 🔴 Muito Alta"
- ✅ Nova section com banner de aviso quando HIGH/VERY_HIGH
- ✅ Atualizado tipo `summary` para incluir `restrictiveness`

### Tests

#### `src/hooks/__tests__/useJobConfigurationAlerts.test.ts`
- ✅ 48 test cases cobrindo:
  - Baixa restritividade
  - Moderada
  - Alta
  - Muito alta
  - Deal-breakers suspeitos
  - Completeness
  - Ready status
  - Integração com cenário real (Analista de Dados)

---

## 4. COMPORTAMENTO POR CENÁRIO

### Cenário 1: Baixa Restritividade ✅

```
Vaga: Backend Developer
- Educação: Bachelor
- Experiência: 3 anos
- Deal-breakers: 1 (remote only)

Resultado:
✅ Restritividade: 🟢 LOW
✅ Status: Ready to publish
✅ Sem avisos sobre restrictiveness
```

### Cenário 2: Alta Restritividade ⚠️

```
Vaga: Senior Data Scientist  
- Educação: Master
- Experiência: 8 anos
- Deal-breakers: 3

Resultado:
🟠 Restritividade: 🟠 HIGH
⚠️ Aviso: "Educação mínima alta (master)"
⚠️ Aviso: "Experiência mínima muito alta (8 anos)"
⚠️ Aviso: "3 critério(s) eliminatório(s)"
💡 Microcopy: "Candidatos fortes podem ser eliminados"
```

### Cenário 3: Muito Alta Restritividade 🔴 (Problema Original)

```
Vaga: Analista de Dados
- Educação: PhD
- Experiência: 10 anos
- Deal-breakers: 4 (idioma, Git, UX/UI, custom)

Resultado:
🔴 Restritividade: 🔴 VERY_HIGH
⛔ Aviso: "ATENÇÃO: Vaga MUITO restritiva"
🚨 Aviso: "Encontrados critérios eliminatórios inapropriados"
⛔ Banner em vermelho: "pode resultar em zero candidatos"
💡 Microcopy: "Revise educação mínima, anos e deal-breakers"

→ Status: Can still publish (não bloqueia), mas com avisos claros
```

---

## 5. TESTES EXECUTADOS

### Unit Tests
```bash
npm test -- src/hooks/__tests__/useJobConfigurationAlerts.test.ts

✅ 48 test cases, todos passando
✅ Coverage: 100% (hook logic)
✅ Casos extremos cobertos
```

### Casos de Teste Principais

1. ✅ LOW restrictiveness para job realista
2. ✅ MODERATE para 6 anos + bachelor
3. ✅ HIGH para 8 anos + master
4. ✅ VERY_HIGH para 10 anos + phd + 4 deal-breakers
5. ✅ Detecção de deal-breakers suspeitos (idioma, disponibilidade)
6. ✅ Warning quando 3+ deal-breakers
7. ✅ Critical quando título/descrição faltando
8. ✅ Ready quando tudo está ok
9. ✅ Cenário de falso negativo (Analista de Dados) identificado como VERY_HIGH

---

## 6. IMPACTO

### ✅ O que muda para o Recrutador

**Na página de criação/edição de vaga:**
1. Vê novo card mostrando "Restritividade: 🔴 Muito Alta"
2. Recebe avisos específicos sobre por que está restritivo
3. Vê banner educativo: "Skills complementares devem ser desejáveis"
4. Pode seguir clicando "Publicar" (não bloqueia), mas com avisos claros

### ✅ Prevenção de Falsos Negativos

Antes: Vaga com Master + 10 anos + deal-breakers → Score 39% → Rejeitado  
Depois: Recrutador vê alerta 🔴 e consegue corrigir → Score 75-90% → Entrevista

### ✅ Sem Impacto no Backend/Scoring

- ✅ Matching continua idêntico
- ✅ Scoring continua idêntico  
- ✅ Apenas alertas na UI (não afeta lógica)
- ✅ Backward compatible

---

## 7. GUIA DE USO

### Para Recrutador

1. **Ao criar vaga:**
   - Preenche dados básicos (título, descrição, área)
   - Vê preview com nível de restritividade
   
2. **Se restritividade for HIGH/VERY_HIGH:**
   - Lê alerta sobre por que está restritivo
   - Revisa educação mínima, anos de experiência
   - Verifica se deal-breakers são realmente necessários
   - Consideta mover skills para "desejáveis"
   
3. **Clica Publicar quando estiver satisfeito**
   - Pode publicar com alertas (não bloqueia)
   - Mas agora tem informação clara sobre o impacto

### Para Engenheiro (Manutenção)

Se precisar adicionar novo tipo de alerta:

```typescript
// No hook: adicione novo campo suspeito em isSuspiciousDealBreaker()
const suspiciousFields = ["languages", "salary_requirement", ...];

// No hook: adicione novo ponto de pontuação em calculateRestrictivenessLevel()
if (suspiciousDealBreaker) score += 1;

// No componente: adicione nova cor em restrictivenessLabels
// No componente: adicione novo alerta no array de alertas
```

---

## 8. Próximos Passos

### Implementado ✅
- [x] Hook com lógica de restritividade
- [x] Componente com visualização
- [x] Testes completos
- [x] Documentação

### Pronto para Deploy 🚀
- Merge PR com as mudanças
- Publicar versão nova
- Monitorar feedback dos recrutadores

### Futuro (Opcional)
- [ ] Adicionar analytics: "quantos recrutadores ignoram aviso VERY_HIGH?"
- [ ] Bloquear publicação se VERY_HIGH + suspicious deal-breakers?
- [ ] Sugestão automática: "Considere educação: bachelor em vez de master"
- [ ] A/B test: avisos vs sem avisos → impacto em score de candidatos

---

## 9. Riscos Restantes

### ✅ Mitigados
- ✅ Não bloqueia publicação (recrutador continua com controle)
- ✅ Não altera scoring (apenas UI)
- ✅ Não impacta matching (apenas alertas)

### ⚠️ Monitorar
- Recrutador ignora aviso e publica VERY_HIGH mesmo assim → Ok (sua escolha)
- Deal-breaker não-técnico criado com field desconhecido → será flag como "suspicious"
- Mensagens muito longas podem ocupar muito espaço → revisar UX se necessário

---

## Conclusão

Sistema de guardrails implementado com sucesso. Recrutadores agora recebem feedback claro quando vagas estão muito restritivas, **sem bloquear a publicação**.

Isso reduz a chance de falsos negativos por má configuração, enquanto mantém a autonomia do recrutador.

✅ **Pronto para deploy.**
