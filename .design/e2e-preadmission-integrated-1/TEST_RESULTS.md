# Test Results

## Backend

### Comandos

```bash
cd backend
source .venv/bin/activate

pytest tests/integration/test_pipeline_endpoints_integration.py -k "offer or hired or pre_admission" -v
pytest tests/integration/test_pipeline_stage_gates.py -k "offer or hired or pre_admission" -v
pytest tests/integration/test_admission_case_workspace.py -v
```

### Resultado

- `test_pipeline_endpoints_integration.py -k "offer or hired or pre_admission"`: **8 passed**
- `test_pipeline_stage_gates.py -k "offer or hired or pre_admission"`: **10 passed**
- `test_admission_case_workspace.py`: **12 passed / 1 failed**

Falha fora do escopo principal desta fase:

- `test_workspace_blocks_case_when_pipeline_is_inactive`
  - esperado: `422`
  - atual: `200`

## Frontend

### Comandos

```bash
cd frontend

npx tsc --noEmit
npm run test -- --run PipelinePage
npm run test -- --run AdmissionCasePage
npm run build
npx playwright test e2e/pipeline-pre-admission-flow.spec.ts --project chromium --reporter=line
```

### Resultado

- `npx tsc --noEmit`: **OK**
- `PipelinePage`: **44 passed**
- `AdmissionCasePage`: **44 passed**
- `npm run build`: **OK**
- `Playwright`: **sem cenário executável útil no ambiente atual**

## Warnings

- warnings já existentes de depreciação do Pydantic no backend
- warnings já existentes de `act(...)` e future flags do React Router nos testes frontend

## Limitações

- o workspace admissional exige permissão mais alta que o recrutador; o teste integrado usou `recruiter` para o pipeline e `admin` para abrir o workspace
- o spec Playwright atual depende de `PREADMISSION_E2E_CASE_ID` para validar a UI real sem fabricar massa implícita
