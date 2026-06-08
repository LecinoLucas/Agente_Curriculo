# PRE-ADMISSION-CASE-AUTO-FIX-1 - Resultados de testes

## Backend

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
source .venv/bin/activate
APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai JWT_SECRET_KEY=test-jwt pytest tests/integration/test_pipeline_endpoints_integration.py -k "hired or pre_admission or offer" -v
```

Resultado:

- `7 passed, 13 deselected`

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
source .venv/bin/activate
APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai JWT_SECRET_KEY=test-jwt pytest tests/integration/test_pipeline_stage_gates.py -k "offer or hired or pre_admission" -v
```

Resultado:

- `10 passed, 22 deselected`

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
source .venv/bin/activate
APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai JWT_SECRET_KEY=test-jwt pytest tests/unit -k "pre_admission or pipeline" -v
```

Resultado:

- `95 passed, 1329 deselected`

## Frontend

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npx tsc --noEmit
```

Resultado:

- Sem erros TypeScript.

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run test -- --run PipelinePage
```

Resultado:

- `43 passed`
- Avisos existentes de `act(...)`/Tooltip em testes, sem falha.

Comando adicional para arquivos alterados:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run test -- --run usePipelineTransitionBlocked usePipelineGateActionResolver pipelineService.blockedError
```

Resultado:

- `23 passed`
- Avisos existentes de React Router future flags, sem falha.

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run build
```

Resultado:

- Build concluído com sucesso.

## Limitações

- Os testes foram executados com variáveis de ambiente explícitas de teste para permitir import das settings do backend.
- Nenhum teste aciona Protheus real.
- Esta fase não valida visualmente a tela de templates/checklists, porque não foi criada UX nova.
