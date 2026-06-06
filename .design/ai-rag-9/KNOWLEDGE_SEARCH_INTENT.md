# Intent knowledge.search — AI-RAG-9

## Contexto
Esta fase conecta a busca na base de conhecimento (RAG) ao roteador central do assistente (`AssistantRouter`). Agora, o endpoint estruturado (`/ai/assistant/read-only`) é capaz de processar solicitações de busca semântica, utilizando a infraestrutura de ferramentas e retrievers desenvolvida nas fases anteriores.

## Mudanças Realizadas

### 1. Intent Catalog (`intent_catalog.py`)
- Adicionado o intent `knowledge.search`.
- Mapeado 1:1 para a tool `search_knowledge`.

### 2. Assistant Endpoint (`ai_assistant.py`)
- **Gestão de Permissões:** Adicionada a permissão `can_use_assistant` aos papéis `ADMIN`, `RECRUITER`, `HR` e `MANAGER`. Isso garante que apenas usuários internos autorizados possam consultar a base de conhecimento.
- **Injeção de Dependência:** O método `_build_services` foi atualizado para instanciar e injetar o `PostgresVectorRetriever` no contexto de execução das ferramentas sob o nome `retriever`.
- **Estratégia de Provedor:** O retriever utiliza o `get_embedding_provider()` (Factory da Fase 7), respeitando as feature flags de uso do Gemini ou Fake Provider.

### 3. Testes
- **AssistantRouter:** Validado que a nova intent resolve para a ferramenta correta e respeita o isolamento do domínio `knowledge`.
- **Endpoint:** Validado o fluxo fim-a-fim (Mockado):
    - Aceite da intent `knowledge.search`.
    - Bloqueio de acesso para papéis sem a permissão (ex: `VIEWER`).
    - Verificação de que metadados sensíveis de sistema (`vector_json`, `content_hash`) permanecem ocultos na resposta da API.

## Decisões de Design
- **Injeção via Endpoint:** Mantivemos a lógica de montagem de infraestrutura no endpoint. Isso evita que o roteador precise conhecer detalhes de banco de dados ou provedores de IA, mantendo-o puramente focado em lógica de fluxo.
- **Segurança de Saída:** A higienização dos trechos recuperados é feita na Tool (Fase 8), mas revalidada nos testes de integração do endpoint para garantir que nenhum dado vetorial bruto vaze para o frontend.

## Verificação e Testes
- **Backend (Router/Endpoint):** 100% de aprovação nos 18 testes de endpoint e 59 testes de roteador.
- **Regressão:** Suítes de Job, Candidate, Pipeline e Admission validadas.
- **Frontend:** Testes do `JobAiDraftPanel` continuam operacionais.

## Próximos Passos
- **Fase AI-RAG-10:** Implementar a **Síntese de Conhecimento**. Esta será a primeira fase a utilizar o Claude (LLM) para transformar os trechos recuperados em uma resposta textual amigável e explicativa para o usuário final.
