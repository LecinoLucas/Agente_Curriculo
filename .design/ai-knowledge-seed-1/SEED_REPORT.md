# Relatório de Seed da Base de Conhecimento RAG

## Objetivo
Popular a base de conhecimento com documentos fictícios e seguros para testar as funcionalidades de busca e resposta (RAG) do Assistente IA.

## Estratégia
1. **Documentos Fictícios**: Criação de 6 documentos em Markdown cobrindo áreas críticas como Pré-Admissão, Integração Protheus, Pipeline de Recrutamento, Qualidade de Vagas e Políticas Internas.
2. **Script de Seed**: Script idempotente (`seed_knowledge_base.py`) que utiliza o `TextIngestionService`.
3. **Segurança**: Validação via Regex para bloquear a ingestão de dados sensíveis (CPF, Emails, API Keys, etc.).
4. **Idempotência**: O script detecta duplicatas via `content_hash` e evita re-ingestão desnecessária, a menos que o parâmetro `--force` seja utilizado.

## Métricas de Ingestão (Simulado)
- Documentos validados: 6
- Chunks previstos: Depende do tamanho de cada documento (média de 1-3 por documento).
- Tempo estimado: < 10 segundos.

## Riscos Mitigados
- **Vazamento de Dados**: Nenhum dado real foi utilizado. Padrões sensíveis são bloqueados pelo script.
- **Duplicidade**: O uso de `content_hash` garante que o mesmo conteúdo não seja ingerido múltiplas vezes.
- **Dependência de LLM**: O seed foca na ingestão textual e estrutural, sem depender de chamadas externas para embeddings nesta fase (seguindo o padrão do `TextIngestionService`).
