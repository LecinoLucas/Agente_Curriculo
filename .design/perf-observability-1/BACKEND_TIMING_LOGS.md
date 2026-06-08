## Logs existentes úteis

- `pipeline.board.query_timing`
  - campos atuais: `job_id`, `rows`, `truncated`, `duration_ms`
- `pipeline.ranking.query_timing`
  - campos atuais: `job_id`, `rows`, `duration_ms`
- `candidate_summaries.query_timing`
  - campos atuais: `rows`, `limit`, `duration_ms`

## Logs adicionados nesta fase

- `rag.retrieval.timing`
  - arquivo: [postgres_vector_retriever.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/ai_orchestration/rag/postgres_vector_retriever.py:89)
  - campos: `event`, `duration_ms`, `limit`, `rows`, `storage_mode`, `warning_code`
- `rag.retrieval.error`
  - campos: `event`, `duration_ms`, `limit`, `error_type`
- `knowledge.search.timing`
  - arquivo: [knowledge_tools.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/ai_orchestration/tools/knowledge_tools.py:76)
  - campos: `event`, `duration_ms`, `limit`, `rows`, `warning_code`
- `knowledge.answer.timing`
  - campos: `event`, `duration_ms`, `limit`, `rows`, `source_count`, `warning_code`

## Thresholds manuais sugeridos

- `pipeline.board.query_timing.duration_ms > 1000`
  - investigar query do board, truncamento e filtros
- `pipeline.ranking.query_timing.duration_ms > 1000`
  - investigar ranking sob demanda e massa da vaga
- `rag.retrieval.timing.duration_ms > 500`
  - verificar `storage_mode`
- `rag.retrieval.timing.storage_mode=json_fallback`
  - tolerável em dev; em produção deve ser exceção
- `warning_code` contendo `rag_vector_search_json_fallback_limited`
  - investigar ausência de `pgvector`, reindexação e crescimento da base

## Dados proibidos em log

Não logar:

- query textual completa de conhecimento;
- prompt bruto;
- resposta bruta do provider;
- CPF, telefone, e-mail;
- `embedding`, `vector_json`, `content_hash`;
- API keys e secrets.

## Comandos de busca

```bash
rg "pipeline\\.board\\.query_timing|pipeline\\.ranking\\.query_timing|candidate_summaries\\.query_timing|rag\\.retrieval\\.timing|knowledge\\.(search|answer)\\.timing" backend/src -n
```
