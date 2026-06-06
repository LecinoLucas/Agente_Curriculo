# Hardening de Dimensões de Embedding — AI-RAG-6A

## Contexto
Esta fase focou no endurecimento da validação de dimensões de embeddings em todo o pipeline RAG. O objetivo foi garantir que vetores de tamanhos inconsistentes não sejam persistidos nem comparados, o que poderia invalidar os resultados da busca vetorial.

## Mudanças Realizadas

### 1. EmbeddingService
- Adicionada validação estrita entre a quantidade de chunks enviados e a quantidade de vetores retornados pelo provider.
- Adicionada verificação de que cada vetor individual possui o comprimento (`len`) exatamente igual à dimensão informada pelo provider (`batch.dimensions`).
- Retorna `error_code: INVALID_EMBEDDING_DIMENSION` em caso de inconsistência, impedindo a persistência parcial ou inválida.

### 2. SQLAlchemyKnowledgeEmbeddingRepository
- Adicionada validação defensiva no método `upsert_embeddings`.
- Vetores que não coincidem com o campo `dimensions` são ignorados silenciosamente para evitar corrupção de dados (embora o `EmbeddingService` já deva filtrar isso).

### 3. PostgresVectorStore
- Refatorada a `similarity_search` para lidar com dimensões mistas na tabela:
    - Chunks cujo vetor persistido tenha dimensão diferente da `query_vector` são ignorados durante o cálculo de similaridade.
    - Adicionado aviso (`warning`) no resultado da busca indicando quantos chunks foram pulados: `embedding_dimension_mismatch: skipped N chunks`.
- Adicionada validação para rejeitar `query_vector` vazio.

### 4. PostgresVectorRetriever
- Adicionada validação de pré-busca: se o embedding gerado para a query não coincidir com a dimensão esperada do provider, a busca é abortada com o aviso `INVALID_QUERY_EMBEDDING_DIMENSION`.

### 5. FakeEmbeddingProvider
- Atualizado para garantir suporte a dimensões configuráveis via `__init__`, mantendo o determinismo para qualquer tamanho de vetor solicitado.

## Decisões Técnicas
- **Abordagem Fail-Fast:** Optamos por interromper o pipeline de ingestão se o provider retornar dados inconsistentes. É melhor não ter o embedding do que ter um dado que degradará o sistema.
- **Resiliência na Busca:** Na busca vetorial, optamos por ignorar vetores incompatíveis e avisar o usuário (via warnings), permitindo que a busca continue com os dados válidos restantes.

## Verificação e Testes
- **Unitários (Service/Provider):** 447 testes passando no backend, incluindo casos de teste para:
    - Rejeição de dimensões incorretas no `EmbeddingService`.
    - Rejeição de quantidades divergentes (vetores vs chunks).
    - Reporte de warnings de mismatch no `PostgresVectorStore`.
    - Validação de dimensões no `FakeEmbeddingProvider` (8, 16, etc).
- **Integração (Repository):** Confirmado que vetores inválidos não são salvos.
- **Frontend:** Suíte do `JobAiDraftPanel` validada sem regressões.

## Riscos Restantes
- **Migrations de Modelo:** Se mudarmos o modelo de embedding real (ex: de um modelo de 768 para 1536 dimensões), os vetores antigos continuarão na tabela e serão ignorados pela busca. Será necessário um processo de reingestão (`force_reingest=True`) para atualizar a base para a nova dimensão.

## Sugestão de Commit
`feat(ai-rag): hardening da validação de dimensões de embeddings`
