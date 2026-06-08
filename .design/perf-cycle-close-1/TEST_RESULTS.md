## Git

- `git status --short`
- `git log --oneline -12`
- `git branch --show-current`

## Frontend

- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run test -- --run PipelinePage`
- `cd frontend && npm run test -- --run PipelineContext`
- `cd frontend && npm run test -- --run JobsPage`
- `cd frontend && npm run test -- --run useJobsList`
- `cd frontend && npm run test -- --run AdmissionCasePage`
- `cd frontend && npm run test -- --run SystemHealthPage`
- `cd frontend && npm run build`

## Backend

- `cd backend && APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test .venv/bin/python -m pytest tests/integration/test_pipeline_stage_gates.py -v`
- `cd backend && APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test .venv/bin/python -m pytest tests/unit/test_ai_rag_postgres_vector_store.py -v`
- `cd backend && APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test .venv/bin/python -m pytest tests/unit/test_ai_knowledge_tools.py -v`
- `cd backend && APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test .venv/bin/python -m pytest tests/unit/test_ai_rag_postgres_vector_retriever.py -v`

## Resultado

- `git status --short`: sem pendências antes desta documentação
- branch atual: `save/behavioral-ai-and-wips`
- `npx tsc --noEmit`: ok
- `PipelinePage`: 44 passed
- `PipelineContext`: 5 passed
- `JobsPage`: 2 passed
- `useJobsList`: 3 passed
- `AdmissionCasePage`: 44 passed
- `SystemHealthPage`: 8 passed
- `npm run build`: ok
- `test_pipeline_stage_gates.py -v`: 32 passed
- `test_ai_rag_postgres_vector_store.py -v`: 14 passed
- `test_ai_knowledge_tools.py -v`: 13 passed
- `test_ai_rag_postgres_vector_retriever.py -v`: 16 passed

## Warnings

- warnings antigos de `act(...)` em `PipelinePage`;
- warnings antigos de future flags do React Router em testes frontend;
- warnings antigos de depreciação do Pydantic V2 no backend.

## Limitações

- não houve validação manual visual do Pipeline neste fechamento;
- a regressão mínima confirma cobertura automatizada, não benchmark de carga real;
- os testes backend unitários de RAG usam env mínimo local para bootstrap de `Settings`.
