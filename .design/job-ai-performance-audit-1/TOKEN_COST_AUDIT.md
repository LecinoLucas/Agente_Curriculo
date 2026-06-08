# Job AI Draft - Token & Cost Audit

| Cenário | Status (DB) | Tokens registrados | Custo estimado | Risco | Observação |
|---|---|---|---|---|---|
| **Sucesso Completo** | `success` | Input & Output Reais | Sim, calculado | Baixo | Funciona conforme o esperado; `estimated_cost` inserido com base na tabela de preços do `ai_pricing.py`. |
| **Erro do Provider (indisponível)** | `error` | `0` input, `0` output | `$0.00` | Baixo | Sem custo, gera registro para BI (acompanhar incidentes de instabilidade da API). |
| **Erro de Parse (JSON inválido)** | `error` | Input & Output Reais | Sim, calculado | Médio | Token foi consumido. O usuário recebe erro no frontend, mas o custo já foi incorrido. Requer ajuste de prompt para minorar chance. |
| **Timeout Local (httpx)** | `error` | `0` input, `0` output | `$0.00` | Baixo | O LangGraph ou Adaptador interrompe a requisição, sem faturamento confirmado da GCP/AWS. |
| **Rate Limit (HTTP 429)** | N/A (interceptado no Adaptador) | `0` tokens | `$0.00` | Médio | O `GeminiAdapter` gerencia isso com cooldown interno (`_mark_credential_rate_limited`), tentando outra chave invisivelmente. Custo não afeta o registro final da requisição do Job AI, exceto pelo delay repassado ao usuário. |
| **Retry (Falha Transitória)** | N/A | Apenas última tentativa / 0 | `$0.00` | Baixo | Não há retries de geração programados no `gemini_adapter.py` para erros padrão (`max_retries=0`). Se houver rate-limit, o pool troca a chave. Nenhuma duplicação de custo é incorrida. |

**Conclusão de Integridade:** O fluxo de logs de uso obedece à restrição "1 tentativa de geração = no máximo 1 registro no banco de dados", não havendo anomalias entre o modelo LangGraph e Procedural (eles não competem, um inibe o outro via Feature Flag).
