# AI-LAB-1 — Relatório do Laboratório IA

## Objetivo
Criar uma tela interna para administradores visualizarem o status das features de IA e executarem testes controlados de RAG/Assistant sem expor secrets e sem executar ações de escrita.

## Entrega
- Endpoint read-only `GET /api/v1/ai/status`.
- Página interna `/admin/ia` com título `Laboratório IA`.
- Cards de status para Gemini, RAG, Assistente, Protheus e warnings.
- Testes rápidos pré-definidos para:
  - `knowledge.search` sobre exportação Protheus.
  - `knowledge.answer` sobre exportação Protheus.
  - `knowledge.answer` sobre critérios antidiscriminatórios.
- Service frontend `aiSettingsService`.
- Testes unitários backend e frontend.

## Segurança
- A página é protegida por rota admin-only no frontend.
- O endpoint usa `AdminOnly` no backend.
- O endpoint não retorna API key, secrets ou prompt bruto.
- O frontend não usa `dangerouslySetInnerHTML`.
- Os resultados dos testes são filtrados antes da renderização para remover:
  - `vector_json`
  - `content_hash`
  - `embedding`
  - `embeddings`
  - `payload_json`
  - `review_notes`
  - `internal_notes`
  - `stack`
  - `stack_trace`
  - `api_key`
- Protheus real aparece como desligado quando `PROTHEUS_REAL_SEND_ENABLED=false` e `ERP_ALLOW_REAL_SEND=false`.

## Endpoint de status
`GET /api/v1/ai/status`

Campos principais:
- `assistant.enabled`
- `assistant.read_only`
- `assistant.free_text_enabled`
- `rag.embedding_provider`
- `rag.gemini_embedding_enabled`
- `rag.synthesis_enabled`
- `rag.synthesis_model`
- `rag.vector_storage_mode`
- `rag.pgvector_available`
- `providers.gemini_api_key_configured`
- `protheus.real_send_enabled`
- `protheus.erp_allow_real_send`

`providers.gemini_api_key_configured` é booleano e nunca contém a chave.

## Resultado esperado em ambiente local
- Com Gemini desligado ou sem chave, a tela mostra aviso amigável e os testes RAG continuam usando fallback controlado quando disponível.
- Com `RAG_SYNTHESIS_ENABLED=false`, `knowledge.answer` deve degradar de forma controlada.
- Com `RAG_SYNTHESIS_ENABLED=true` e chave local configurada, `knowledge.answer` deve retornar resposta sintetizada com fontes.

## Restrições preservadas
- Nenhum chat livre público foi criado.
- Nenhuma ação de escrita foi adicionada.
- Nenhum fluxo de Protheus real foi ativado.
- Portal do candidato não foi alterado.
- Nenhuma secret é enviada ao frontend.

## Riscos restantes
- A ativação real do Gemini depende de `.env` local e pode consumir quota/custo.
- Se `pgvector` não estiver disponível, o status indica `json_fallback`.
- A suíte backend pode apresentar instabilidade de teardown do `pytest-cov` já observada em fases anteriores, mesmo com os testes passando logicamente.
