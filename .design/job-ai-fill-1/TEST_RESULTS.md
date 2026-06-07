# JOB-AI-FILL-1 — Test Results

## Backend

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
.venv/bin/python -m pytest tests/unit/test_job_ai_draft_service.py -v
```

Resultado:

- `123 passed`
- `3 warnings` de deprecação Pydantic já existentes

## Frontend

Comandos:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npx tsc --noEmit
npm run test -- --run JobAiDraftPanel
```

Resultados:

- TypeScript sem erros
- `39 passed` em `JobAiDraftPanel`

## Casos novos cobertos

- backfill de `requirements` com texto administrativo explícito;
- backfill de `experience_context` com rotinas objetivas;
- remoção de `work_model` sem evidência;
- backfill de `work_model` com evidência explícita;
- bloqueio de pseudo-localização por restrição de moradia;
- regressão de salário/benefícios negados no texto.

## Resultado final

Fase concluída sem mudança de frontend, sem migration e sem endpoint novo.
