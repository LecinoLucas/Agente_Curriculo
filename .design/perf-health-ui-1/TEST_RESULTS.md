## Frontend

- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run test -- --run SystemHealthPage`
- `cd frontend && npm run test -- --run AdminPage`
- `cd frontend && npm run build`

## Backend

- `cd backend && source .venv/bin/activate && pytest tests/unit/test_ai_knowledge_tools.py -v`
- `cd backend && source .venv/bin/activate && pytest tests/unit/test_ai_rag_postgres_vector_store.py -v`

## Resultado

- `npx tsc --noEmit`: ok
- `npm run test -- --run SystemHealthPage`: 8 passed
- `npm run test -- --run AdminPage`: 55 passed
- `npm run build`: ok
- `pytest tests/unit/test_ai_knowledge_tools.py -v`: 13 passed
- `pytest tests/unit/test_ai_rag_postgres_vector_store.py -v`: 14 passed

## Warnings

- warnings já existentes de depreciação do Pydantic apareceram nos testes backend;
- `AdminPage` agregou warnings já existentes de `act(...)`, future flags do React Router e atributo `loading` em telas administrativas fora do escopo desta fase;
- não houve chamada real a provider de IA.

## Limitações

- a fase não adiciona métrica agregada nova no backend;
- a aba usa budgets documentados quando não há fonte runtime confiável.
