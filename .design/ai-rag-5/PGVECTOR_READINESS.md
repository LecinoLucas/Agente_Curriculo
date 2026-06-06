# pgvector Readiness — AI-RAG-5

## Contexto
Esta fase foca na preparação do sistema RAG para suportar busca vetorial real no Postgres utilizando a extensão `pgvector`. O objetivo é garantir que o sistema possa detectar a presença da extensão e oferecer um fallback controlado e informativo quando ela não estiver disponível.

## Mudanças Realizadas

### 1. pgvector Support (`pgvector_support.py`)
- Implementada detecção dinâmica da extensão via consulta ao catálogo `pg_extension`.
- Criado helper para geração de avisos padronizados.
- Permite que o sistema mude o `storage_mode` em tempo de execução.

### 2. PostgresVectorStore (`postgres_vector_store.py`)
- Nova implementação de `VectorStoreContract` focada em Postgres.
- **Fallback Seguro:** O método `similarity_search` verifica a disponibilidade de `pgvector`. Se ausente, retorna um resultado vazio com um `warning` explícito em vez de lançar uma exceção de sintaxe SQL.
- **Health Check:** Retorna o status da extensão e o modo de operação (`pgvector` ou `json_fallback`).

### 3. Migrations
- Adicionada migration `23dbb452c78a_enable_pgvector_extension.py` que tenta executar `CREATE EXTENSION IF NOT EXISTS vector`.
- A migration é resiliente: se falhar (por falta de permissão ou por não ser Postgres), ela apenas registra o aviso e permite que o sistema continue funcionando em modo fallback.

## Como habilitar pgvector

### Ambiente Local (Docker/macOS)
1. Certifique-se de que a imagem do Postgres possui o binário do pgvector.
2. Como superuser no DB, execute:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. O `health_check` do RAG passará a reportar `storage_mode: "pgvector"`.

## Próximos Passos
- **Fase AI-RAG-6:** Implementação da query SQL real usando operadores de distância do pgvector (`<->` para L2, `<#>` para inner product, `<=>` para cosseno).
- **Fase AI-RAG-7:** Integração completa do retrieval vetorial no `AssistantRouter`.
