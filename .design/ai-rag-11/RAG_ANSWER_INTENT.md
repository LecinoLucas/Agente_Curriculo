# Conexão da Síntese RAG ao Assistente — AI-RAG-11

## Contexto
Esta fase conecta a camada de síntese textual (implementada na Fase 10) ao roteador central do assistente. Foi introduzida a intent `knowledge.answer`, que permite ao assistente não apenas buscar trechos de documentos, mas também gerar uma resposta textual explicativa fundamentada na base de conhecimento.

## Mudanças Realizadas

### 1. Tool `answer_knowledge` (`knowledge_tools.py`)
- Implementada uma nova tool que orquestra o fluxo completo: **Busca → Recuperação → Síntese**.
- **Comportamento Seguro:**
    - Se a busca não encontrar evidências, a síntese não é invocada (economia de tokens e prevenção de alucinação).
    - Se a feature flag de síntese estiver desligada, a tool retorna uma resposta estruturada informativa.
- **Saída Estruturada:** Retorna a `answer` sintetizada, a lista de `sources` (fontes) citadas e um `retrieval_summary` para auditoria.
- **Hardening:** Filtra rigorosamente metadados internos (`vector_json`, `content_hash`) das fontes retornadas.

### 2. Registro e Catálogo
- **`registry.py`:** Registrada a tool `answer_knowledge` no domínio `knowledge`. O sistema agora conta com **19 tools**.
- **`intent_catalog.py`:** Adicionado mapeamento da intent `knowledge.answer` para a tool `answer_knowledge`.

### 3. Injeção de Dependências (`ai_assistant.py`)
- O endpoint do assistente foi atualizado para instanciar e injetar o `RagAnswerService` (sob a chave `answer_service`) no contexto de execução das ferramentas.

### 4. Testes
- **Tool Tests:** Criada suíte para `answer_knowledge` validando fluxos de sucesso, falta de evidência, síntese desabilitada e proteção de metadados.
- **Registry/Router Tests:** Validado que a nova intent é reconhecida e roteada corretamente pelo `AssistantRouter`.
- **Endpoint Tests:** Confirmado que o endpoint read-only aceita a nova intent e respeita as permissões do usuário (`can_use_assistant`).

## Decisões de Design
- **Tool Única para Resposta:** Optamos por criar a tool `answer_knowledge` em vez de um handler especial no roteador. Isso mantém a arquitetura limpa e permite que agentes especializados utilizem a capacidade de resposta RAG de forma modular.
- **Coexistência:** A intent `knowledge.search` (Fase 9) permanece disponível para casos onde apenas os trechos brutos são necessários (ex: depuração ou interfaces de lista).

## Verificação e Testes
- **Backend:** 100% de aprovação nos testes (incluindo regressão total de RAG e Assistant).
- **Mocks:** O serviço de resposta utiliza o Gemini Provider mockado; nenhuma chamada externa é feita na suíte de testes.
- **Frontend:** Suíte do `JobAiDraftPanel` operando sem regressões.

## Próximos Passos
- **Interface do Assistente:** Agora que o backend "fala" com fontes, podemos implementar uma interface simples de chat ou bot no frontend para interagir com a base de conhecimento.
- **Memória de Conversa:** Implementar histórico para que perguntas subsequentes possam referenciar o contexto anterior.
