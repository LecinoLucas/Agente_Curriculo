# PERF-FIX-PREADMISSION-1 — Test Results

## Frontend

### Executado

```bash
cd frontend
npx tsc --noEmit
npm run test -- --run AdmissionCasePage
npm run test -- --run admission
npm run build
```

### Resultado

- `npx tsc --noEmit`: OK
- `npm run test -- --run AdmissionCasePage`: 44 testes OK
- `npm run test -- --run admission`: 95 testes OK
- `npm run build`: OK

## Backend

### Executado

```bash
cd backend
.venv/bin/python -m pytest tests -k "pre_admission or admission" -v
```

### Resultado

- 217 testes OK
- 4 falhas
- 2875 testes deselecionados

### Falhas observadas

- `tests/e2e/test_full_ats_flow.py::test_admission_package_validation_blocks_with_pending_docs`
- `tests/integration/test_admission_case_workspace.py::test_workspace_blocks_case_when_pipeline_is_inactive`
- `tests/integration/test_communication_event_integrations.py::test_pre_admission_and_document_events_create_safe_communications`
- `tests/integration/test_communication_event_integrations.py::test_admission_package_approved_creates_communication`

### Leitura das falhas

- A primeira falha quebra por validacao de publicacao de vaga exigindo `behavioral_template_id`.
- As duas falhas de communication estao fora do frontend do workspace.
- Essas falhas aparecem numa rodada sem alteracao de backend nesta fase.

## Warnings

- Warnings do React Router v7 nos testes de frontend.
- Suite backend demorou `155.67s`.

## Limitacoes

- Nao houve alteracao nem tentativa de corrigir as 4 falhas de backend, por estarem fora do escopo permitido.
