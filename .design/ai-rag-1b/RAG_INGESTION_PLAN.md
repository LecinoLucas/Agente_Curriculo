# AI-RAG-1b: Plano de Ingestão RAG

**Status:** Planejado (contrato definido, implementação pendente AI-RAG-2)
**Data:** 2026-06-06
**Fase:** AI-RAG-1b — Design do pipeline de ingestão

---

## Visão Geral do Pipeline

O pipeline de ingestão transforma um documento textual em embeddings pesquisáveis
na knowledge base, coordenando 4 componentes desacoplados:

```
IngestionPipelineInput
    │
    ├─[1] Validação e deduplicação
    │         └── SHA-256(content) → KnowledgeDocumentRepositoryContract.find_by_content_hash()
    │
    ├─[2] Persistência do documento
    │         └── KnowledgeDocumentRepositoryContract.create_document()
    │
    ├─[3] Chunking
    │         └── ChunkingContract.chunk(content)  →  list[Chunk]
    │             (caller converte Chunk → KnowledgeChunk com document_id)
    │
    ├─[4] Persistência dos chunks
    │         └── KnowledgeChunkRepositoryContract.save_chunks(list[KnowledgeChunk])
    │
    ├─[5] Geração de embeddings
    │         └── EmbeddingProviderContract.embed_texts([c.content for c in chunks])
    │             →  EmbeddingBatch
    │             (caller mapeia batch.vectors[i] → EmbeddingVector(chunk_id=chunks[i].id))
    │
    ├─[6] Persistência dos embeddings
    │         └── VectorStoreContract.upsert_embeddings(list[EmbeddingVector])
    │
    └─[7] Retorno
              └── IngestionPipelineResult(ok, document_id, chunks_created, embeddings_created)
```

---

## Deduplicação por Content Hash

Antes de iniciar a ingestão, o pipeline calcula `SHA-256(content)` e verifica
se já existe um documento ativo com esse hash.

```python
content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
existing = await doc_repo.find_by_content_hash(content_hash)

if existing and not pipeline_input.force_reingest:
    return IngestionPipelineResult(
        ok=True,
        document_id=existing.id,
        was_duplicate=True,
        chunks_created=0,
        embeddings_created=0,
        content_hash=content_hash,
    )
```

**Comportamento quando `force_reingest=True`**:
1. Deletar embeddings do documento existente.
2. Deletar chunks do documento existente.
3. Arquivar documento existente.
4. Criar novo documento com novo ID.
5. Executar pipeline completo.

---

## Re-Indexação por Mudança de Modelo

Quando o modelo de embeddings muda (ex: migrar de `text-embedding-3-small` para
`text-embedding-3-large`), é necessário re-gerar todos os embeddings sem re-chunkar.

`IngestionPipelineContract.re_embed_document(document_id)`:

```
1. Buscar chunks existentes via KnowledgeChunkRepositoryContract.get_chunks_by_document()
2. Deletar embeddings antigos via VectorStoreContract.delete_embeddings_by_document()
3. Gerar novos embeddings via EmbeddingProviderContract.embed_texts()
4. Persistir novos embeddings via VectorStoreContract.upsert_embeddings()
5. Retornar ReIngestionResult
```

---

## Remoção de Documento

`IngestionPipelineContract.delete_document(document_id)`:

```
1. VectorStoreContract.delete_embeddings_by_document(document_id)
   — Remove vetores do índice pgvector

2. KnowledgeChunkRepositoryContract.delete_chunks_by_document(document_id)
   — Remove chunks da tabela (texto)

3. KnowledgeDocumentRepositoryContract.mark_document_archived(document_id)
   — Soft-delete: status='archived', archived_at=now()
```

**Por que soft-delete?**
- Permite auditoria: saber que o documento existiu.
- Permite restauração sem re-ingestão.
- O conteúdo fica inacessível para busca (embeddings e chunks deletados).

---

## Gestão de Lotes de Embeddings

O `EmbeddingProviderContract.embed_texts` aceita no máximo 2048 textos por chamada
(limite de `text-embedding-3-small`). Para documentos com muitos chunks:

```python
BATCH_SIZE = 512

for batch_start in range(0, len(chunks), BATCH_SIZE):
    batch_chunks = chunks[batch_start : batch_start + BATCH_SIZE]
    texts = [c.content for c in batch_chunks]
    embedding_batch = await provider.embed_texts(texts)
    vectors = [
        EmbeddingVector(
            chunk_id=batch_chunks[i].id,
            document_id=document_id,
            provider=provider.provider_name,
            model=provider.model_name,
            dimensions=provider.dimensions,
            vector=embedding_batch.vectors[i],
        )
        for i in range(len(batch_chunks))
    ]
    await vector_store.upsert_embeddings(vectors)
```

---

## Fontes de Conhecimento Planejadas

| source_type | Origem | Quem ingere | Frequência |
|---|---|---|---|
| `rh_policy` | Documentos Word/PDF de RH | Admin RH | Sob demanda |
| `ats_guide` | Manuais do ATS | Admin | Sob demanda |
| `hiring_rules` | Planilha de critérios por cargo | Gestão | Trimestral |
| `pre_admission` | Checklist de documentos | Admin | Sob demanda |
| `protheus_docs` | Documentação do ERP | Admin | Sob demanda |
| `internal_faq` | FAQ de recrutadores | Recrutadores | Contínua |

---

## Tratamento de Erros

| Etapa | Erro | Ação |
|---|---|---|
| Validação | title/content vazio | Retornar `ok=False, error="invalid_input"` |
| Embedding | Rate limit / API error | Retornar `ok=False, error="embedding_error"`, warnings |
| Chunking | Texto > MAX_CHARS sem quebra | Avisar em warnings, continuar com force-split |
| DB | Constraint violation | Retornar `ok=False, error="db_error"` |
| Duplicata | content_hash existente | Retornar `ok=True, was_duplicate=True` (não é erro) |

---

## Interface de Ingestão (AI-RAG-2)

Endpoint futuro (fora do escopo desta fase):

```
POST /api/v1/ai/knowledge/ingest
Authorization: Bearer <token>  (role: ADMIN)
Body: {
    "title": "Política de Férias 2024",
    "content": "...",
    "source_type": "rh_policy",
    "source_uri": "gdrive://..."
}
Response: IngestionPipelineResult
```

---

## O Que NÃO é Implementado nesta Fase

| Item | Fase |
|---|---|
| `DefaultIngestionPipeline` (implementação real) | AI-RAG-2 |
| Endpoint `/ai/knowledge/ingest` | AI-RAG-2 |
| Upload de arquivos PDF/Word | AI-RAG-4 |
| Re-indexação em lote de toda a knowledge base | AI-RAG-3 |
| Webhook de atualização automática | AI-RAG-4 |
