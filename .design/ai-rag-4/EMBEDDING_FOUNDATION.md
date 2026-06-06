# Fundação de Embeddings RAG — AI-RAG-4

## Contexto
Esta fase estabelece a infraestrutura necessária para suportar busca vetorial (RAG) no projeto Admissão RH / ATS. O foco foi criar os contratos, schemas e persistência inicial sem depender de provedores externos (Gemini, Claude, OpenAI).

## Decisões Arquiteturais

### Provedores de Embedding
1. **Embedding Reais (Futuro):** O provedor recomendado para a fase de ativação real é o **Gemini**. Ele oferece um excelente custo-benefício para vetorização de grandes volumes de documentos.
2. **Raciocínio e Resposta:** O **Claude** deve ser priorizado para a síntese final de respostas, explicações e análises complexas, devido à sua superioridade em tarefas textuais finas.
3. **Provedor Fake (Atual):** Implementamos o `FakeEmbeddingProvider`, que gera vetores determinísticos baseados no hash SHA-256 do texto. Isso permite testar todo o pipeline (ingestão → chunking → vetorização → busca) sem custos ou latência de rede.

### Armazenamento de Vetores
- **Tabela:** `ai_knowledge_embeddings`.
- **Formato:** Nesta fase, os vetores são armazenados como JSON (`JSONB` no Postgres, `JSON` no SQLite).
- **pgvector:** A integração com a extensão `pgvector` do Postgres foi deixada para a Fase AI-RAG-5, onde a busca por similaridade de cosseno será ativada.
- **Deduplicação:** A constraint `unique(chunk_id, provider, model)` garante que cada pedaço de conhecimento tenha apenas um vetor por modelo.

## Componentes Criados

### 1. FakeEmbeddingProvider
Localizado em `backend/src/ai_orchestration/rag/fake_embedding_provider.py`.
- Gera vetores determinísticos.
- Mesmos textos resultam nos mesmos vetores.
- Não faz I/O.

### 2. EmbeddingService
Localizado em `backend/src/ai_orchestration/rag/embedding_service.py`.
- Coordena a chamada ao provider e o salvamento no vector store.
- Retorna resultados controlados (`ok`, `embeddings_created`, `warnings`).

### 3. Persistência SQLAlchemy
- **Model:** `AIKnowledgeEmbeddingModel` adicionado ao `ai_knowledge_models.py`.
- **Repository:** `SQLAlchemyKnowledgeEmbeddingRepository`.
- **Migration:** `399c41dd0e2c_add_ai_knowledge_embeddings.py`.

## Fluxo de Uso
1. `TextIngestionService` (Fase 3) gera chunks.
2. `EmbeddingService` (Fase 4) recebe os chunks, gera vetores via `FakeEmbeddingProvider` e salva via `SQLAlchemyKnowledgeEmbeddingRepository`.

## Próximos Passos
- **Fase AI-RAG-5:** Ativar `pgvector` no Postgres, implementar busca vetorial real e integrar com o `AssistantRouter`.
