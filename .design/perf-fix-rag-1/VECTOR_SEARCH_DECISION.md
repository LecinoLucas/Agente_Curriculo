## Decisão técnica

Nesta fase, o retrieval passou a preferir execução vetorial no banco sempre que `pgvector` estiver disponível, mesmo sem migration de coluna `vector(N)`.

Estratégia adotada:

- persistência continua em `vector_json`;
- busca pgvector usa cast em SQL para `vector`;
- `ORDER BY` e `LIMIT` saem da aplicação e vão para o banco;
- fallback JSON continua existindo, mas com teto explícito.

## Por que não carregar todos os embeddings

Carregar toda a base ativa para calcular cosine em Python escala linearmente com a quantidade de chunks. Isso aumenta:

- tempo de resposta;
- uso de CPU;
- uso de memória;
- risco de degradação do processo web conforme a base cresce.

O ganho principal desta fase é reduzir call-cost do retrieval sem alterar o contrato externo das tools.

## Regra de fallback

Quando `pgvector` não está disponível:

- a busca continua operando em modo compatível;
- o store busca só uma janela limitada de candidatos;
- a aplicação rankeia apenas essa janela;
- `query.limit` continua respeitado.

## Warnings

Warnings controlados introduzidos/garantidos:

- `pgvector_not_available`
- `rag_vector_search_json_fallback_limited`

O contrato continua sem expor:

- `embedding`
- `embeddings`
- `vector_json`
- `content_hash`
- payloads internos de provider

## Riscos restantes

- enquanto a base ainda persistir só `vector_json`, o modo pgvector depende de cast em SQL e não de índice vetorial nativo;
- o fallback JSON fica seguro, mas menos preciso do que busca vetorial indexada;
- o próximo passo natural é coluna vetorial indexável e reindexação controlada.
