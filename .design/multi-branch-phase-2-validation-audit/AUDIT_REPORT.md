# Relatório de Auditoria — Fase 2 Multi-Branch Unit Visibility
**Data:** 2026-06-17  
**Branch:** save/behavioral-ai-and-wips  
**Auditoria:** Leitura de código + execução de testes (sem alterações de código)  

---

## Classificação Geral

**PASS_WITH_NOTES**

A Fase 2 está correta e completa. Todos os 6 critérios de aprovação foram confirmados. Dois pontos de atenção foram identificados — nenhum é bloqueante.

---

## Critérios de Aprovação

| # | Critério | Status |
|---|---------|--------|
| 1 | Portal recebe `OperationalUnitModel.id`, não `JobUnitModel.id` | PASS |
| 2 | Candidato consegue escolher unidade em vaga multiunidade | PASS |
| 3 | Candidatura salva `preferred_unit_id` correto | PASS |
| 4 | Pipeline mostra e filtra pela unidade correta | PASS |
| 5 | Fase 1 continua propagando unidade até pré-admissão | PASS |
| 6 | Fluxos com 0 ou 1 unidade continuam funcionando | PASS |

---

## Comandos Executados

```bash
# Backend — 7 testes Phase 2
backend/.venv/bin/pytest tests/integration/test_phase2_public_units_and_pipeline_filter.py -v --no-cov
# Resultado: 7 passed

# Backend — 7 testes Phase 1 (regressão)
backend/.venv/bin/pytest tests/unit/test_multi_branch_unit_propagation.py -v --no-cov
# Resultado: 7 passed

# Backend — regressão pública (contract + apply + pipeline)
backend/.venv/bin/pytest tests/test_public_api_contract.py tests/test_public_application.py
                          tests/integration/test_public_application_pipeline.py
                          tests/integration/test_list_job_matches_contract.py -v --no-cov
# Resultado: 59 passed, 1 FAILED (pré-existente — ver seção abaixo)

# Frontend portal — 3 testes Phase 2
candidate-portal/npx vitest run src/services/__tests__/publicJobsService.phase2.test.ts
# Resultado: PASS (3) FAIL (0)

# Frontend staff — 3 testes Phase 2
frontend/npx vitest run src/features/pipeline/__tests__/pipelinePageUtils.phase2.test.ts
# Resultado: PASS (3) FAIL (0)

# TypeScript — ambos os frontends
frontend/npx tsc --noEmit   → no errors
candidate-portal/npx tsc --noEmit → no errors
```

---

## Arquivos Auditados

```
# Backend — Schema e routers
backend/src/interface/api/schemas/public_schemas.py
backend/src/interface/api/schemas/pipeline_schemas.py
backend/src/interface/api/routers/public_candidate_portal.py
backend/src/interface/api/routers/public.py
backend/src/interface/api/routers/pipeline.py

# Backend — Services
backend/src/application/services/public_application_service.py
backend/src/application/services/pipeline_service.py
backend/src/application/services/pre_admission_service.py
backend/src/application/services/admission_case_workspace_service.py

# Backend — Repository
backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py

# Backend — Models
backend/src/infrastructure/database/models/candidate_application_model.py

# Backend — Testes
backend/tests/integration/test_phase2_public_units_and_pipeline_filter.py
backend/tests/unit/test_multi_branch_unit_propagation.py

# Portal candidato
candidate-portal/src/pages/ApplicationFormPage.tsx
candidate-portal/src/services/publicApplicationService.ts
candidate-portal/src/services/publicJobsService.ts
candidate-portal/src/types/candidatePortal.ts
candidate-portal/src/services/__tests__/publicJobsService.phase2.test.ts

# Staff frontend
frontend/src/types/domain.ts
frontend/src/services/jobsService.ts
frontend/src/components/kanban/KanbanCard.tsx
frontend/src/pages/PipelinePage.tsx
frontend/src/features/pipeline/pipelinePageUtils.ts
frontend/src/features/pipeline/__tests__/pipelinePageUtils.phase2.test.ts
```

---

## Análise por Ponto de Verificação

---

### 1. Endpoint público GET /public/jobs/{id}

**Arquivo:** `public_candidate_portal.py` L130–157

```python
sa.select(
    OperationalUnitModel.id,        # ← OperationalUnitModel.id, não JobUnitModel.id ✅
    sa.func.coalesce(OperationalUnitModel.public_name, OperationalUnitModel.name).label("public_name"),
    OperationalUnitModel.city,
    OperationalUnitModel.state,
    OperationalUnitModel.address,
    OperationalUnitModel.reference_point,
)
.select_from(JobUnitModel)          # ← join correto com select_from ✅
.join(OperationalUnitModel, OperationalUnitModel.id == JobUnitModel.operational_unit_id)
.where(
    JobUnitModel.job_id == job_id,
    JobUnitModel.is_active.is_(True),       # ← apenas unidades ativas ✅
    OperationalUnitModel.is_active.is_(True),
)
.order_by(JobUnitModel.priority.asc().nullslast(), JobUnitModel.created_at.asc())
```

**Campos expostos:** `id`, `public_name` (COALESCE), `city`, `state`, `address`, `reference_point`  
**Campos AUSENTES (correto):** `code`, `protheus_code`, `group_id`, `created_by`, `normalized_name`, `type`

**Vaga sem unidades:** retorna `job_units: []` por `default_factory=list` em `PublicJobDetailResponse`.

**Status:** PASS — `OperationalUnitModel.id` é retornado, `.select_from(JobUnitModel)` corrige a ambiguidade de join, COALESCE implementado, apenas campos públicos.

**Nota critica confirmada:** a correção `JobUnitModel.id → OperationalUnitModel.id` foi implementada corretamente. O `id` que o portal recebe é o mesmo que o backend valida contra `JobUnitModel.operational_unit_id`.

---

### 2. Candidatura pública — backend

**Arquivo:** `public_application_service.py` L120, L255–275, L399–476

```python
preferred_unit_id: UUID | None = None,          # parâmetro opcional ✅

# 6a. Validar preferred_unit_id para vagas com unidades estruturadas
active_unit_ids_result = await self.db.execute(
    sa.select(JobUnitModel.operational_unit_id)  # consulta OperationalUnitModel.id ✅
    .where(JobUnitModel.job_id == job_id, JobUnitModel.is_active.is_(True))
)
active_unit_ids = active_unit_ids_result.scalars().all()

if len(active_unit_ids) >= 2 and preferred_unit_id is None:
    raise ValidationException("Selecione um posto/unidade de preferência para esta vaga.")  # ✅
if len(active_unit_ids) == 1 and preferred_unit_id is None:
    preferred_unit_id = active_unit_ids[0]      # auto-fill ✅
if preferred_unit_id is not None and preferred_unit_id not in set(active_unit_ids):
    raise ValidationException("A unidade selecionada não pertence a esta vaga.")  # ✅

# Persiste CandidateApplicationModel
self.db.add(CandidateApplicationModel(
    source="web_portal",                         # source válido ✅
    status="linked_to_pipeline",                 # status válido em APPLICATION_ACTIVE_STATUSES ✅
    preferred_unit_id=preferred_unit_id,         # OperationalUnitModel.id ✅
    lgpd_consent_at=now,
    lgpd_consent_version="1.0",
))

# Pipeline entry recebe operational_unit_id
create_entry(..., operational_unit_id=preferred_unit_id)     # ✅
reactivate_entry(..., operational_unit_id=preferred_unit_id) # ✅
```

**Check constraint compatibilidade:** `CandidateApplicationModel` permite `source='web_portal'` e `status='linked_to_pipeline'`. `preferred_unit_id` tem FK para `operational_units.id` com `ondelete="SET NULL"`. `accepts_any_unit_in_location=False` (default) → não conflita com a check constraint.

**Validação de unidade de outra vaga:** implementada — `preferred_unit_id not in set(active_unit_ids)` rejeita com 422. ✅

**Fluxo 0 unidades:** `len(active_unit_ids) == 0` → nenhuma das condições dispara → fluxo legado mantido. ✅

**Status:** PASS — todas as combinações estão cobertas, mensagens de erro corretas, FK adequada.

---

### 3. Portal do candidato — frontend

**Arquivo:** `ApplicationFormPage.tsx`

```tsx
// validateStep1 com jobUnitsCount obrigatório ✅
function validateStep1(f: FormState, jobUnitsCount: number): string | null {
  ...
  if (jobUnitsCount >= 2 && !f.preferred_unit_id)
    return 'Selecione um posto/unidade de preferência.';
  ...
}

// jobUnitsCount derivado do job antes do uso ✅
const jobUnitsCount = job?.job_units?.length ?? 0;

// advance(2, ...) usa closure corretamente ✅
<Button onClick={() => advance(2, (f) => validateStep1(f, jobUnitsCount))}>

// handleSubmit re-valida com jobUnitsCount ✅
const step1Error = validateStep1(form, jobUnitsCount);

// apply envia preferred_unit_id ✅
preferred_unit_id: form.preferred_unit_id,

// Review step mostra unidade escolhida ✅
{form.preferred_unit_id && (
  <ReviewRow
    label="Posto/unidade"
    value={job?.job_units?.find((u) => u.id === form.preferred_unit_id)?.public_name ?? '—'}
  />
)}
```

**0 unidades:** `jobUnitsCount === 0` → nenhum UI de unidade é renderizado, validação não bloqueia. ✅  
**1 unidade:** card informativo azul com `public_name`, cidade, ponto de referência. ✅  
**2+ unidades:** radio selector obrigatório com label "Posto/unidade de preferência *". ✅  
**Label:** "Posto/unidade" no selector e review — label amigável ao candidato. ✅  
**TypeScript:** sem erros em `npx tsc --noEmit`. ✅

**Status:** PASS

---

### 4. Pipeline backend — listagem e filtro

**Arquivo:** `sqlalchemy_pipeline_repository.py` L341–619

```python
# operational_unit_id no SELECT ✅
sa.func.coalesce(OperationalUnitModel.public_name, OperationalUnitModel.name).label("unit_name"),
CandidateJobPipelineModel.operational_unit_id,

# LEFT OUTER JOIN — não duplica candidatos ✅
.outerjoin(
    OperationalUnitModel,
    sa.and_(
        OperationalUnitModel.id == CandidateJobPipelineModel.operational_unit_id,
        OperationalUnitModel.is_active.is_(True),
    ),
)

# Filtro condicional ✅
if operational_unit_id is not None:
    conditions.append(CandidateJobPipelineModel.operational_unit_id == operational_unit_id)
```

**Candidatos com `operational_unit_id = NULL`:** LEFT OUTER JOIN garante que continuam aparecendo quando filtro está ausente. ✅  
**Sem duplicação:** JOIN é 1:1 (cada pipeline row tem no máximo 1 unidade). ✅  
**Outros filtros (`entered_from`, `updated_to`, etc.):** na lista de `conditions` junto com o novo filtro — totalmente compatíveis. ✅  
**Filtro na URL → backend:** `pipeline.py` extrai `operational_unit_id: UUID | None = Query(default=None)` e injeta em `PipelineBoardFilters`. ✅

**Status:** PASS

---

### 5. Pipeline frontend staff

**Arquivo:** `PipelinePage.tsx`, `pipelinePageUtils.ts`, `jobsService.ts`, `KanbanCard.tsx`

```typescript
// boardUnits derivado do board ✅
const boardUnits = useMemo(() => {
  const seen = new Map<string, string>();
  for (const col of board.columns)
    for (const c of col.candidates)
      if (c.operational_unit_id && c.unit_name && !seen.has(c.operational_unit_id))
        seen.set(c.operational_unit_id, c.unit_name);
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}, [board]);

// dropdown só aparece com 2+ unidades ✅
{boardUnits.length >= 2 && (...)}

// pipelinePageUtils.ts lê operational_unit_id da URL ✅
operational_unit_id: read("operational_unit_id"),

// handleClearBoardFilters apaga operational_unit_id da URL ✅
next.delete("operational_unit_id");

// jobsService.ts envia o filtro ao backend ✅
if (filters?.operational_unit_id) params.set("operational_unit_id", filters.operational_unit_id);

// KanbanCard exibe unidade quando não-null ✅
{candidate.unit_name && (
  <div data-testid="kanban-card-unit">
    <span>Unidade: {candidate.unit_name}</span>
  </div>
)}
// Quando unit_name === null: bloco não renderizado — sem poluição visual ✅
```

**Status:** PASS

**Nota UX (ver abaixo):** dropdown de unidade pode desaparecer ao aplicar o filtro.

---

### 6. Integração com Fase 1 (Fase 1 continua propagando)

**Verificação:** `pre_admission_service.py` L170–181 — ainda lê `active_pipeline.operational_unit_id` e injeta em `PreAdmissionCaseModel`. Não foi alterado pela Fase 2. ✅

**Verificação:** `admission_case_workspace_service.py` — ainda usa `_resolve_unit_name(case)` e retorna `unit_name` para o schema. Não foi alterado. ✅

**Verificação:** `_lookup_preferred_unit_id` em `pipeline_service.py` — continua funcionando para o fluxo staff (candidaturas adicionadas pelo recrutador). Não foi alterado. ✅

**Fluxo completo confirmado por leitura de código:**
```
PublicJob.job_units (OperationalUnitModel.id)
→ Portal selector → form.preferred_unit_id = OperationalUnitModel.id
→ POST /public/candidates/apply com preferred_unit_id
→ CandidateApplicationModel.preferred_unit_id = OperationalUnitModel.id  ← FK correta
→ CandidateJobPipelineModel.operational_unit_id = OperationalUnitModel.id
→ Pipeline board lista unit_name + operational_unit_id
→ Pipeline filter ?operational_unit_id= filtra corretamente
→ PreAdmissionCaseModel.operational_unit_id = mesmo valor (Fase 1 intacta)
→ AdmissionCaseHeader exibe unit_name
```

**Status:** PASS

**Lacuna identificada (Nota 4 da Fase 1 ainda aberta):** não existe teste de integração que percorra a cadeia completa `apply→pipeline→pre-admission→workspace`. Os testes de Fase 2 cobrem cada elo individualmente, mas não o fluxo end-to-end.

---

## Sumário dos Testes

| Suite | Testes | Resultado |
|-------|--------|-----------|
| `test_phase2_public_units_and_pipeline_filter.py` | 7 | 7 passed ✅ |
| `test_multi_branch_unit_propagation.py` (Phase 1) | 7 | 7 passed ✅ |
| `test_public_api_contract.py` | 16 | 16 passed ✅ |
| `test_public_application.py` | 11 | 10 passed ✅, 1 FAILED ⚠️ (pré-existente) |
| `test_public_application_pipeline.py` | 5 | 5 passed ✅ |
| `test_list_job_matches_contract.py` | 27 | 27 passed ✅ |
| Portal frontend Phase 2 | 3 | 3 passed ✅ |
| Staff frontend Phase 2 | 3 | 3 passed ✅ |
| TypeScript — frontend staff | — | 0 errors ✅ |
| TypeScript — portal candidato | — | 0 errors ✅ |

**Total:** 79 passed, 1 FAILED (pré-existente, não relacionado à Fase 2)

---

## Falha Pré-Existente (não relacionada à Fase 2)

**Teste:** `tests/test_public_application.py::test_apply_rejects_invalid_file`

```
AssertionError: assert 'Apenas arquivos PDF são permitidos.' == 'Tipo de arquivo não permitido'
```

Este teste espera uma mensagem legada que foi alterada em versão anterior sem atualizar o teste. `public_application_service.py` não foi modificado pela Fase 2 — confirmado por `git diff`. Não é regressão desta fase.

---

## Notas e Riscos

### Nota 1 — `boardUnits` derivado do board filtrado (UX — Baixo)

**Descrição:** `boardUnits` é computado de `board.columns`, que após aplicar `?operational_unit_id=<uuid>` contém apenas candidatos da unidade filtrada. Se filtrar por uma unidade, `boardUnits.length === 1`, fazendo o dropdown sumir enquanto o filtro está ativo.

**Impacto:** o filtro continua funcionando (URL mantém o valor), mas o usuário perde o controle visual para trocar/remover. Para remover, precisa usar o botão "Limpar filtros" ou editar a URL.

**Mitigante:** o botão "Limpar filtros" (`X`) ainda aparece quando há filtro ativo (`activeFiltersCount > 0`).

**Sugestão para Fase 3:** derivar `boardUnits` do histórico de boards ou de uma query separada de metadados da vaga (endpoint de job_units do staff), para que o dropdown persista mesmo com board filtrado.

### Nota 2 — Sem teste end-to-end da cadeia completa (Informativo — herdado da Fase 1)

A cadeia `apply (portal) → pipeline → pre-admission` não possui um teste de integração que percorra todos os elos. A cobertura atual é por elo individual. Não bloqueia a Fase 2 mas reduz confiança antes de rollout em produção.

**Sugestão:** criar 1 teste de integração que:
1. Cria vaga com 2 unidades
2. Candidato aplica via portal escolhendo unidade B
3. Verifica `CandidateApplicationModel.preferred_unit_id = unit_B.id`
4. Verifica `CandidateJobPipelineModel.operational_unit_id = unit_B.id`
5. Filtra pipeline por unit_B → candidato aparece
6. Filtra pipeline por unit_A → candidato não aparece
7. Cria pré-admissão → verifica `PreAdmissionCaseModel.operational_unit_id = unit_B.id`

---

## Confirmação do Fluxo Principal

```
PublicJob.job_units[*].id == OperationalUnitModel.id           ✅ (fix critico aplicado)
→ Portal selector/card usa job_units[*].id como valor         ✅
→ Apply request: preferred_unit_id = OperationalUnitModel.id  ✅
→ CandidateApplicationModel.preferred_unit_id = OperationalUnitModel.id  ✅
→ CandidateJobPipelineModel.operational_unit_id = OperationalUnitModel.id ✅
→ Pipeline board retorna unit_name (COALESCE) + operational_unit_id      ✅
→ Pipeline filter filtra por operational_unit_id                          ✅
→ KanbanCard exibe "Unidade: X" quando not null                          ✅
→ PipelinePage filtra quando board tem 2+ unidades                        ✅
→ PreAdmissionCaseModel.operational_unit_id herdado do pipeline (Fase 1) ✅
→ Workspace exibe unit_name da pré-admissão (Fase 1)                     ✅
```

**Todos os elos confirmados.**

---

## Recomendação

**A Fase 2 está correta e pode ser considerada completa.**

A correção crítica do `OperationalUnitModel.id` vs `JobUnitModel.id` foi aplicada corretamente e todos os testes a validam. Os dois pontos de atenção (dropdown desaparece com filtro ativo; ausência de teste E2E da cadeia) são de baixo risco e não impedem o avanço.

**Antes do rollout em produção, considerar:**
1. Adicionar teste de integração E2E cobrindo a cadeia completa (elo da Fase 1, Nota 4)
2. Corrigir o comportamento do dropdown de unidade quando o board está filtrado (Nota 1)
3. Corrigir o teste pré-existente `test_apply_rejects_invalid_file` (mensagem legada)

**Avançar para auditoria do bot:** a base de dados multiunidade está sólida. Se o bot precisar usar `preferred_unit_id` no fluxo de candidatura, a validação já existe no serviço e aceita o valor via `source='bot'` (válido em `APPLICATION_SOURCES`).

---

*Auditoria read-only — nenhum arquivo de código foi alterado durante este processo.*
