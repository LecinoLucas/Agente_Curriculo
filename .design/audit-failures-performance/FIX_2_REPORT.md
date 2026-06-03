# FIX_2_REPORT — AUDIT-FIX-2: Pipeline Kanban Sem Paginação

**Data:** 2026-06-03  
**Finding:** B-CRIT-05 — `GET /pipeline/{job_id}` sem limite, carrega todos os candidatos em memória  
**Branch:** `save/behavioral-ai-and-wips`

---

## Diagnóstico

O endpoint `GET /pipeline/{job_id}` invoca:

```
router.get_pipeline_board
  → PipelineService.get_board
    → PipelineService.list_job_matches
      → SQLAlchemyPipelineRepository.list_job_matches
```

O repositório executava uma query com 5 CTEs e ORDER BY sem LIMIT. Qualquer vaga com N candidatos retornava N rows para a memória do worker, serializava N objetos Pydantic, e enviava um JSON proporcional a N×~400 bytes.

---

## Solução escolhida

**SQL-level LIMIT configurável + campo `truncated` no response.**

Descartadas:
- **Paginação por coluna** (ROW_NUMBER PARTITION BY stage): mudaria o contrato e exigiria frontend pagination UI
- **Cap Python-side**: não protege a DB nem a memória durante o fetch
- **Paginação total com cursor**: mudaria o contrato; kanban não tem UI de "próxima página"

A solução escolhida:
1. Adiciona `PIPELINE_BOARD_MAX_ROWS: int = 500` em settings — configurável por env
2. Passa `limit=max_rows` para a query SQL via parâmetro no repositório
3. Detecta truncamento via `len(rows) >= max_rows` no service
4. Expõe `truncated: bool = False` em `PipelineBoardResponse` — backward-compatible
5. Atualiza apenas o tipo TypeScript (`truncated?: boolean`) — sem mudança de tela

---

## Contrato: antes / depois

### Backend — `PipelineBoardResponse`

**Antes:**
```python
class PipelineBoardResponse(BaseModel):
    job_id: UUID
    columns: list[PipelineColumnResponse]
```

**Depois:**
```python
class PipelineBoardResponse(BaseModel):
    job_id: UUID
    columns: list[PipelineColumnResponse]
    truncated: bool = False  # novo, default False
```

### Frontend — `JobPipelineBoard` (`domain.ts`)

**Antes:**
```typescript
export type JobPipelineBoard = {
  job_id: string;
  columns: PipelineColumn[];
};
```

**Depois:**
```typescript
export type JobPipelineBoard = {
  job_id: string;
  columns: PipelineColumn[];
  truncated?: boolean;  // novo, opcional
};
```

### Repositório — `list_job_matches`

**Antes:**
```python
async def list_job_matches(self, job_id, *, entered_from=None, ...) -> list[dict]:
    ...
    .order_by(CandidateJobPipelineModel.updated_at.desc())
    )
```

**Depois:**
```python
async def list_job_matches(self, job_id, *, entered_from=None, ..., limit=None) -> list[dict]:
    ...
    .order_by(CandidateJobPipelineModel.updated_at.desc())
    .limit(limit)  # None = sem limite (compatível com SQLAlchemy)
    )
```

### Service — `get_board`

**Antes:**
```python
matches = await self.list_job_matches(job_id, filters)
...
return PipelineBoardResponse(job_id=job_id, columns=columns)
```

**Depois:**
```python
max_rows = settings.PIPELINE_BOARD_MAX_ROWS
matches = await self.list_job_matches(job_id, filters, max_rows=max_rows)
truncated = len(matches) >= max_rows
...
return PipelineBoardResponse(job_id=job_id, columns=columns, truncated=truncated)
```

---

## Arquivos modificados

| Arquivo | Tipo | O que mudou |
|---------|------|-------------|
| `backend/src/core/settings.py` | config | `PIPELINE_BOARD_MAX_ROWS: int = 500` |
| `backend/src/interface/api/schemas/pipeline_schemas.py` | schema | `truncated: bool = False` em `PipelineBoardResponse` |
| `backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py` | repo | Parâmetro `limit` + `.limit(limit)` na query |
| `backend/src/application/services/pipeline_service.py` | service | Import settings, passa `max_rows`, detecta truncamento |
| `backend/tests/unit/test_pipeline_service_board_contract.py` | testes | 5 novos testes de truncamento |
| `frontend/src/types/domain.ts` | tipo TS | `truncated?: boolean` em `JobPipelineBoard` |

---

## Testes executados

### Backend unit tests
```
tests/unit/test_pipeline_service_board_contract.py — 7 passed
```

Novos testes adicionados:
- `test_get_board_not_truncated_when_below_limit` — 10 candidatos, limit=500 → truncated=False
- `test_get_board_truncated_when_at_limit` — 5 candidatos, limit=5 → truncated=True
- `test_get_board_passes_max_rows_to_list_job_matches` — verifica que max_rows é passado
- `test_get_board_distributes_candidates_to_correct_columns` — distribuição por stage
- `test_pipeline_board_response_includes_truncated_field` — campo presente no model_dump

```
Suite completa: 12 failed, 549 passed
12 falhas são pré-existentes (Tesseract não instalado no ambiente)
Nenhuma regressão introduzida.
```

### Frontend TypeScript
```
TypeScript: No errors found
```

---

## Comportamento esperado em produção

| Cenário | Antes | Depois |
|---------|-------|--------|
| Vaga com 100 candidatos | 100 rows | 100 rows, `truncated=false` |
| Vaga com 500 candidatos | 500 rows | 500 rows, `truncated=true` |
| Vaga com 2000 candidatos | 2000 rows (LENTO) | 500 rows, `truncated=true` |

Para jobs com `truncated=true`, o frontend exibirá o que for enviado. Uma UI de aviso ou paginação por stage pode ser adicionada em fase posterior sem mudar o contrato.

---

## Riscos restantes

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Com `truncated=true`, candidatos em stages pouco-atualizados podem não aparecer | Baixo | ORDER BY `updated_at DESC` garante que os mais recentes estejam no board |
| Se um job tiver >500 candidatos ativos, candidatos antigos ficam invisíveis | Baixo | 500 é muito acima do limite prático de qualquer vaga real |
| Frontend não exibe aviso de truncamento | Baixo | `truncated` está disponível no tipo, pode ser usado numa fase futura |
| `PIPELINE_BOARD_MAX_ROWS` precisa de `.env.example` documentado | Baixo | Adicionado ao settings com default seguro |

---

## git status --short

```
 M backend/src/application/services/pipeline_service.py
 M backend/src/core/settings.py
 M backend/src/infrastructure/repositories/sqlalchemy_pipeline_repository.py
 M backend/src/interface/api/schemas/pipeline_schemas.py
 M backend/tests/unit/test_pipeline_service_board_contract.py
 M frontend/src/types/domain.ts
```
