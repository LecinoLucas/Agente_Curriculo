## Antes

Fluxo de `knowledge.search` / `knowledge.answer`:

1. `PostgresVectorRetriever.retrieve(query)`
2. provider gera `query_vector`
3. `PostgresVectorStore.similarity_search(...)`
4. carrega embeddings/chunks/documentos ativos sem corte efetivo inicial
5. materializa rows em Python
6. calcula cosine similarity em memória
7. ordena em memória
8. aplica `query.limit` no fim

Efeito:

- custo linear em CPU/memória da aplicação;
- `settings` limitava só a síntese, não a recuperação;
- fallback JSON podia crescer sem teto.

## Depois

Fluxo com `pgvector` disponível:

1. `retrieve(query)`
2. provider gera `query_vector`
3. `similarity_search(...)`
4. SQL usa `CAST(vector_json::text AS vector) <=> CAST(:query_vector AS vector)`
5. `ORDER BY` vetorial no banco
6. `LIMIT` no SQL
7. backend recebe só top chunks

Fluxo com `pgvector` indisponível:

1. `retrieve(query)`
2. provider gera `query_vector`
3. `similarity_search(...)`
4. fallback JSON busca candidatos com teto defensivo
5. ordena só os candidatos permitidos
6. aplica `query.limit`
7. retorna warning controlado quando houve corte

## Quando usa pgvector

- extensão `vector` detectada no Postgres;
- ranking e limit executados no banco;
- não calcula cosine para toda a base em Python.

## Quando usa fallback

- `pgvector` indisponível ou ambiente incompatível;
- continua funcional sem quebrar `knowledge.search` e `knowledge.answer`;
- adiciona warning de compatibilidade e warning de fallback limitado.

## Limite defensivo

- `JSON_FALLBACK_CANDIDATE_LIMIT = 1000`
- janela prática do fallback: `min(1000, query.limit * 20)` candidatos, com `+1` para detectar truncamento
- warning emitido quando o fallback corta candidatos:
  - `rag_vector_search_json_fallback_limited`
