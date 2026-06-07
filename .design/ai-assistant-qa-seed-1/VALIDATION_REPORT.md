# AI Assistant QA Seed 1 Validation

## Resultado do seed

- `alembic upgrade head` executado com sucesso no backend local
- `.venv/bin/python scripts/seed_pre_admission_qa.py --reset` executado com sucesso
- IDs gerados:
- `candidate_id`: `209c30ff-da69-4b8f-9b0b-61dba89e9d20`
- `job_id`: `5783eba9-13b3-44a1-97b3-8c3d90132826`
- `case_id`: `e3fa2a43-7659-4aa6-baeb-3791e8e3cedd`
- `package_id`: `b90d090d-d651-4e69-87dc-57e632aab290`
- Protheus real permaneceu desligado: `PROTHEUS_REAL_SEND_ENABLED=false` e `ERP_ALLOW_REAL_SEND=false`

## Testes backend executados

- `pytest tests/unit/test_seed_pre_admission_qa.py -v` passed
- `pytest tests/unit/test_ai_assistant_admission_qa.py -v` passed
- `pytest tests/unit/test_ai_admission_tools.py -v` passed
- `pytest tests/unit/test_ai_assistant_endpoint.py -v` passed
- `pytest tests/unit/test_ai_tool_runtime.py -v -o addopts='' -p no:cov` passed
- `pytest tests/unit/test_ai_knowledge_tools.py -v -o addopts='' -p no:cov` passed

## Testes frontend executados

- `npx tsc --noEmit` passed
- `npm run test -- --run AiAssistantDrawer` passed
- `npm run test -- --run AdminPage` passed
- `npm run build` passed

## Endpoint validation

- A validação de endpoint read-only foi coberta por testes automatizados em `test_ai_assistant_admission_qa.py`
- `admission.case_summary`: sem CPF e sem telefone
- `admission.documents_status`: sem `review_notes`, sem OCR bruto e sem texto cru
- `admission.events_summary`: sem `payload_json`
- `protheus.export_status`: sem `payload_json`
- O pacote sintético é apenas de leitura e não executa exportação real

## QA visual e manual

- O caso seedado já permite abrir `/admission/cases/e3fa2a43-7659-4aa6-baeb-3791e8e3cedd`
- A rota e os testes do drawer permaneceram estáveis
- A validação manual completa do fluxo visual continua pendente de execução exploratória humana
- Não foi necessário habilitar Chromium/Playwright adicional nesta fase

## Riscos restantes

- A resposta composta admissional está pronta para validação manual com a massa seedada, mas não foi exercitada por E2E novo nesta fase
- Os testes de `AdminPage` ainda exibem warnings preexistentes de `act(...)` e atributo `loading`; não bloquearam a regressão desta entrega
- `pytest-cov` continuou sensível a artefatos locais, então o runtime foi validado com `-o addopts='' -p no:cov` como mitigação local, não como falha da feature
