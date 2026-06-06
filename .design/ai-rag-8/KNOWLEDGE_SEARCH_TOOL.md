# Tool search_knowledge — AI-RAG-8

## Contexto
Esta fase integra a base de conhecimento RAG ao ecossistema de ferramentas do assistente. Foi criada a tool `search_knowledge`, permitindo que agentes ou o assistente realizem buscas semânticas de forma segura e estruturada.

## Mudanças Realizadas

### 1. Knowledge Tools (`knowledge_tools.py`)
- Implementada a tool `search_knowledge`.
- **Segurança de Saída:** A tool filtra metadados sensíveis e nunca expõe embeddings brutos ou hashes internos (`vector_json`, `content_hash`).
- **Validação de Entrada:** Aplica limpeza de query e um limitador rígido (*cap*) de 20 resultados para evitar sobrecarga de contexto.
- **Tratamento de Erros:** Converte falhas de banco ou infraestrutura em `ToolResult` de erro controlado (`INTERNAL_ERROR`).

### 2. Registro de Tools (`registry.py`)
- Adicionada a tool `search_knowledge` ao `DEFAULT_REGISTRY`.
- Definido o domínio `knowledge`.
- **Permissão:** Exigida a permissão `can_use_assistant` para acesso à base de conhecimento.
- **Configuração:** A tool é estritamente `read_only` e não requer aprovação do usuário (`requires_approval=False`).

### 3. Testes
- Criada a suíte `test_ai_knowledge_tools.py` cobrindo:
    - Sucesso na recuperação e formatação.
    - Bloqueio por falta de permissão.
    - Tratamento de queries vazias.
    - Respeito ao limite máximo de resultados.
    - Preservação de avisos (*warnings*) do retriever.

## Decisões de Design
- **Read-Only:** A tool foca exclusivamente em consulta. Operações de ingestão ou modificação da base de conhecimento permanecem restritas a serviços de backend internos e não são expostas como ferramentas de agente por segurança.
- **Injeção de Dependência:** O `PostgresVectorRetriever` deve ser injetado pelo executor da tool (ex: `ToolRuntime`), mantendo a tool desacoplada da inicialização de infraestrutura.

## Verificação e Testes
- **Backend (Registry):** Confirmado que o registro agora contém **18 tools**.
- **Backend (Knowledge):** 6 testes passando com 100% de cobertura no módulo de tools de conhecimento.
- **Regressão:** Testes do `AssistantRouter` e `JobAiDraftService` validados para garantir que a nova tool não interfere nos fluxos existentes.

## Próximos Passos
- **Fase AI-RAG-9:** Conectar a tool `search_knowledge` ao `AssistantRouter` através de um novo intent `knowledge.search`.
- **Fase AI-RAG-10:** Implementar a síntese de resposta final usando Claude/LLM com base nos trechos recuperados pela tool.
