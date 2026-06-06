# Relatório de Hardening — Ingestão RAG (AI-RAG-3A)

## Contexto
Esta fase focou no endurecimento do pipeline de ingestão textual RAG, garantindo consistência entre a lógica de deduplicação por `content_hash`, a funcionalidade de reingestão forçada (`force_reingest`) e as constraints de integridade do banco de dados Postgres/SQLAlchemy.

## Mudanças Realizadas

### 1. IngestionPipelineResult (Contrato)
- Adicionado campo `reingested: bool` para indicar explicitamente quando um documento existente teve seus chunks recriados.
- Mantido `was_duplicate: bool` para indicar se o conteúdo já existia na base.

### 2. TextIngestionService
- **Deduplicação Inteligente:** O serviço agora verifica a existência do `content_hash` antes de qualquer tentativa de criação.
- **Resolução de Conflito em force_reingest:**
    - Anteriormente, `force_reingest=True` ignorava o check de duplicidade e tentava criar um novo `KnowledgeDocument`, o que violaria a constraint `unique(content_hash)`.
    - Agora, se um duplicado é encontrado e `force_reingest=True`, o serviço recupera o `document_id` existente, deleta os chunks antigos e gera novos.
    - Isso garante que nunca existam dois documentos com o mesmo conteúdo, preservando a integridade referencial.
- **Tratamento de Erros:** Exceções de repositório (incluindo `IntegrityError`) são capturadas e retornadas como `ok=False` com mensagem amigável, evitando stack traces no log de negócio.

### 3. Repositories
- **Hardening de Constraints:** Validado que a constraint `uq_ai_knowledge_documents_content_hash` no Postgres impede a inserção de hashes duplicados mesmo fora do service.

## Decisões Técnicas
- **Reutilização de Documento:** Optamos por reutilizar o `KnowledgeDocument` existente em caso de `force_reingest=True` para o mesmo conteúdo. Isso mantém o histórico de criação do documento original enquanto atualiza a estratégia de chunking.
- **Atomicidade de Chunks:** A reingestão segue o padrão *Delete-then-Create* para chunks, garantindo que não sobrem "órfãos" caso o número de chunks mude.

## Verificação e Testes
- **Unitários (Service):** 28 testes passando, cobrindo criação, deduplicação, erro de input, preservação de metadados e o novo fluxo de `force_reingest` seguro.
- **Integração (Repositories):** 39 testes passando, incluindo teste explícito de violação de `unique(content_hash)`.
- **Regressão:** Testes de Assistant, Tools e Job AI Draft validados para garantir que o hardening não quebrou fluxos existentes.

## Riscos Restantes
- **Corrida (Race Condition):** Em ambientes de altíssima concorrência, dois processos injetando o exato mesmo conteúdo no exato mesmo milissegundo podem ambos passar pelo `find_by_content_hash` (não encontrando nada) e tentar o `create_document`. O banco de dados lançará `IntegrityError`, que o Service já está preparado para capturar e retornar como erro controlado.

## Sugestão de Commit
`feat(ai-rag): hardening de deduplicação e reingestão segura de documentos`
