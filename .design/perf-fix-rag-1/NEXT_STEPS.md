## Próximos passos

1. Adicionar coluna vetorial nativa (`vector(N)`) e índice pgvector real.
2. Planejar reindexação controlada dos embeddings existentes.
3. Medir latência de retrieval por modo:
   - `pgvector`
   - `json_fallback`
4. Expor métrica/alerta quando o fallback estiver truncando candidatos com frequência.
5. Considerar cache curto por query/hash para consultas repetidas.
