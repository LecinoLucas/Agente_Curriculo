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
- Adicionada migration `23dbb452c78a_enable_pgvector_extension.py` como um no-op seguro.
- **Atenção:** A migration não tenta mais executar `CREATE EXTENSION` automaticamente para evitar falhas de transação em ambientes onde o usuário da aplicação não possui permissões de superuser ou o binário não está instalado.
- O sistema continua funcional em modo `json_fallback` mesmo sem a extensão.

## Como habilitar pgvector manualmente

### Requisitos
- O binário da extensão `pgvector` deve estar instalado no servidor PostgreSQL.
- O comando deve ser executado por um usuário com permissão de superuser (DBA).

### Comando Manual
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Em instâncias Gerenciadas (Cloud), pode ser necessário habilitar a extensão via painel de controle do provedor ou comando específico do RDS/Cloud SQL.

### Validação
- O `health_check` do RAG passará a reportar `storage_mode: "pgvector"`.
- Se não habilitado, o sistema reportará modo `json_fallback`.

## Próximos Passos
- **Fase AI-RAG-6:** Implementação da query SQL real usando operadores de distância do pgvector (`<->` para L2, `<#>` para inner product, `<=>` para cosseno).
- **Fase AI-RAG-7:** Integração completa do retrieval vetorial no `AssistantRouter`.
