# PRE-ADMISSION-CASE-AUTO-FIX-1 — Test Results

## Backend

### Executado

```bash
cd backend
.venv/bin/python -m pytest tests/integration/test_pipeline_endpoints_integration.py -k "hired or pre_admission or offer" -v
.venv/bin/python -m pytest tests/integration/test_pipeline_stage_gates.py -k "offer or hired or pre_admission" -v
```

### Resultado

- `test_pipeline_endpoints_integration.py`: 7 selecionados, 7 OK
- `test_pipeline_stage_gates.py`: 10 selecionados, 10 OK

### Cobertura funcional validada

- `hired -> pre_admission` com checklist padrao cria caso e retorna `case_id`
- sem checklist padrao retorna `DEFAULT_CHECKLIST_TEMPLATE_REQUIRED`
- sem checklist padrao nao cria caso
- sem checklist padrao nao gera pacote de admissao
- sem checklist padrao nao registra evento de `stage_moved` para `pre_admission`
- `offer -> hired` continua funcionando
- `final -> offer` continua funcionando

## Frontend

### Executado

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Resultado

- `npx tsc --noEmit`: OK
- `npm run build`: OK

## Limitacoes

- Nao houve ajuste de frontend porque o cliente atual ja trata `pre_admission_case_id` nulo sem navegar.
- Permanecem warnings de Pydantic v2 nas suites de backend, fora do escopo desta fase.
