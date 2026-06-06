# AI-RAG-6: PostgresVectorRetriever

## Objetivo

Implementar o primeiro retriever vetorial real usando `PostgresVectorStore` e
embeddings fake (determinísticos), provando o caminho completo de busca vetorial
sem provider externo e sem conectar ao AssistantRouter.

---

## Arquivos alterados / criados

| Arquivo | Ação |
|---|---|
| `backend/src/ai_orchestration/rag/postgres_vector_retriever.py` | Criado |
| `backend/src/infrastructure/repositories/postgres_vector_store.py` | Atualizado — similarity_search real |
| `backend/tests/unit/test_ai_rag_postgres_vector_retriever.py` | Criado |
| `backend/tests/unit/test_ai_rag_postgres_vector_store.py` | Atualizado — novos testes AI-RAG-6 |
| `.design/ai-rag-6/POSTGRES_VECTOR_RETRIEVER.md` | Este arquivo |

---

## Decisão de implementação: Bridge (Opção A)

### Situação atual

A tabela `ai_knowledge_embeddings` armazena vetores em `vector_json` (coluna JSONB),
pois nenhuma migração ainda adicionou uma coluna `vector(N)` nativa do pgvector.

### Opções consideradas

**Opção A — Bridge Python-side**: carregar embeddings via JSON e computar cosine
similarity em Python quando pgvector estiver disponível.

**Opção B — Defer pgvector SQL real**: nenhuma busca real; aguardar migração com
coluna `vector(N)` para então usar o operador `<=>`.

### Escolha: Opção A (bridge)

**Por quê A é mais segura aqui:**
- Prova o caminho completo de retrieval com dados reais sem schema changes.
- Testes determinísticos com `FakeEmbeddingProvider` (sem rede, sem chave).
- Sem risco de migration indesejada nesta fase.
- Comportamento documentado e explícito — não há "magia oculta".

**Limitação conhecida (não é bug):**
- O scan Python-side é O(n) — não escalável para bases grandes em produção.
- Para bases pequenas (centenas de chunks) é adequado para esta fase.

**SQL real previsto para AI-RAG-7+:**
```sql
-- Quando a migração adicionar a coluna vector(N):
SELECT
    c.id, c.chunk_index, c.content, c.metadata_json, c.source_title,
    c.document_id, d.title, d.source_type,
    1 - (e.embedding <=> $1) AS score
FROM ai_knowledge_embeddings e
JOIN ai_knowledge_chunks c ON c.id = e.chunk_id
JOIN ai_knowledge_documents d ON d.id = c.document_id
WHERE d.archived_at IS NULL
  AND ($2::text IS NULL OR d.source_type = $2)
ORDER BY e.embedding <=> $1
LIMIT $3;
```

---

## Arquitetura

```
PostgresVectorRetriever
  ├── EmbeddingProviderContract  →  gera query vector
  ├── VectorStoreContract        →  executa similarity_search
  └── KnowledgeDocumentRepositoryContract  →  get_document()

PostgresVectorStore.similarity_search()
  ├── is_pgvector_available()  →  verifica extensão
  ├── JOIN: embeddings → chunks → documents
  ├── _cosine_similarity() em Python  (bridge AI-RAG-6)
  └── retorna RetrievedChunk[] ordenado por score DESC
```

---

## Contratos implementados

### PostgresVectorRetriever

Implementa `RetrieverContract`. Recebe:
- `VectorStoreContract` — para similarity_search
- `EmbeddingProviderContract` — para embed_query
- `KnowledgeDocumentRepositoryContract` — para get_document

Fluxo `retrieve(query)`:
1. Query vazia → `RetrievalResult(warnings=["empty_query"])` imediato.
2. `embed_query(query.query)` → falha → `warnings=["embedding_provider_error: ..."]`.
3. `similarity_search(query, vector)` → falha → `warnings=["vector_store_error: ..."]`.
4. Propaga `RetrievalResult` do vector store sem modificar warnings.

### PostgresVectorStore.similarity_search (atualizado)

- **pgvector indisponível** → `chunks=[], warnings=[build_pgvector_unavailable_warning()]`
- **pgvector disponível** → executa JOIN + cosine em Python → `chunks` ordenados por score.
- Filtros aceitos (whitelist): apenas `source_type`. Chaves desconhecidas são ignoradas.
- Documentos `archived_at IS NOT NULL` são excluídos.
- Embedding bruto (`vector_json`) nunca aparece em `RetrievedChunk`.
- Score clamped: `max(0.0, cosine_similarity)` — similaridade negativa equivale a 0.

---

## Segurança

| Regra | Implementação |
|---|---|
| Não retornar embedding bruto | `RetrievedChunk` não tem campo `vector`/`embedding` |
| Filtros por whitelist | Apenas `source_type` é aplicado; outros são ignorados |
| Não buscar docs arquivados | WHERE `archived_at IS NULL` no JOIN |
| Não misturar dados operacionais | Query restrita às tabelas RAG (`ai_knowledge_*`) |
| Não gerar resposta com LLM | Apenas recupera chunks — zero chamadas a modelos |
| Não chamar provider externo | `FakeEmbeddingProvider` em testes; sem chave/env |

---

## Estado atual após AI-RAG-6

| Capacidade | Status |
|---|---|
| Salvar documentos | ✅ |
| Salvar chunks | ✅ |
| Ingerir textos | ✅ |
| Gerar embeddings fake | ✅ |
| Persistir embeddings | ✅ |
| Detectar pgvector | ✅ |
| Busca vetorial (bridge JSON) | ✅ AI-RAG-6 |
| Busca vetorial nativa pgvector | ⏳ AI-RAG-7+ (requer migração `vector(N)`) |
| Conectar ao AssistantRouter | ⏳ Fase futura |

---

## Riscos restantes

1. **Performance**: O scan Python-side não escala além de alguns milhares de embeddings.
   Mitigação: adicionar coluna `vector(N)` + migração na AI-RAG-7.

2. **Dimensão inconsistente**: Se embeddings foram gerados com dimensões diferentes
   da query, a row é silenciosamente ignorada. Deveria existir validação na ingestão.

3. **Sem índice vetorial**: Mesmo com a futura coluna `vector(N)`, será necessário
   criar índice HNSW ou IVFFlat para performance em produção.

4. **Fallback sem distância real**: Quando pgvector está ausente, a busca retorna
   vazio. Não há fallback de keyword-search — isso é intencional (sem dados misturados).
