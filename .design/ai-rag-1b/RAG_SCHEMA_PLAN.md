# AI-RAG-1b: Plano de Schema — Contratos e Tipos

**Status:** Planejado (contratos definidos em AI-RAG-1b)
**Data:** 2026-06-06
**Fase:** AI-RAG-1b — Tipagem completa para persistência futura

---

## Hierarquia de Tipos

```
IngestionPipelineInput
    │  IngestionPipelineContract.run()
    ▼
KnowledgeDocument          → KnowledgeDocumentRepositoryContract.create_document()
    │  ChunkingContract.chunk()
    ▼
list[Chunk]                → caller converte para KnowledgeChunk
    │  KnowledgeChunkRepositoryContract.save_chunks()
    ▼
list[KnowledgeChunk]       → EmbeddingProviderContract.embed_texts()
    │  (content de cada chunk)
    ▼
EmbeddingBatch             → VectorStoreContract.upsert_embeddings()
    │  (vetores + chunk_ids)
    ▼
list[EmbeddingVector]      (persistido em ai_knowledge_embeddings)

── Busca ──────────────────────────────────────────────

RetrievalQuery             → EmbeddingProviderContract.embed_query()
    │  (query.query string)
    ▼
list[float]                → VectorStoreContract.similarity_search()
    │  (query_vector)
    ▼
RetrievalResult
    └── list[RetrievedChunk]
             ├── chunk: KnowledgeChunk
             ├── score: float
             └── match_reason: str
```

---

## Contratos Definidos nesta Fase

### `document_repository_contract.py`

| Tipo | Descrição |
|---|---|
| `DocumentFilter` | Filtros para listagem: source_type, status, limit, offset |
| `ChunkFilter` | Filtros para listagem de chunks: document_id, source_type, limit, offset |
| `KnowledgeDocumentRepositoryContract` | ABC para CRUD de KnowledgeDocument |
| `KnowledgeChunkRepositoryContract` | ABC para CRUD de KnowledgeChunk |

**Métodos de KnowledgeDocumentRepositoryContract**:

| Método | Retorno | Observação |
|---|---|---|
| `create_document(document)` | `KnowledgeDocument` | Persiste novo documento |
| `get_document(document_id)` | `KnowledgeDocument \| None` | Lookup por PK |
| `list_documents(filters)` | `list[KnowledgeDocument]` | Paginação, filtro por source_type/status |
| `mark_document_archived(document_id)` | `bool` | Soft-delete; False se não encontrado |
| `find_by_content_hash(content_hash)` | `KnowledgeDocument \| None` | Detecção de duplicata |

**Métodos de KnowledgeChunkRepositoryContract**:

| Método | Retorno | Observação |
|---|---|---|
| `save_chunks(chunks)` | `list[KnowledgeChunk]` | Inserção em lote |
| `get_chunks_by_document(document_id)` | `list[KnowledgeChunk]` | Ordenado por chunk_index |
| `delete_chunks_by_document(document_id)` | `int` | Retorna quantidade deletada |
| `list_chunks(filters)` | `list[KnowledgeChunk]` | Para diagnóstico/auditoria |

---

### `vector_store_contract.py`

| Tipo | Descrição |
|---|---|
| `EmbeddingVector` | chunk_id, document_id, provider, model, dimensions, vector, metadata |
| `VectorSearchOptions` | index_type, distance_metric, ef_search, probes |
| `VectorStoreContract` | ABC para upsert, similarity search, delete, health check |

**Métodos de VectorStoreContract**:

| Método | Retorno | Observação |
|---|---|---|
| `upsert_embeddings(embeddings)` | `int` | Inserção/atualização em lote |
| `similarity_search(query, query_vector, options)` | `RetrievalResult` | Busca vetorial com filtros |
| `delete_embeddings_by_document(document_id)` | `int` | Para re-indexação |
| `health_check()` | `bool` | Verifica pgvector disponível |
| `count_embeddings(document_id)` | `int` | Diagnóstico |

---

### `embedding_contract.py`

| Tipo | Descrição |
|---|---|
| `EmbeddingBatch` | texts, vectors, model, provider, dimensions, total_tokens, warnings |
| `EmbeddingProviderContract` | ABC para geração de embeddings |

**Propriedades e métodos de EmbeddingProviderContract**:

| Membro | Tipo | Descrição |
|---|---|---|
| `provider_name` | `str` (property) | "openai", "anthropic", "local" |
| `model_name` | `str` (property) | "text-embedding-3-small" |
| `dimensions` | `int` (property) | 1536 (text-embedding-3-small) |
| `embed_texts(texts)` | `EmbeddingBatch` | Geração em lote para ingestão |
| `embed_query(text)` | `list[float]` | Geração para busca |
| `health_check()` | `bool` | Verifica provider acessível |

---

### `ingestion_plan.py`

| Tipo | Descrição |
|---|---|
| `IngestionPipelineInput` | title, content, source_type, source_uri, metadata, ingest_by_user_id, force_reingest |
| `IngestionPipelineResult` | ok, document_id, chunks_created, embeddings_created, content_hash, was_duplicate, error, warnings |
| `ReIngestionResult` | ok, document_id, old_embeddings_deleted, new_embeddings_created, error, warnings |
| `IngestionPipelineContract` | ABC para run, re_embed_document, delete_document |

---

## Tipos Existentes (AI-RAG-1, schemas.py)

| Tipo | Campos principais | Uso |
|---|---|---|
| `KnowledgeDocument` | id, title, source_type, content, metadata, created_at | Documento na knowledge base |
| `KnowledgeChunk` | id, document_id, chunk_index, content, metadata, source_title | Trecho de documento |
| `RetrievalQuery` | query, filters, limit, min_score | Input para retriever |
| `RetrievedChunk` | chunk, score, match_reason | Output do retriever (com score) |
| `RetrievalResult` | query, chunks, total, warnings | Resultado completo do retriever |

---

## Compatibilidade entre Fases

| Contrato | AI-RAG-1 | AI-RAG-1b | AI-RAG-2 |
|---|---|---|---|
| `RetrieverContract` | ✅ Definido | ✅ Estável | ✅ PostgresVectorRetriever |
| `KnowledgeDocumentRepositoryContract` | ❌ | ✅ Definido | ✅ PostgresImpl |
| `KnowledgeChunkRepositoryContract` | ❌ | ✅ Definido | ✅ PostgresImpl |
| `VectorStoreContract` | ❌ | ✅ Definido | ✅ PostgresVectorStore |
| `EmbeddingProviderContract` | ❌ | ✅ Definido | ✅ OpenAIEmbeddingProvider |
| `IngestionPipelineContract` | ❌ | ✅ Definido | ✅ DefaultIngestionPipeline |

---

## Invariantes de Design

1. **KnowledgeChunk não carrega embedding** — embeddings vivem em `EmbeddingVector`.
2. **VectorStore não gera embeddings** — recebe `list[float]` do provider.
3. **RetrieverContract é estável** — a busca in-memory e a vetorial têm a mesma interface.
4. **Todos os contratos são assíncronos** — compatível com FastAPI + SQLAlchemy async.
5. **Soft-delete por padrão** — `mark_document_archived` nunca deleta fisicamente.
6. **content_hash obrigatório** — prevenção de duplicatas antes de qualquer persistência.
