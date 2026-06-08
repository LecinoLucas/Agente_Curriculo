# PERF-FIX-PIPELINE-1 - Test Results

## Frontend

### TypeScript

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npx tsc --noEmit
```

Resultado:

- Passou.
- Saida: `TypeScript: No errors found`.

### PipelinePage

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run test -- --run PipelinePage
```

Resultado:

- `43 passed`
- Duracao: `2.93s`

Warnings:

- Warnings React existentes de `act(...)` em `PipelinePage` e `Tooltip`, especialmente no teste de timer.

### CandidatePreviewDrawer

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run test -- --run CandidatePreviewDrawer
```

Resultado:

- `31 passed`
- Duracao: `2.35s`

### PipelineContext adicional

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run test -- --run PipelineContext
```

Resultado:

- `5 passed`
- Duracao: `1.34s`

### Build

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run build
```

Resultado:

- Passou.
- Vite build concluido em `4.16s`.

## Backend

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
.venv/bin/python -m pytest tests/integration/test_pipeline_stage_gates.py -v
```

Resultado:

- `32 passed`
- Duracao: `28.81s`

Warnings:

- 3 warnings de Pydantic deprecated class-based config.

## Limitacoes

- Nao foi executado teste com massa grande de candidatos.
- Nao foi medido payload real no navegador.
- Ranking invalidation foi mantido e documentado para fase futura.
