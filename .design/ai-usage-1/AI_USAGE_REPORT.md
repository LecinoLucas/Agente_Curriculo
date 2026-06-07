# AI-USAGE-1 — Relatório

## Implementado

- Reaproveitada a tabela existente `ai_usage_logs` como fonte persistida de observabilidade de IA.
- Criado `AIUsageService` para registrar usage e gerar resumo agregado read-only.
- Criado endpoint admin `GET /api/v1/ai/usage/summary?period=today`.
- Adicionada aba `IA` dentro de `AdminPage.tsx`, preservando `/admin/ia` como Laboratório IA.
- Integrado registro inicial de usage em RAG synthesis com `operation=rag_synthesis`.

## Endpoint

`GET /api/v1/ai/usage/summary`

- Autenticação obrigatória.
- ADMIN only.
- Retorna status de flags, totais de tokens, consumo por feature, últimas chamadas e warnings.
- Não retorna API keys, prompts, respostas completas, stack traces, payloads, hashes, vetores ou embeddings.

## Aba IA no AdminPage

A nova aba mostra:

- Status da IA: Gemini configurado, RAG synthesis, embedding Gemini, Assistant read-only, free text e Protheus real.
- Consumo hoje: requests, input tokens, output tokens, total tokens e erros.
- Consumo por feature.
- Últimas chamadas.
- Atalhos para Laboratório IA, Credenciais IA e Health do sistema.
- Warnings operacionais.

## Decisões de privacidade

- A fase não adicionou `metadata_json`; a tabela existente já cobre a observabilidade mínima sem criar novo espaço para metadados sensíveis.
- `operation` é usado como `feature` no resumo.
- RAG synthesis registra provider/model/status/tokens, mas não grava prompt, resposta, chunks ou query.
- Quando usage do provider não está disponível, RAG synthesis registra tokens `0`.

## Testes executados

- `alembic upgrade head`
- `pytest tests/unit/test_ai_usage_service.py -v`
- `pytest tests/unit/test_ai_usage_endpoint.py -v`
- `pytest tests/unit/test_ai_rag_answer_service.py -v`
- `pytest tests/unit/test_ai_assistant_endpoint.py -v`
- `pytest tests/unit/test_job_ai_draft_service.py -v`
- `npx tsc --noEmit`
- `npm run test -- --run AdminPage`
- `npm run test -- --run AiSettingsPage`
- `npm run test -- --run AiAssistantDrawer`
- `npm run build`

## Observações de validação

- `npm run test -- --run AdminPage` também executou testes de `AssistantAdminPage` por correspondência do filtro; todos passaram.
- Houve warnings existentes de teste em `AssistantAdminPage` sobre `act(...)` e atributo `loading`, sem falha.
- Nenhum teste chama Gemini real ou rede externa.
