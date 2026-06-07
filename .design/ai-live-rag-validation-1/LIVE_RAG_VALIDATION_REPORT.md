# LIVE RAG Validation Report

## Ambiente validado

- Projeto: `Agente_Curriculo`
- Data: `2026-06-07`
- Ambiente local com backend FastAPI, PostgreSQL local e frontend Vite
- `backend/.env` carregando sem erro
- Nenhum secret exposto neste relatório

## Flags e configuração usadas

- `RAG_EMBEDDING_PROVIDER=gemini`
- `RAG_GEMINI_EMBEDDING_ENABLED=true`
- `RAG_GEMINI_EMBEDDING_MODEL=gemini-embedding-001`
- `RAG_GEMINI_EMBEDDING_DIMENSIONS=3072`
- `RAG_SYNTHESIS_ENABLED=true`
- `RAG_SYNTHESIS_PROVIDER=gemini`
- `RAG_GEMINI_SYNTHESIS_MODEL=gemini-2.5-flash`
- `AI_ASSISTANT_ENABLED=true`
- `AI_ASSISTANT_READ_ONLY=true`
- `AI_ASSISTANT_FREE_TEXT_ENABLED=false`
- `PROTHEUS_REAL_SEND_ENABLED=false`
- `ERP_ALLOW_REAL_SEND=false`
- Chave Gemini configurada: `true`

## Alembic e schema

- `alembic current`: `20260607_ai_knowledge_admin_fields (head)`
- `alembic heads`: `20260607_ai_knowledge_admin_fields (head)`
- `alembic upgrade head`: concluído

### Evidência de schema

- `ai_knowledge_documents` contém `domain`, `visibility`, `allowed_roles_json`, `sensitivity_level`, `tags_json`, `reviewed_by`, `reviewed_at`, `indexing_status`, `last_indexed_at`, `last_index_error`
- `ai_knowledge_embeddings` existe e contém `provider`, `model`, `dimensions`, `vector_json`, `content_hash`

## Fonte oficial Gemini validada

- Endpoint consultado: `https://generativelanguage.googleapis.com/v1beta/models`
- Modelo validado: `models/gemini-embedding-001`
- Método suportado confirmado: `embedContent`

## Seed real da base

Comando:

```bash
python scripts/seed_knowledge_base.py --force
```

Resultado:

- `Criados: 0`
- `Duplicados: 0`
- `Re-ingeridos: 6`
- `Falhas: 0`

Não houve:

- `embedding_provider_error`
- erro de schema
- `RuntimeError` de embeddings Gemini

## Contagem de documentos, chunks e embeddings

- Documentos: `6`
- Chunks: `6`
- Embeddings:
  - `gemini | gemini-embedding-001 | 6`

## Perguntas testadas

### knowledge.search

Pergunta:

- `Quando posso exportar uma admissão para o Protheus?`

Resultado:

- `ok: true`
- `intent: knowledge.search`
- `tool_name: search_knowledge`
- `total: 3`

Fontes retornadas:

- `Regras fictícias de pré-admissão`
- `Regras de Exportação Protheus (Fictício)`
- `Regras de Pipeline de Recrutamento`

### knowledge.answer

Perguntas tentadas:

- `O assistente pode executar ações automaticamente?`
- `Quais critérios não podem ser usados em uma vaga?`

Resultado observado:

- recuperação de contexto ocorreu
- síntese Gemini falhou por indisponibilidade do provider
- resposta da API retornou falha controlada

Resposta observada:

- `ok: false`
- `intent: knowledge.answer`
- `tool_name: answer_knowledge`
- `message: Falha ao sintetizar resposta: RuntimeError`

## Evidência em ai_usage_logs

Estrutura confirmada:

- `provider`
- `model`
- `operation`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `status`
- `error_message`

Não existe coluna `metadata_json` em `ai_usage_logs` neste ambiente.

Registros recentes de RAG:

- `rag_synthesis | gemini | gemini-2.5-flash | error | RuntimeError`
- quatro registros consecutivos gerados durante a validação live

Observação:

- houve evidência real de chamadas `rag_synthesis` para Gemini
- não houve evidência de tokens `> 0` para `rag_synthesis` nesta validação porque o provider retornou erro antes de disponibilizar uso concluído

## Segurança e exposição de dados

Confirmado durante a validação:

- nenhuma API key exibida
- `knowledge.search` não expôs `content_hash`
- `knowledge.search` não expôs `vector_json`
- `knowledge.search` não expôs embeddings
- não houve stack trace na resposta da API ao cliente
- Protheus real permaneceu desligado
- free text geral permaneceu desligado

## Frontend e regressão

Validações executadas:

- `npx tsc --noEmit`
- `npm run test -- --run AdminPage`
- `npm run test -- --run AiSettingsPage`
- `npm run test -- --run AiAssistantDrawer`
- `npm run build`

Resultado:

- todas as validações acima passaram

Observações:

- o servidor Vite subiu localmente
- a validação visual interativa completa no browser não foi concluída por limitação do ambiente de automação local
- a cobertura funcional da UI ficou suportada por testes do frontend e pela confirmação de que o app serviu corretamente em `http://127.0.0.1:5173/`

## Testes backend executados

- `pytest tests/unit/test_seed_knowledge_base.py -v`: passou
- `pytest tests/unit/test_ai_knowledge_tools.py -v`: passou após limpeza de artefato local `.coverage`
- `pytest tests/unit/test_ai_rag_answer_service.py -v`: passou
- `pytest tests/unit/test_ai_usage_endpoint.py -v`: passou
- `pytest tests/unit/test_ai_rag_gemini_synthesis_provider.py -v`: passou

## Bugs encontrados

### Corrigidos localmente

- coluna `alembic_version.version_num` com tamanho insuficiente para revision id novo
- `RAG_GEMINI_EMBEDDING_DIMENSIONS` local incompatível com retorno real do Gemini (`768` vs `3072`)
- artefato local `.coverage` corrompido impedindo saída limpa de um teste unitário

### Não corrigidos nesta fase

- indisponibilidade transitória do Gemini synthesis durante `knowledge.answer` live, retornando erro `503` no provider e `RuntimeError` controlado na aplicação

## Riscos restantes

- a validação ponta a ponta de `knowledge.answer` com resposta sintetizada e fontes não fechou por dependência de disponibilidade do Gemini
- enquanto o provider estiver instável, `ai_usage_logs` pode registrar apenas tentativas com `status=error` e sem tokens consolidados para `rag_synthesis`
- a UI foi validada por testes e build, mas não por navegação interativa completa automatizada neste ambiente
