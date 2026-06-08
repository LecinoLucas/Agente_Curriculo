# BUGS_FOUND

| ID | Componente | Descrição do Bug de Regra de Negócio | Status Atual | Ação Recomendada (Próxima Fase) |
|---|---|---|---|---|
| BUG-001 | JobAiDraftGraph | O nó de post-validation falhava silenciosamente e deixava de retornar o status como `"error"` em certos casos de falha de parsing. | Resolvido durante a validação (Status logado agora é `"error"` rigorosamente, combinando com testes em `test_job_ai_draft_service`). | N/A |
| BUG-002 | Guardrails Experience | O mapeamento de experiência com "seis meses" gerava zero ou quebrava lógica. Backend foi ajustado em fases prévias para mapear meses para frações. | Validado via `test_converts_six_months_experience_to_half_year`. | N/A |
| BUG-003 | AI Usage Logs | `parse_draft_node_logs_failed_on_parse_error` falhava em asserções entre `"failed"` e `"error"`. | Resolvido alterando fallback para `"error"`. | N/A |

*Nenhum bug novo crítico de regra de negócio foi encontrado durante a etapa de validação, indicando robustez das guardas atuais.*
