# Plano Inicial de Seed — AI-KNOWLEDGE-SEED-0

Este documento descreve as etapas para a futura carga inicial de dados (Fase AI-KNOWLEDGE-SEED-1).

## Objetivos
1.  Popular a base RAG com documentos fictícios de alta qualidade para validar o assistente.
2.  Testar o pipeline completo: Ingestão → Chunking → Embedding → Retrieval → Síntese.
3.  Garantir que a busca vetorial (similarity_search) esteja retornando trechos relevantes.

## Etapas da Carga (Pipeline)

### 1. Preparação (Manual)
*   Coletar documentos fictícios baseados no `EXAMPLE_KNOWLEDGE_DOCS.md`.
*   Revisar contra a política de `SENSITIVE_DATA_EXCLUSION.md`.
*   Atribuir metadados conforme `METADATA_STANDARD.md`.

### 2. Script de Ingestão (`scripts/seed-knowledge.py`)
*   Criar um script Python que utilize o `TextIngestionService` e o `EmbeddingService`.
*   O script deve ler uma pasta de arquivos `.txt` ou `.md`.
*   Para cada arquivo, extrair o título e o conteúdo.
*   Chamar `ingest(force_reingest=True)` para garantir que a carga limpe dados de testes anteriores com o mesmo conteúdo.

### 3. Ordem de Carga Sugerida
1.  **Políticas RH:** Política Antidiscriminatória, Guia LGPD.
2.  **Operacional:** Regras de Triagem, Checklist Admissional.
3.  **Sistema:** Manual do Assistente, Guia de Status Protheus.

### 4. Validação do Seed
*   Após a carga, executar o comando `search_knowledge` (Tool) com perguntas específicas.
*   Exemplo de pergunta de teste: "Qual a regra para exportação Protheus?"
*   Verificar se o `score` é superior a 0.7 para consultas exatas.
*   Validar se as `sources` (fontes) retornadas são as corretas.

## Versionamento e Manutenção
*   **Versionamento:** Usar o campo `version` nos metadados.
*   **Atualização:** Se o conteúdo de um documento mudar, re-executar a ingestão. O `content_hash` mudará, o sistema criará um novo documento e o antigo poderá ser arquivado (`archived_at`).
*   **Limpeza:** Usar `delete_embeddings_by_document` se um documento for removido definitivamente da base.
