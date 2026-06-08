## Frontend

- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run test -- --run PipelinePage`
- `cd frontend && npm run test -- --run PipelineContext`
- `cd frontend && npm run test -- --run JobsPage`
- `cd frontend && npm run test -- --run useJobsList`
- `cd frontend && npm run test -- --run AdmissionCasePage`
- `cd frontend && npm run build`

## Backend

Comandos executados com env mínimo local para bootstrap de `Settings`:

- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_rag_postgres_vector_store.py -v`
- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_knowledge_tools.py -v`
- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/integration/test_pipeline_stage_gates.py -v`
- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_rag_postgres_vector_retriever.py -v`

## Resultado

- `npx tsc --noEmit`: ok
- `npm run test -- --run PipelinePage`: 44 passed
- `npm run test -- --run PipelineContext`: 5 passed
- `npm run test -- --run JobsPage`: 2 passed
- `npm run test -- --run useJobsList`: 3 passed
- `npm run test -- --run AdmissionCasePage`: 44 passed
- `npm run build`: ok
- `test_ai_rag_postgres_vector_store.py -v`: 14 passed
- `test_ai_knowledge_tools.py -v`: 13 passed
- `test_ai_rag_postgres_vector_retriever.py -v`: 16 passed
- `test_pipeline_stage_gates.py -v`: 32 passed

## Warnings

- warnings de depreciação do Pydantic já existentes no projeto são esperados;
- warnings de `act(...)` em `PipelinePage` e warnings de future flags do React Router apareceram nos testes frontend, sem falha funcional;
- não houve chamada real a Gemini.

## Limitações

- budgets ainda são de regressão funcional/call-count, não benchmark de carga real;
- os testes RAG usam mocks determinísticos de vetor e disponibilidade de `pgvector`.
