# Testing Guide

Guia rápido para rodar a suíte de testes do backend de forma eficiente.

## Markers disponíveis

Definidos em [`pyproject.toml`](../pyproject.toml) (`[tool.pytest.ini_options]`):

| Marker        | Significado                                                                  |
|---------------|------------------------------------------------------------------------------|
| `unit`        | Testes unitários — dependências mockadas, sem DB/IO                          |
| `integration` | Sobem app/DB SQLite em memória via fixtures                                  |
| `e2e`         | Cenários ponta-a-ponta longos (full ATS flow, demo full flow)                |
| `security`    | RBAC, LGPD, auth, secrets, upload, documentos sensíveis                      |
| `slow`        | Testes >1s ou cadeias pesadas — manter fora do smoke local                   |
| `smoke`       | Subset crítico para verificação rápida pós-mudança                           |
| `legacy`      | Fixtures/contrato desatualizados — pendente de reescrita; **fora do smoke**  |
| `postgres`    | Requer DB Postgres real (não SQLite); rodar com `-m postgres` explicitamente |

`tests/e2e/conftest.py` aplica `e2e` + `slow` automaticamente em todos os testes
sob `tests/e2e/`. Os arquivos críticos do smoke aplicam `pytestmark = pytest.mark.smoke`
no topo do módulo.

## Comandos por intenção

Todos sem coverage (`--no-cov`) para velocidade. Use coverage só em CI ou
quando explicitamente investigando branches descobertas.

### Smoke real — uso default antes de cada commit

```bash
cd backend
./.venv/bin/python -m pytest -m smoke --no-cov -q --tb=short
```

Roda apenas os arquivos marcados `smoke` (subset crítico). **Meta < 90s**.
Cobre: candidatura pública, Google auth do candidato, logout, RBAC, anti
brute-force (staff + candidato), segurança de documentos pré-admissão.

### Regression local — antes de abrir PR

```bash
./.venv/bin/python -m pytest -m "not slow and not e2e and not legacy" --no-cov -q --tb=short
```

Roda toda a suíte exceto e2e/slow/legacy. Esperado **~5–6 min**, 0 falhas.

### Unit leve

```bash
./.venv/bin/python -m pytest tests/unit -m "not legacy and not slow" --no-cov -q
```

Esperado **~5s**, 347 testes. Após Fase 30B `tests/unit/conftest.py` faz override
do autouse `system_user_for_public_app` para no-op em unit tests, eliminando
o custo de criação do system user no SQLite (~250 ms/teste).

### Integration por módulo

```bash
./.venv/bin/python -m pytest tests/integration/test_public_application.py --no-cov -q
./.venv/bin/python -m pytest tests/integration/test_security_auth_lockout.py --no-cov -q
```

### Apenas e2e

```bash
./.venv/bin/python -m pytest -m e2e --no-cov -q --tb=short
```

Esperado **~5s**, dois cenários longos. Rodar em CI ou antes de PR grande.

### Completo sem coverage

```bash
./.venv/bin/python -m pytest --no-cov -q --tb=short
```

Esperado **~10 min**. Para validação final antes de PR.

### Completo com coverage (CI)

```bash
./.venv/bin/python -m pytest -q --tb=short
```

Lento (~28 min com `--cov=src --cov-report=term-missing`). Reservado para
pipeline de CI ou quando relatório de cobertura é necessário.

### Coleta sem rodar nada

```bash
./.venv/bin/python -m pytest --collect-only -q --no-cov
```

Para verificar que toda a suíte coleta sem ImportError. **<1s**, ~1130 testes.

## Rodando contra Postgres real

Os testes marcados `postgres` (em `tests/integration/postgres/`) precisam de
DB Postgres real. Setup descrito em [`tests/integration/postgres/conftest.py`](../tests/integration/postgres/conftest.py).

```bash
./.venv/bin/python -m pytest -m postgres --no-cov -q
```

## Arquivos no set `smoke` (Fase 30B)

Cobrem caminho crítico end-user + segurança/RBAC essencial:

- `tests/test_public_application.py` — candidatura pública (LGPD, validações, fluxo)
- `tests/integration/test_candidate_google_auth.py` — Google OAuth do candidato
- `tests/integration/test_candidate_portal_logout.py` — logout idempotente
- `tests/integration/test_security_auth_lockout.py` — anti brute-force staff + candidato
- `tests/integration/test_rbac_permissions.py` — RBAC roles e semântica
- `tests/integration/test_pre_admission_document_security.py` — documentos sensíveis

Para adicionar arquivo ao smoke: `pytestmark = pytest.mark.smoke` no topo do módulo.
Para adicionar teste individual: `@pytest.mark.smoke` no decorator.

## Arquivos marcados `slow` em nível de módulo (Fase 30B)

Excluídos por default de `-m "not slow"`. Continuam rodando em regression e CI.

- `tests/integration/test_admin_notifications.py` — alertas observabilidade (Redis/Calendar)
- `tests/integration/test_admin_candidate_job_flow_diagnostics_api.py` — diagnósticos admin
- Todos sob `tests/e2e/` (via `tests/e2e/conftest.py`)

## Testes resolvidos (Fase 30D / 30E)

Os arquivos abaixo estavam marcados como `legacy` em Fase 30A/30B; foram
resolvidos definitivamente. Hoje **não há mais arquivos `legacy` no repo**.

- **Fase 30D**: `tests/integration/test_skill_endpoints.py` — reescrito do
  zero com matriz RBAC completa (25 testes); 2 testes que asseravam DELETE/
  GET-by-id inexistentes foram removidos.
- **Fase 30E**:
  - `tests/unit/test_analysis_scoring.py` — reescrito de 12 testes async via
    `_match_details_to_job` para 13 testes síncronos que exercitam
    `_skill_matches`, `_compute_skill_scores` e `_calculate_seniority_score`
    diretamente (sem mocks pesados).
  - `tests/unit/test_objective_validation_unknown.py` — removidos 10 async
    duplicados que rodavam o pipeline inteiro só pra ler `validation_status`;
    mantidos 8 testes diretos de `_validate_education` e `_validate_experience`.
  - `tests/unit/test_validation_response.py` — payload atualizado para o schema
    atual de `AnalysisMatchResponse` (`priority_skills_*`, `complementary_skills_*`,
    `job_fit_score`, `engine_used`).
  - `tests/unit/test_analysis_skill_scoring.py` — 2 asserts ajustados ao
    contrato atual de `partial_matches`; marker `legacy` removido.
  - `tests/unit/test_f71_score_inflation_audit.py` — passava 9/9 sem marker;
    `pytestmark = legacy` era falso-positivo, foi removido.

## Cobertura crítica preservada (nunca remover sem revisão)

Os arquivos no set `smoke` + os abaixo:

- `tests/integration/test_admin_bi_api.py::test_bi_overview_does_not_expose_api_keys`
- `tests/integration/test_admin_system_health_api.py::test_health_endpoints_do_not_expose_api_keys`
- `tests/integration/test_collaboration_service.py::test_collaboration_does_not_expose_sensitive_data`
- `tests/integration/test_manager_review_flow.py` — RBAC + feedback gate
- `tests/integration/test_interview_scorecards.py` — RBAC + scorecard
- `tests/integration/test_hiring_decision_*.py` — gate de contratação
- `tests/integration/test_pre_admission*.py` — pré-admissão
