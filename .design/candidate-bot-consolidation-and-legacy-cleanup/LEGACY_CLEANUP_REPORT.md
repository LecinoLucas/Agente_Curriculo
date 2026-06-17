# LEGACY_CLEANUP_REPORT.md

## Resultado

- arquivos removidos: nenhum
- arquivos marcados/clarificados: alguns
- abordagem adotada: conservadora

Nenhum arquivo foi removido nesta fase porque a evidência de “código morto com risco zero” não ficou forte o suficiente para justificar deleção estrutural.

## Arquivos Analisados

- `backend/src/application/services/conversation_service.py`
- `backend/src/application/services/candidate_assistant_intent_service.py`
- `backend/src/application/services/conversation_state_machine.py`
- `backend/src/application/services/assistant_content_provider.py`
- `backend/src/application/services/assistant_settings_catalog.py`
- `backend/src/ai_orchestration/core/permission_guard.py`
- `backend/src/ai_orchestration/core/tool_runtime.py`
- `backend/src/ai_orchestration/core/tool_registry.py`
- `backend/src/ai_orchestration/tools/registry.py`
- `backend/src/ai_orchestration/tools/knowledge_tools.py`
- `backend/src/ai_orchestration/tools/job_tools.py`
- `backend/src/ai_orchestration/tools/candidate_tools.py`
- `backend/src/ai_orchestration/assistant/assistant_router.py`
- `backend/src/ai_orchestration/assistant/intent_catalog.py`
- `backend/src/ai_orchestration/agents/supervisor_agent.py`
- `backend/src/ai_orchestration/rag/candidate_safe_retriever.py`
- `backend/src/interface/api/routers/conversations.py`
- `backend/src/interface/api/routers/ai_assistant.py`
- `backend/tests/unit/test_candidate_bot_safety_foundation.py`
- `backend/tests/unit/test_candidate_assistant_intent_service.py`
- `backend/tests/unit/test_ai_tool_registry.py`
- `backend/tests/integration/test_conversation_ai_intent.py`
- `backend/tests/integration/test_conversation_endpoints.py`

## Evidência Coletada

### `supervisor_agent.py`

Comando:

```bash
rg -n "supervisor_agent|SupervisorAgent" backend/src backend/tests frontend/src
```

Resultado:

- nenhuma referência fora do próprio arquivo.

Conclusão:

- é um stub sem uso atual;
- não foi removido porque continua sendo marcador explícito da arquitetura futura LangGraph;
- foi mantido e clarificado em comentário.

### `talk_to_hr_message`

Comando:

```bash
rg -n "talk_to_hr_message" backend/src backend/tests frontend/src
```

Resultado:

- aparece em catálogo/settings/modelos;
- não aparece como fonte da mensagem efetiva de handoff do `ConversationService`.

Conclusão:

- configuração existente, mas ainda não conectada ao read path operacional;
- não remover porque participa do catálogo/configuração e dos testes/admin;
- documentar como gap, não como lixo.

### `should_handoff` e `safe_user_message`

Comando:

```bash
rg -n "should_handoff|safe_user_message" backend/src backend/tests frontend/src
```

Resultado:

- aparecem no contrato do parser, em testes e logs estruturais;
- não são consumidos pelo `ConversationService` na resposta atual do MVP.

Conclusão:

- campos reservados para evolução futura;
- não remover porque fazem parte do contrato do parser e da compatibilidade dos testes;
- clarificados em comentário no modelo `CandidateIntent`.

## Arquivos Removidos

Nenhum.

## Motivo Para Não Remover

### `backend/src/ai_orchestration/agents/supervisor_agent.py`

- sem uso atual;
- porém é um stub de arquitetura futura, não um legado substituído por implementação equivalente.

### `backend/src/ai_orchestration/assistant/*`

- `AssistantRouter`, `IntentCatalog`, `AssistantRequest`, `AssistantResponse` continuam ativos;
- existem rota, runtime e testes unitários cobrindo esse conjunto;
- portanto não são legado morto.

### `backend/src/ai_orchestration/rag/candidate_safe_retriever.py`

- hoje aparece principalmente na fundação/testes;
- mesmo assim é parte explícita da base de segurança do bot candidato;
- remover agora destruiria a trilha de segurança recém-validada.

## Arquivos Mantidos Por Dúvida Razoável

- `backend/src/ai_orchestration/agents/supervisor_agent.py`
- campos reservados `should_handoff` e `safe_user_message`
- setting `talk_to_hr_message`

## Recomendações Futuras

1. Criar um `CandidateBotRegistry` próprio para o portal.
2. Decidir explicitamente se `should_handoff` e `safe_user_message` serão usados ou removidos em fase futura.
3. Ligar ou eliminar `talk_to_hr_message` do catálogo administrativo.
4. Reavaliar remoção do `supervisor_agent.py` apenas quando a arquitetura futura estiver estabilizada ou substituída formalmente.
