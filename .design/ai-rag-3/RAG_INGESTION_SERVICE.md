# AI-RAG-3 — Knowledge Ingestion Service

## Objetivo

Transformar o pipeline RAG de "tabelas + repositories" em um serviço interno de ingestão textual.
Esta fase implementa as etapas 1–6 do pipeline sem LLM, sem embeddings e sem endpoint público.

## Arquivos criados

| Arquivo | Papel |
|---|---|
| `backend/src/ai_orchestration/rag/hash_utils.py` | SHA-256 de conteúdo textual |
| `backend/src/ai_orchestration/rag/ingestion_service.py` | `TextIngestionService` — coordenador do pipeline |
| `backend/tests/unit/test_ai_rag_ingestion_service.py` | 15+ testes unitários |

## Pipeline implementado

```
IngestionPipelineInput
       │
       ▼
  [1] Validar conteúdo (não vazio / não whitespace)
       │
       ▼
  [2] compute_content_hash (SHA-256 UTF-8)
       │
       ▼
  [3] find_by_content_hash → já existe?
       ├─ SIM → IngestionPipelineResult(was_duplicate=True)
       └─ NÃO ↓
       ▼
  [4] KnowledgeDocument criado via doc_repo.create_document()
       │
       ▼
  [5] TextChunker.chunk(content, metadata)
       │
       ▼
  [6] KnowledgeChunk[] → chunk_repo.save_chunks()
       │
       ▼
  IngestionPipelineResult(ok=True, chunks_created=N)
```

Etapas 7–8 (embeddings + vector store) serão implementadas em AI-RAG-4.

## Classe: TextIngestionService

```python
class TextIngestionService:
    def __init__(
        self,
        doc_repo: KnowledgeDocumentRepositoryContract,
        chunk_repo: KnowledgeChunkRepositoryContract,
        chunker: ChunkingContract | None = None,
    ) -> None: ...

    async def ingest(self, pipeline_input: IngestionPipelineInput) -> IngestionPipelineResult: ...
    async def reingest_by_document_id(self, document_id: str) -> IngestionPipelineResult: ...
```

### Regras de negócio

- Conteúdo vazio ou só whitespace → `ok=False, error="empty_content"`
- `content_hash` duplicado → `ok=True, was_duplicate=True` (sem criar novo documento)
- `force_reingest=True` → bypassa verificação de duplicata
- Erro de repositório → capturado, `ok=False, error="repository_error: ..."`
- Reingestão: deleta chunks antigos → re-chunka → salva novos → preserva documento
- Reingestão de documento inexistente → `ok=False, error="document_not_found"`

## Decisões de design

### 1. Não implementa IngestionPipelineContract

`IngestionPipelineContract` requer `re_embed_document` (etapa de embeddings) e `delete_document`
com VectorStore. Forçar implementação da ABC geraria métodos vazios ou raises que enganam
a assinatura do contrato. Optou-se por classe standalone com método `reingest_by_document_id`
mais alinhado à semântica desta fase.

### 2. hash_utils.py extraído como módulo separado

O repositório SQLAlchemy já calculava SHA-256 internamente com `_compute_hash`. Extrair para
`hash_utils.compute_content_hash` permite que service e repositório usem a mesma função sem
acoplamento circular. Determinismo garantido: SHA-256 é função pura.

### 3. Erro de repositório → resultado controlado

Exceções durante `find_by_content_hash`, `create_document` e `save_chunks` são capturadas e
convertidas para `IngestionPipelineResult(ok=False, error="repository_error: ...")`. Isso evita
stack traces não tratados no chamador e permite logging estruturado em fases futuras.

### 4. chunk.metadata inclui token_count

O `Chunk` do `TextChunker` já calcula `token_count` (estimativa `len(content) // 4`).
Esse campo é copiado para `KnowledgeChunk.metadata["token_count"]` para que fases futuras
de embedding possam usar a estimativa sem re-calcular.

### 5. Testes com fake repositories (sem DB)

Testes unitários usam `FakeDocumentRepository` e `FakeChunkRepository` in-memory.
Repositórios Postgres já são testados em `test_ai_rag_postgres_repositories.py`.
Separação clara: contrato vs. implementação.

## Contratos utilizados

- `KnowledgeDocumentRepositoryContract` — `find_by_content_hash`, `create_document`, `get_document`
- `KnowledgeChunkRepositoryContract` — `save_chunks`, `delete_chunks_by_document`
- `ChunkingContract` / `TextChunker` — `chunk(text, metadata)`
- `IngestionPipelineInput` / `IngestionPipelineResult` — tipos de entrada/saída

## Restrições respeitadas

- Nenhum LLM chamado
- Nenhum embedding criado
- Nenhum provider externo
- Nenhum endpoint novo
- Nenhuma migration criada
- Nenhuma UI alterada
- AssistantRouter inalterado

## Riscos restantes

| Risco | Mitigação |
|---|---|
| RAG ainda não conectado ao AssistantRouter | Previsto para fase futura (AI-RAG-5+) |
| Embeddings ausentes — busca vetorial não funciona | AI-RAG-4 |
| `force_reingest=True` cria documento duplicado no DB | Esperado nesta fase; deduplicação real virá com embedding upsert |
| `reingest_by_document_id` não atualiza `content_hash` no modelo | Document model não expõe hash na camada de domínio — aceitável sem embeddings |

## Próxima fase sugerida: AI-RAG-4

- `EmbeddingProviderContract` real (ex: `text-embedding-3-small`)
- `VectorStoreContract` real (pgvector)
- Conectar `TextIngestionService` ao embedding pipeline
- Endpoint interno de ingestão (protegido, admin only)
