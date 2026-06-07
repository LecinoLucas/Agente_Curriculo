# Test Results

## Backend

Comandos executados:

```bash
cd backend
.venv/bin/python -m pytest tests/unit/test_job_ai_draft_service.py -v
.venv/bin/python -m pytest tests -k "job and image and draft" -v
```

Resultados:

- `124 passed`
- `6 passed, 3085 deselected`

## Frontend

Comandos executados:

```bash
cd frontend
npx tsc --noEmit
npm run test -- --run JobAiDraftPanel
npm run test -- --run JobFormPage
npm run build
```

Resultados:

- `TypeScript: No errors found`
- `49 passed`
- `36 passed`
- `vite build` concluido com sucesso

## Observacoes

- Os testes de imagem usam mocks para OCR e IA. Nenhuma chamada real a Gemini, OCR externo ou provider remoto foi executada.
- O fluxo de publicacao nao foi alterado; os testes de tela confirmam que aplicar rascunho nao publica nem salva automaticamente.
