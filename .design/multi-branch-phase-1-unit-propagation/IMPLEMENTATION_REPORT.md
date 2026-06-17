# Relatório de Implementação — Fase 1 Multi-Branch Unit Propagation
**Data:** 2026-06-17  
**Branch:** save/behavioral-ai-and-wips

---

## Objetivo

Implementar a propagação mínima de `operational_unit_id` através da cadeia:

```
CandidateApplicationModel.preferred_unit_id
  → CandidateJobPipelineModel.operational_unit_id
    → PreAdmissionCaseModel.operational_unit_id
      → ProtheusCasePayloadAdapter (prioriza unidade do caso)
        → Workspace de pré-admissão exibe unit_name
```

---

## Arquivos Alterados

### Backend — Migrations

| Arquivo | Descrição |
|---------|-----------|
| `backend/alembic/versions/n1o2p3q4r5s6_add_operational_unit_id_to_pipeline_and_preadmission.py` | Nova migration: adiciona `operational_unit_id UUID NULL FK→operational_units` em `candidate_job_pipeline`, `candidate_job_pipeline_events`, `candidate_pipeline`, `pipeline_stage_transitions` e `pre_admission_cases`. Índices criados em `candidate_job_pipeline` e `pre_admission_cases`. |

### Backend — Models

| Arquivo | Campo adicionado |
|---------|-----------------|
| `candidate_job_pipeline_model.py` | `CandidateJobPipelineModel.operational_unit_id` (FK + índice) |
| `candidate_job_pipeline_model.py` | `CandidateJobPipelineEventModel.operational_unit_id` (sem FK, para log histórico) |
| `candidate_pipeline_model.py` | `CandidatePipelineModel.operational_unit_id` (FK + índice, legacy) |
| `candidate_pipeline_model.py` | `PipelineStageTransitionModel.operational_unit_id` (sem FK, legacy) |
| `pre_admission_model.py` | `PreAdmissionCaseModel.operational_unit_id` (FK + índice) |

### Backend — Services / Repository

| Arquivo | Mudança |
|---------|---------|
| `sqlalchemy_pipeline_repository.py` | `create_entry()` e `reactivate_entry()` aceitam `operational_unit_id: UUID | None` |
| `pipeline_service.py` | Importa `CandidateApplicationModel`. Nova função `_lookup_preferred_unit_id()`. `add_candidate_to_job()` busca `preferred_unit_id` da candidatura e persiste em `CandidateJobPipelineModel` e no evento. |
| `pre_admission_service.py` | `create()` lê `active_pipeline.operational_unit_id` e grava em `PreAdmissionCaseModel.operational_unit_id`. |
| `protheus_case_payload_adapter.py` | `build()` passa `case.operational_unit_id` para `_resolve_unit_code()`. `_resolve_unit_code()` aceita `operational_unit_id` — tenta lookup direto por unidade antes do fallback por `job_units`. |
| `protheus_export_queue_service.py` | `_resolve_case_unit_names()` reformulado: primeiro resolve pelos casos que já têm `operational_unit_id` via JOIN direto; fallback para `job_units` somente para os que não têm. |

### Backend — Schemas

| Arquivo | Mudança |
|---------|---------|
| `pre_admission_schemas.py` | `AdmissionJobSummarySchema` recebe `unit_name: str | None = None` |

### Backend — Workspace Service

| Arquivo | Mudança |
|---------|---------|
| `admission_case_workspace_service.py` | Importa `OperationalUnitModel`. Novo método `_resolve_unit_name()`. `get_overview()` e `_overview_response()` recebem `unit_name`. `_workspace_response()` resolve e popula `job.unit_name`. |

### Frontend

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/types/domain.ts` | `AdmissionWorkspaceJob.unit_name?: string | null` |
| `frontend/src/features/admission-workspace/components/AdmissionCaseHeader.tsx` | Exibe `Unidade: {job.unit_name}` ou `Unidade não definida` abaixo do título da vaga. |

### Testes

| Arquivo | Testes |
|---------|--------|
| `backend/tests/unit/test_multi_branch_unit_propagation.py` | 7 testes: `_resolve_unit_code` com `operational_unit_id` definido, sem unidade, com unidade inativa, com fallback de parâmetro, sem unidade em lugar nenhum; `_lookup_preferred_unit_id` com e sem candidatura. |

---

## Comandos de Validação Executados

```bash
# Backend — novos testes
.venv/bin/python -m pytest tests/unit/test_multi_branch_unit_propagation.py -v
# Resultado: 7 passed

# Backend — regressão protheus + pipeline
.venv/bin/python -m pytest tests/unit/test_protheus_export_status_contract.py tests/unit/test_pipeline_service_board_contract.py -v
# Resultado: 11 passed

# Frontend — typecheck
cd frontend && npx tsc --noEmit
# Resultado: no errors

# Frontend — workspace tests
cd frontend && npx vitest run src/features/admission-workspace/__tests__/
# Resultado: PASS (43) FAIL (0)
```

---

## Fluxo Provado

### Com `preferred_unit_id` definido:
1. `CandidateApplicationModel.preferred_unit_id = X`
2. `add_candidate_to_job()` → `_lookup_preferred_unit_id()` → `X`
3. `create_entry(operational_unit_id=X)` → `CandidateJobPipelineModel.operational_unit_id = X`
4. `PreAdmissionService.create()` → `active_pipeline.operational_unit_id = X` → `PreAdmissionCaseModel.operational_unit_id = X`
5. `ProtheusCasePayloadAdapter.build()` → `_resolve_unit_code(operational_unit_id=X)` → usa código da unidade X, **não** a primeira `job_unit`
6. `AdmissionCaseWorkspaceService._workspace_response()` → `_resolve_unit_name(case)` → `job.unit_name = "Unidade X"`
7. Frontend: `AdmissionCaseHeader` exibe `Unidade: Unidade X`

### Sem `preferred_unit_id` (fallback):
1. `_lookup_preferred_unit_id()` → `None`
2. `CandidateJobPipelineModel.operational_unit_id = NULL`
3. `PreAdmissionCaseModel.operational_unit_id = NULL`
4. `_resolve_unit_code(operational_unit_id=None)` → fallback para primeira `job_unit` por prioridade (comportamento anterior preservado)
5. `_resolve_unit_name(case)` → `None`
6. Frontend: `AdmissionCaseHeader` exibe `Unidade não definida`

---

## Limitações Restantes (Fases 2, 3 e 4)

| Fase | O que falta |
|------|------------|
| **Fase 2** | Portal público não expõe `job_units` estruturadas (F-005). `public_application_service` não coleta `preferred_unit_id` do portal (F-010). Sem isso, `preferred_unit_id` só é populado por staff. |
| **Fase 3** | Pipeline staff sem filtro `?operational_unit_id=` (F-009). UniqueConstraint de candidatura não inclui `preferred_unit_id` (F-006). |
| **Fase 4** | `protheus_group_code` / `protheus_branch_code` hardcoded em schema e router (F-004). Campos não existem em `OperationalUnit` ainda — bloqueado até decisão de produto sobre mapeamento. |
| **Cosmético** | Labels inconsistentes entre frontend e backend (F-011) — aguarda glossário de produto. |
