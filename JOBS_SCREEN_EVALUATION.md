# Avaliação da Tela de Vagas - Frontend

**Data**: 2026-04-28  
**Status**: ⚠️ FUNCIONAL MAS COM GAPS CRÍTICOS  
**Prioridade de Correção**: 🔴 ALTA

---

## 1. O QUE A TELA JÁ FAZ ✅

### 1.1 Dados Básicos da Vaga
- ✅ **Título** - campo obrigatório, validado (min 3 chars)
- ✅ **Descrição** - campo obrigatório, validado (min 10 chars)
- ✅ **Requisitos** - campo opcional em textarea
- ✅ **Status** - dropdown com 5 opções (draft, published, paused, closed, cancelled)
- ✅ **Senioridade** - dropdown com 7 níveis (intern, junior, mid, senior, lead, principal, director)
- ✅ **Modelo de Trabalho** - dropdown com 3 opções (remote, hybrid, onsite)
- ✅ **Localização** - campo texto
- ✅ **Salário (min/max)** - campos numéricos em BRL, com validação (min ≤ max)

### 1.2 Skills da Vaga
- ✅ **Vincular Skills** - dropdown com skills disponíveis
- ✅ **Marcar como Obrigatória** - checkbox ao vincular
- ✅ **Remover Skills** - botão de exclusão
- ✅ **Visualizar Skills** - tabela mostra:
  - Nome da skill
  - Status (Obrigatória/Opcional) com badge
  - Nível mínimo
  - Anos mínimos
  - Peso
  - Ação de remover

### 1.3 Ações de Vaga
- ✅ **Criar** - POST /api/v1/jobs
- ✅ **Editar** - PATCH /api/v1/jobs/:id (abre modal com dados pré-preenchidos)
- ✅ **Publicar** - PATCH /api/v1/jobs/:id/publish
- ✅ **Pausar** - PATCH /api/v1/jobs/:id/pause
- ✅ **Fechar** - PATCH /api/v1/jobs/:id/close
- ✅ **Cancelar** - PATCH /api/v1/jobs/:id/cancel
- ✅ **Excluir** - DELETE /api/v1/jobs/:id (com confirmação)

### 1.4 Integração com Matching
- ✅ **Invalidação de Ranking** - `invalidateJobState()` é chamado após CRUD
- ✅ **Link para Pipeline** - botão "Abrir pipeline" em cada vaga
- ✅ **Preview de Candidatos** - sidebar mostra dados da vaga selecionada

---

## 2. O QUE FALTA ❌

### 2.1 Campos Críticos para Matching (Requisitos Objetivos)

**Status**: NÃO IMPLEMENTADO - Campos existem no banco mas não na API/frontend

#### minimum_education_level
```
Backend: JobModel.minimum_education_level (Optional[str])
API Schema: ❌ NÃO INCLUÍDO em JobResponse nem CreateJobRequest
Frontend Type: ❌ NÃO EXISTE em Job type
Frontend UI: ❌ SEM CAMPO NO FORMULÁRIO
```

**Impacto**: Sem este campo, o matching não valida educação mínima (critério importante).

#### minimum_years_experience
```
Backend: JobModel.minimum_years_experience (Optional[Decimal])
API Schema: ❌ NÃO INCLUÍDO em JobResponse nem CreateJobRequest
Frontend Type: ❌ NÃO EXISTE em Job type
Frontend UI: ❌ SEM CAMPO NO FORMULÁRIO
```

**Impacto**: Sem este campo, o matching não valida experiência mínima (critério importante).

### 2.2 Deal-Breakers (Critério de Auto-Rejeição)

**Status**: NÃO IMPLEMENTADO - Existe no banco mas não na API/frontend

```
Backend: JobModel.deal_breakers (JSONB array)
  Estrutura esperada:
  [
    {
      "field": "work_model",
      "operator": "not_equals",
      "value": "remote",
      "reason": "Vaga requer trabalho remoto",
      "is_active": true
    }
  ]
API Schema: ❌ NÃO INCLUÍDO em JobResponse nem CreateJobRequest
Frontend Type: ❌ NÃO EXISTE em Job type
Frontend UI: ❌ SEM INTERFACE PARA GERENCIAR
```

**Impacto Crítico**: Deal-breakers são essenciais para auto-rejeitar candidatos que não atendem critérios hard (ex: exigir remote quando oferecem hybrid). Sem interface, é impossível configurar.

### 2.3 Edição de Parâmetros de Skills

**Status**: PARCIALMENTE VISÍVEL - Pode ver, mas não editar

| Campo | Visível | Editável |
|-------|---------|----------|
| skill_name | ✅ Sim | ❌ Não (leitura) |
| is_mandatory | ✅ Sim (badge) | ⚠️ Sim (ao adicionar) |
| minimum_level | ✅ Sim | ❌ Não |
| minimum_years | ✅ Sim | ❌ Não |
| weight | ✅ Sim | ❌ Não |

**Problema**: Após adicionar uma skill, não é possível editar seus parâmetros. Precisa remover e re-adicionar.

---

## 3. Bugs e Inconsistências 🐛

### 3.1 Desfasamento Backend ↔ Frontend

| Item | Backend | Frontend Type | Frontend UI |
|------|---------|---------------|------------|
| minimum_education_level | ✅ Existe | ❌ Falta | ❌ Falta |
| minimum_years_experience | ✅ Existe | ❌ Falta | ❌ Falta |
| deal_breakers | ✅ Existe | ❌ Falta | ❌ Falta |

**Causa**: O backend foi atualizado com novos campos, mas o schema da API não foi atualizado e o frontend não foi preparado.

### 3.2 Schema da API Desatualizado

**Arquivo**: `backend/src/interface/api/schemas/job_schemas.py`

```python
class JobResponse(BaseModel):
    id: UUID
    title: str
    description: str
    requirements: str | None = None
    status: str
    seniority_level: str | None = None
    work_model: str | None = None
    location: str | None = None
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # ❌ FALTAM:
    # minimum_education_level: str | None = None
    # minimum_years_experience: Decimal | None = None
    # deal_breakers: list[dict] = Field(default_factory=list)
```

### 3.3 Tipo TypeScript Incompleto

**Arquivo**: `frontend/src/types/domain.ts`

```typescript
export type Job = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  status: string;
  seniority_level: string | null;
  work_model: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // ❌ FALTAM:
  // minimum_education_level?: string;
  // minimum_years_experience?: number;
  // deal_breakers?: DealBreaker[];
};
```

### 3.4 Formulário Não Envia Deal-Breakers

**Arquivo**: `frontend/src/pages/VagasPage.tsx` (linhas 122-132)

```typescript
const payload: Record<string, unknown> = {
  title: form.title,
  description: form.description,
  status: form.status,
};
if (form.requirements) payload.requirements = form.requirements;
if (form.seniority_level) payload.seniority_level = form.seniority_level;
if (form.work_model) payload.work_model = form.work_model;
if (form.location) payload.location = form.location;
if (form.salary_min) payload.salary_min = form.salary_min;
if (form.salary_max) payload.salary_max = form.salary_max;
// ❌ NUNCA ENVIA:
// minimum_education_level
// minimum_years_experience
// deal_breakers
```

### 3.5 Sem Indicação Visual de Invalidação de Ranking

**Problema**: Quando uma vaga é editada, `invalidateJobState()` é chamado, mas:
- ✅ Funciona em background
- ❌ Sem feedback visual ao usuário
- ❌ Sem indicação "ranking desatualizado"
- ❌ Sem opção de re-computar ranking manualmente

---

## 4. Campos do Backend NÃO Expostos 🚫

| Campo | Localização | Status Frontend |
|-------|-------------|-----------------|
| `minimum_education_level` | JobModel | ❌ Não exposto |
| `minimum_years_experience` | JobModel | ❌ Não exposto |
| `deal_breakers` | JobModel | ❌ Não exposto |
| `published_at` | JobModel | ❌ Não exposto |
| `closed_at` | JobModel | ❌ Não exposto |
| `expires_at` | JobModel | ❌ Não exposto |
| `skill.minimum_level` (edit) | JobRequiredSkillModel | ⚠️ Visível, não editável |
| `skill.minimum_years` (edit) | JobRequiredSkillModel | ⚠️ Visível, não editável |
| `skill.weight` (edit) | JobRequiredSkillModel | ⚠️ Visível, não editável |

---

## 5. Matriz de Cobertura de Requisitos

| Requisito | Cadastro | Edição | Visualização | Status |
|-----------|----------|--------|--------------|--------|
| **Dados Básicos** | | | | |
| Título | ✅ | ✅ | ✅ | OK |
| Descrição | ✅ | ✅ | ✅ | OK |
| Departamento/Local | ✅ | ✅ | ✅ | OK |
| Status | ✅ | ✅ | ✅ | OK |
| **Skills** | | | | |
| Obrigatórias | ✅ | ⚠️ | ✅ | PARCIAL¹ |
| Opcionais | ✅ | ⚠️ | ✅ | PARCIAL¹ |
| **Requisitos Objetivos** | | | | |
| Education Level | ❌ | ❌ | ❌ | FALTA |
| Years Experience | ❌ | ❌ | ❌ | FALTA |
| **Deal-Breakers** | | | | |
| Gerenciamento | ❌ | ❌ | ❌ | FALTA |
| **Ações** | | | | |
| Criar | ✅ | — | — | OK |
| Editar | — | ✅ | — | OK |
| Publicar | — | — | ✅ | OK |
| Pausar | — | — | ✅ | OK |
| Fechar | — | — | ✅ | OK |
| Cancelar | — | — | ✅ | OK |
| Excluir | — | — | ✅ | OK |
| **Integração** | | | | |
| Invalidar Ranking | ✅ | ✅ | — | OK² |
| Link Pipeline | — | — | ✅ | OK |

¹ = Pode adicionar/remover, mas não editar parâmetros após adicionar  
² = Funciona em background sem feedback visual

---

## 6. Sequência de Edição de Skills Atual

```
Tela de Vagas (vaga selecionada)
  ↓
Ver tabela de skills (minimum_level, minimum_years, weight em LEITURA)
  ↓
Usuário quer alterar, exemplo, weight de 1.0 para 2.0
  ↓
Opções disponíveis:
  A) Remover skill + re-adicionar (mas sem UI para mudar weight)
  B) Editar direto no banco (não é opção!)
  
❌ Resultado: Não é possível editar parâmetros
```

---

## 7. Prioridade de Correção

### 🔴 CRÍTICO (Bloqueia Matching Robusto)

1. **Adicionar `minimum_education_level` e `minimum_years_experience`**
   - API Schema: JobResponse + CreateJobRequest + UpdateJobRequest
   - Frontend Type: Job type
   - Frontend UI: 2 campos no formulário de vaga
   - **Por quê**: Sem isso, matching não valida requisitos objetivos
   - **Esforço**: Médio (4-6h)

2. **Implementar Deal-Breakers**
   - API Schema: Incluir no JobResponse + CreateJobRequest
   - Frontend Type: DealBreaker type + adicionar a Job type
   - Frontend UI: Modal/painel para CRUD de deal-breakers
   - **Por quê**: Sem isso, não há auto-rejeição por critérios hard
   - **Esforço**: Alto (8-12h)

### ⚠️ IMPORTANTE (Melhora UX de Matching)

3. **Permitir Edição de Parâmetros de Skills**
   - Add fields: minimum_level, minimum_years, weight ao vincular
   - Add edit button na tabela de skills (ou inline edit)
   - **Por quê**: Usários precisam ajustar sem remover/re-adicionar
   - **Esforço**: Médio (4-5h)

4. **Indicação Visual de Invalidação de Ranking**
   - Badge/alert quando vaga é modificada
   - Opção de re-computar ranking
   - **Por quê**: Transparência sobre estado do ranking
   - **Esforço**: Baixo (2-3h)

### 💡 NICE-TO-HAVE

5. Expor campos de data (published_at, closed_at, expires_at)
6. Adicionar validações de educação level (select com opções, não texto)
7. Validação de anos de experiência (número positivo)

---

## 8. Impacto na Prática

### Cenário 1: Recruiter cria vaga
```
Recruiter acessa Vagas → Criar Vaga
Preenche: Título, Descrição, Status
Adiciona Skills: Python (obrigatória), Docker (opcional)
❌ PROBLEMA: Não consegue especificar:
  - "Mínimo Bachelor + 5 anos de experiência"
  - "Must be remote (deal-breaker)"
Salva vaga
❌ RESULTADO: Matching não consegue validar esses critérios
```

### Cenário 2: Alterar requisitos de skill
```
Recruiter vê que Python deve ter weight 2.5 (não 1.0)
❌ PROBLEMA: Não há UI para editar
Opções:
  A) Remover Python e re-adicionar
  B) Editar direto no banco (não recomendado)
❌ RESULTADO: Frustração, workflows ineficientes
```

### Cenário 3: Deal-breaker critical
```
Recruiter publica vaga "Remote Backend Engineer"
Candidato se inscreve com "Hybrid work"
❌ PROBLEMA: Sem deal-breaker configurado, candidato não é rejeitado automaticamente
❌ RESULTADO: Gasto de tempo avaliando perfis inviáveis
```

---

## 9. Checklist de Implementação Recomendada

- [ ] Fase 1 (CRÍTICA) - 8-10h
  - [ ] Atualizar JobResponse schema com education_level, years_experience
  - [ ] Atualizar CreateJobRequest schema
  - [ ] Atualizar UpdateJobRequest schema
  - [ ] Atualizar Job TypeScript type
  - [ ] Adicionar 2 campos ao formulário de vaga
  - [ ] Validar e testar API ↔ Frontend

- [ ] Fase 2 (CRÍTICA) - 10-15h
  - [ ] Design DealBreaker type + schema
  - [ ] Endpoint para CRUD deal-breakers (ou embed em job update)
  - [ ] UI para gerenciar deal-breakers (modal/painel)
  - [ ] Testes E2E de deal-breaker
  - [ ] Verificar se backend já processa corretamente

- [ ] Fase 3 (IMPORTANTE) - 5-7h
  - [ ] Permitir edição de skill.minimum_level
  - [ ] Permitir edição de skill.minimum_years
  - [ ] Permitir edição de skill.weight
  - [ ] UI: Edit button ou inline edit form

- [ ] Fase 4 (NICE-TO-HAVE) - 2-3h
  - [ ] Badge "Ranking desatualizado" após editar vaga
  - [ ] Botão "Re-computar ranking"
  - [ ] Feedback visual

---

## 10. Próximo Prompt Recomendado

**Depois desta avaliação, próximas ações:**

1. **Implementar Requisitos Objetivos** (minimum_education_level + minimum_years_experience)
   - Prioridade: 🔴 CRÍTICA
   - Tamanho: Médio
   - Dependências: Nenhuma
   - Prompt recomendado: 
     > "Implemente campos de educação mínima e experiência mínima na tela de vagas. Atualize: API schema, tipos TypeScript, formulário, validações backend."

2. **Implementar Deal-Breakers UI**
   - Prioridade: 🔴 CRÍTICA
   - Tamanho: Grande
   - Dependências: Requisitos objetivos acima
   - Prompt recomendado:
     > "Implemente interface para gerenciar deal-breakers na tela de vagas. Crie modal/painel para adicionar regras de auto-rejeição (field, operator, value, reason)."

3. **Permitir Edição de Parâmetros de Skills**
   - Prioridade: ⚠️ IMPORTANTE
   - Tamanho: Médio
   - Dependências: Nenhuma
   - Prompt recomendado:
     > "Adicione campos de edição para skill.minimum_level, skill.minimum_years e skill.weight na tela de vagas."

---

**Status Final**: ⚠️ A tela é funcional para CRUD básico, mas **não expõe campos essenciais para matching robusto**. Sem educação mínima, experiência mínima e deal-breakers, o matching não consegue fazer validações críticas.

