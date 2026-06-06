# AI-RAG-1b: Plano de Persistência pgvector

**Status:** Planejado (contratos definidos, migração pendente)
**Data:** 2026-06-06
**Fase:** AI-RAG-1b — Contratos para persistência futura Postgres/pgvector

---

## Objetivo

Definir a arquitetura de persistência vetorial que substituirá o `InMemoryRetriever`
em produção, sem implementar nenhum acesso a banco nesta fase.

---

## Extensão pgvector

### Requisitos de Instalação

```sql
-- Requer Postgres 14+ com pgvector instalado
CREATE EXTENSION IF NOT EXISTS vector;
```

**Compatibilidade**: pgvector ≥ 0.5.0 (suporte a HNSW), Postgres ≥ 14.

### Tipos de Índice Suportados

| Índice | Caso de uso | Trade-off |
|---|---|---|
| **HNSW** | Alta velocidade de consulta, baixa latência | Maior uso de memória, build lento |
| **IVFFlat** | Datasets grandes, memória limitada | Build rápido, recall menor |

**Recomendação**: HNSW para a knowledge base de RH (< 1M embeddings esperados).

---

## Tabelas Previstas

### `ai_knowledge_documents`

```sql
CREATE TABLE ai_knowledge_documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    source_type  TEXT NOT NULL,          -- 'rh_policy', 'ats_guide', ...
    content      TEXT NOT NULL,
    content_hash TEXT UNIQUE NOT NULL,   -- SHA-256 para detecção de duplicatas
    status       TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at  TIMESTAMPTZ
);

CREATE INDEX idx_ai_knowledge_documents_source_type ON ai_knowledge_documents (source_type);
CREATE INDEX idx_ai_knowledge_documents_status ON ai_knowledge_documents (status);
CREATE INDEX idx_ai_knowledge_documents_content_hash ON ai_knowledge_documents (content_hash);
```

### `ai_knowledge_chunks`

```sql
CREATE TABLE ai_knowledge_chunks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    source_title TEXT,
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (document_id, chunk_index)
);

CREATE INDEX idx_ai_knowledge_chunks_document_id ON ai_knowledge_chunks (document_id);
```

### `ai_knowledge_embeddings`

```sql
CREATE TABLE ai_knowledge_embeddings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id     UUID NOT NULL REFERENCES ai_knowledge_chunks(id) ON DELETE CASCADE,
    document_id  UUID NOT NULL,                    -- desnormalizado para deleção eficiente
    provider     TEXT NOT NULL,                    -- 'openai', 'anthropic', 'local'
    model        TEXT NOT NULL,                    -- 'text-embedding-3-small'
    dimensions   INTEGER NOT NULL,
    embedding    vector(1536),                     -- dimensão configurável por modelo
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (chunk_id, model)                       -- um embedding por (chunk, modelo)
);

-- Índice HNSW para similarity search
CREATE INDEX idx_ai_knowledge_embeddings_hnsw
    ON ai_knowledge_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_ai_knowledge_embeddings_document_id
    ON ai_knowledge_embeddings (document_id);
```

### `ai_rag_query_log`

```sql
CREATE TABLE ai_rag_query_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query           TEXT NOT NULL,
    source_type     TEXT,
    limit_requested INTEGER NOT NULL,
    min_score       FLOAT NOT NULL,
    results_count   INTEGER NOT NULL,
    top_score       FLOAT,
    latency_ms      INTEGER,
    model           TEXT,
    user_id         TEXT,
    session_id      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_rag_query_log_created_at ON ai_rag_query_log (created_at DESC);
CREATE INDEX idx_ai_rag_query_log_user_id ON ai_rag_query_log (user_id);
```

---

## Estratégia de Índice HNSW

### Parâmetros Recomendados

| Parâmetro | Valor | Descrição |
|---|---|---|
| `m` | 16 | Conexões por nó — maior = mais recall, mais memória |
| `ef_construction` | 64 | Qualidade do build — maior = melhor recall, build mais lento |
| `ef_search` | 64 | Precisão na busca — pode ser ajustado por query |
| Métrica | `vector_cosine_ops` | Distância cosseno — padrão para text embeddings |

### Estimativa de Memória

Para 50.000 chunks × 1536 dimensões × 4 bytes = ~300 MB de dados brutos.
Com HNSW m=16: ~1.2 GB de índice em RAM.

Recomendação: `work_mem = 256MB` para queries de similarity search.

---

## Estratégia de Migração

A migração será gerenciada por Alembic em fase futura (AI-RAG-2):

```
migrations/
└── versions/
    └── XXXX_create_ai_rag_tables.py
```

**Ordem de criação**:
1. `ai_knowledge_documents`
2. `ai_knowledge_chunks` (FK → documents)
3. `ai_knowledge_embeddings` (FK → chunks, índice HNSW)
4. `ai_rag_query_log`

**Rollback**: DROP TABLE em ordem reversa (embeddings → chunks → documents → log).

---

## Configuração de Sessão para pgvector

```python
# Na sessão SQLAlchemy, antes de similarity search:
await session.execute(text("SET hnsw.ef_search = 64"))
await session.execute(text(f"SET ivfflat.probes = {probes}"))
```

---

## Implementação Futura: PostgresVectorStore

```python
class PostgresVectorStore(VectorStoreContract):
    def __init__(self, session: AsyncSession, model: str = "text-embedding-3-small") -> None:
        self._session = session
        self._model = model

    async def similarity_search(
        self, query: RetrievalQuery, query_vector: list[float], ...
    ) -> RetrievalResult:
        # 1. SET hnsw.ef_search = options.ef_search
        # 2. SELECT chunks + distance via <=> operator
        # 3. WHERE source_type = ? (se filter presente)
        # 4. ORDER BY embedding <=> :query_vector
        # 5. LIMIT query.limit
        # 6. Montar RetrievalResult com RetrievedChunk
        ...
```

**Query SQL prevista**:
```sql
SELECT
    c.id, c.document_id, c.chunk_index, c.content, c.source_title, c.metadata,
    1 - (e.embedding <=> :query_vector) AS score
FROM ai_knowledge_embeddings e
JOIN ai_knowledge_chunks c ON c.id = e.chunk_id
WHERE e.model = :model
  AND (c.metadata->>'source_type' = :source_type OR :source_type IS NULL)
ORDER BY e.embedding <=> :query_vector
LIMIT :limit;
```

---

## O Que NÃO é Implementado nesta Fase

| Item | Fase |
|---|---|
| Migration Alembic real | AI-RAG-2 |
| PostgresVectorStore | AI-RAG-2 |
| OpenAIEmbeddingProvider | AI-RAG-2 |
| Endpoint de ingestão | AI-RAG-2 |
| Hybrid search (BM25 + vector) | AI-RAG-3 |
| Re-ranking | AI-RAG-3 |
