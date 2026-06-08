## Backend

Executado com env mínimo local para bootstrap de `Settings`:

- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_rag_postgres_vector_store.py -v`
  - resultado: 14 passed
- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_rag_pgvector_support.py -v`
  - resultado: 5 passed
- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_knowledge_tools.py -v`
  - resultado: 13 passed
- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_rag_answer_service.py -v`
  - resultado: 9 passed
- `APP_SECRET_KEY=test DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/resume_ai JWT_SECRET_KEY=test backend/.venv/bin/python -m pytest backend/tests/unit/test_ai_rag_postgres_vector_retriever.py -v`
  - resultado: 16 passed

## Frontend

Como não houve alteração de frontend nesta fase:

- `cd frontend && npx tsc --noEmit`
  - resultado: ok
- `cd frontend && npm run build`
  - resultado: ok

## Warnings

- testes backend emitiram warnings depreciação do Pydantic já existentes no projeto;
- nenhum teste chamou Gemini real nem outro provider externo.

## Limitações

- os testes de `pgvector` são determinísticos com mocks; não exigem extensão real instalada;
- a fase não adiciona migration nem índice vetorial real.
