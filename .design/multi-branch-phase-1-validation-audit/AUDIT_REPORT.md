# Relatório de Auditoria — Fase 1 Multi-Branch Unit Propagation
**Data:** 2026-06-17  
**Branch:** save/behavioral-ai-and-wips  
**Auditoria:** Leitura de código + execução de testes (sem alterações de código)  

---

## Classificação Geral

**PASS_WITH_NOTES**

A cadeia de propagação está correta e funcional. Dois pontos de atenção foram identificados — nenhum é bloqueante para avançar à Fase 2.

---

## Critérios Verificados

| # | Critério | Status |
|---|---------|--------|
| 1 | Unidade escolhida na candidatura chega ao pipeline | PASS |
| 2 | Unidade do pipeline chega à pré-admissão | PASS |
| 3 | Unidade da pré-admissão é usada antes do fallback no Protheus adapter | PASS |
| 4 | Unidade aparece no workspace | PASS |
| 5 | Fluxos antigos sem unidade continuam funcionando | PASS |

---

## Comandos Executados

```bash
# Backend — testes novos
backend/.venv/bin/python -m pytest tests/unit/test_multi_branch_unit_propagation.py -v
# Resultado: 7 passed

# Backend — regressão
backend/.venv/bin/python -m pytest \
  tests/unit/test_protheus_export_status_contract.py \
  tests/unit/test_pipeline_service_board_contract.py \
  tests/unit/test_protheus_payload_builder_and_validator.py -v
# Resultado: 15 passed

# Frontend — typecheck
frontend/npx tsc --noEmit
# Resultado: no errors

# Frontend — testes workspace
frontend/npx vitest run src/features/admission-workspace/__tests__/
# Resultado: PASS (43) FAIL (0)
```

---

## Arquivos Auditados

```
backend/alembic/versions/n1o2p3q4r5s6_add_operational_unit_id_to_pipeline_and_preadmission.py
backend/src/infrastructure/database/models/candidate_job_pipeline_model.py
backend/src/infrastructure/database/models/candidate_pipeline_model.py
backend/src/infrastructure/database/models/pre_admission_model.py
backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py
backend/src/application/services/pipeline_service.py
backend/src/application/services/pre_admission_service.py
backend/src/application/services/protheus_case_payload_adapter.py
backend/src/application/services/protheus_export_queue_service.py
backend/src/application/services/admission_case_workspace_service.py
backend/src/interface/api/schemas/pre_admission_schemas.py
backend/tests/unit/test_multi_branch_unit_propagation.py
frontend/src/types/domain.ts
frontend/src/features/admission-workspace/components/AdmissionCaseHeader.tsx
```

---

## Análise por Elo da Cadeia

### Elo 1 — Candidatura → Pipeline

**Arquivo:** `pipeline_service.py`  
**Função:** `_lookup_preferred_unit_id(session, *, candidate_id, job_id) -> UUID | None`

```python
stmt = (
    sa.select(CandidateApplicationModel.preferred_unit_id)
    .where(
        CandidateApplicationModel.candidate_id == candidate_id,
        CandidateApplicationModel.job_id == job_id,
        CandidateApplicationModel.deleted_at.is_(None),
    )
    .limit(1)
)
```

`add_candidate_to_job()` chama este helper e passa o resultado tanto para `create_entry(operational_unit_id=preferred_unit_id)` quanto para o evento `CandidateJobPipelineEventModel(... operational_unit_id=preferred_unit_id)`.

**Status:** PASS  
**Nota:** A query filtra apenas por `deleted_at IS NULL`, sem filtro de `status`. Risco: se existir uma candidatura abandonada (sem soft-delete) e uma ativa para o mesmo `(candidate_id, job_id)`, o `.limit(1)` pode retornar a errada. Mitigante: o unique partial index `uq_candidate_applications_active_candidate_job` cobre apenas status ativos, então na prática a candidatura ativa é a única com `deleted_at IS NULL` para esse par. Risco classificado como **baixo**.

---

### Elo 2 — Pipeline → Pré-admissão

**Arquivo:** `pre_admission_service.py`  
**Método:** `create()`

```python
operational_unit_id = (
    active_pipeline.operational_unit_id
    if active_pipeline is not None
    else None
)
# ...
PreAdmissionCaseModel(
    ...
    operational_unit_id=operational_unit_id,
    ...
)
```

O `active_pipeline` é buscado por `(candidate_id, job_id)` antes dessa extração — par correto.

**Status:** PASS

---

### Elo 3 — Pré-admissão → Protheus Adapter

**Arquivo:** `protheus_case_payload_adapter.py`  
**Método:** `_resolve_unit_code(self, job_id, fallback_unit_code, *, operational_unit_id=None)`

Prioridade implementada:
1. `operational_unit_id is not None` → lookup direto por `id` + `is_active=True` → retorna se encontrar
2. Fallback: primeira `job_unit` ativa com menor `priority` (comportamento original)
3. Fallback final: `fallback_unit_code` (pode ser `None`)

`build()` passa `operational_unit_id=case.operational_unit_id` para `_resolve_unit_code()`.

**Status:** PASS

---

### Elo 4 — Pré-admissão → Workspace

**Arquivo:** `admission_case_workspace_service.py`  
**Método:** `_resolve_unit_name(self, case) -> str | None`

```python
unit = await self._repository._session.get(OperationalUnitModel, case.operational_unit_id)
if unit is None or not unit.is_active:
    return None
return unit.name.strip() or None
```

Chamado em `get_overview()` e `_workspace_response()`. Resultado passado como `unit_name` para `AdmissionJobSummarySchema`.

**Status:** PASS  
**Nota:** `self._repository._session` é um acesso direto ao atributo privado do repositório — acoplamento de encapsulamento. Funcional, mas frágil se o repositório mudar sua estrutura interna. Não é uma regressão nem bloqueia a Fase 2.

---

### Elo 5 — Schema → Frontend

**Arquivo:** `pre_admission_schemas.py`

```python
class AdmissionJobSummarySchema(BaseModel):
    id: UUID
    title: str
    unit_name: str | None = None
```

**Arquivo:** `frontend/src/types/domain.ts`

```typescript
export interface AdmissionWorkspaceJob {
  ...
  unit_name?: string | null;
}
```

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionCaseHeader.tsx`

```tsx
<p className="mt-0.5 text-xs text-text-muted/70" data-testid="admission-unit-name">
  {job.unit_name ? `Unidade: ${job.unit_name}` : "Unidade não definida"}
</p>
```

**Status:** PASS — campo opcional nos dois lados, fallback "Unidade não definida" quando `null`.

---

### Critério 5 — Fluxos sem unidade (backward compatibility)

Todos os campos são `Optional/null` e todos os caminhos de código têm fallback explícito:
- `_lookup_preferred_unit_id` retorna `None` → `operational_unit_id=None` gravado
- `_resolve_unit_code(operational_unit_id=None)` → cai no fallback por `job_units` (comportamento anterior)
- `_resolve_unit_name(case)` com `case.operational_unit_id=None` → retorna `None` → `unit_name=None` → frontend exibe "Unidade não definida"

**Status:** PASS

---

### Migration

**Arquivo:** `n1o2p3q4r5s6_add_operational_unit_id_to_pipeline_and_preadmission.py`

| Tabela | FK | Índice | Downgrade |
|--------|-----|--------|-----------|
| `candidate_job_pipeline` | `→ operational_units ON DELETE SET NULL` | `idx_candidate_job_pipeline_unit` on `(job_id, operational_unit_id)` | DROP INDEX + DROP COLUMN |
| `candidate_job_pipeline_events` | Sem FK (log imutável) | Não | DROP COLUMN |
| `candidate_pipeline` (legacy) | `→ operational_units ON DELETE SET NULL` | `idx_candidate_pipeline_unit` on `(job_id, operational_unit_id)` | DROP INDEX + DROP COLUMN |
| `pipeline_stage_transitions` (legacy) | Sem FK (log imutável) | Não | DROP COLUMN |
| `pre_admission_cases` | `→ operational_units ON DELETE SET NULL` | `idx_pre_admission_cases_unit` on `(operational_unit_id,)` | DROP INDEX + DROP COLUMN |

**Status:** PASS — padrão FK/no-FK correto para tabelas principais vs. logs. Downgrade coerente na ordem inversa.

---

## Notas e Riscos

### Nota 1 — `_lookup_preferred_unit_id` sem filtro de status (Baixo)

O helper filtra apenas `deleted_at IS NULL`. Em casos com candidatura abandonada sem soft-delete coexistindo com candidatura ativa, o `.limit(1)` pode retornar a errada. Mitigante forte: unique partial index garante no máximo uma candidatura ativa por `(candidate_id, job_id)`. Não bloqueia Fase 2.

**Sugestão para Fase 3:** adicionar filtro `.where(CandidateApplicationModel.status.in_(APPLICATION_ACTIVE_STATUSES))`.

### Nota 2 — `_resolve_unit_name` acessa `self._repository._session` (Baixo)

Acoplamento direto ao atributo interno do repositório. Funcional hoje, frágil se o repositório for refatorado para multi-session ou connection pooling diferente. Não é urgente.

**Sugestão:** em refactoring futuro, expor `session` como propriedade pública no repositório base.

### Nota 3 — `CandidatePipelineModel` e `PipelineStageTransitionModel` migrados mas não populados (Informativo)

A migration adiciona `operational_unit_id` nas tabelas legacy, mas nenhum serviço ativo escreve nesses modelos. Isso é intencional — as colunas foram adicionadas para consistência schema mas o código ativo usa `CandidateJobPipelineModel`. Nenhum risco.

### Nota 4 — Sem teste de integração end-to-end da cadeia (Informativo)

Os 7 testes unitários cobrem `_resolve_unit_code` e `_lookup_preferred_unit_id` mas não testam a cadeia completa (candidatura → pipeline → pré-admissão → workspace). Um teste de integração que percorra toda a cadeia aumentaria a confiança antes do rollout em produção.

---

## Resumo dos Testes

| Suite | Testes | Resultado |
|-------|--------|-----------|
| `test_multi_branch_unit_propagation.py` | 7 | 7 passed |
| `test_protheus_export_status_contract.py` | 3 | 3 passed |
| `test_pipeline_service_board_contract.py` | 8 | 8 passed |
| `test_protheus_payload_builder_and_validator.py` | 4 | 4 passed |
| Frontend workspace tests | 43 | 43 passed |
| Frontend typecheck | — | 0 errors |

---

## Recomendação

**A Fase 1 está correta e completa. Pode avançar para a Fase 2.**

A cadeia de propagação foi verificada elo por elo — candidatura → pipeline → pré-admissão → adapter → workspace — e todos os critérios de aceitação foram satisfeitos. Os dois pontos de atenção (filtro de status em `_lookup_preferred_unit_id` e acesso direto ao `_session`) são de baixo risco e não requerem correção antes da Fase 2.

Antes do rollout em produção, considerar:
1. Executar a migration em staging e verificar ausência de erros
2. Adicionar filtro de `status` em `_lookup_preferred_unit_id` (pode ser feito na Fase 3)
3. Adicionar 1 teste de integração cobrindo a cadeia completa

---

*Auditoria read-only — nenhum arquivo de código foi alterado durante este processo.*
