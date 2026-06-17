# IMPLEMENTATION_REPORT.md

## Status

PASS_WITH_NOTES

## Escopo entregue

- `CandidateAgentRouter` criado para rotear mensagens livres do portal do candidato;
- roteamento controlado para:
  - resposta segura;
  - RAG público candidato;
  - tools read-only permitidas;
  - handoff humano real;
  - início do fluxo guiado de candidatura;
- `ConversationService` integrado ao router sem liberar ações críticas;
- `apply_to_job` e `upload_resume` agora iniciam o fluxo guiado sem criar candidatura na largada;
- `talk_to_hr` continua criando handoff real;
- `ask_question` passa a usar `answer_candidate_knowledge`;
- respostas seguras para mensagens sensíveis, desconhecidas e tentativas de bypass;
- testes unitários e de integração adicionados/ajustados.

## Confirmação

free text -> intent -> agent router -> safe response/RAG/tool/handoff/guided flow

## Arquivos alterados

- `backend/src/application/services/candidate_agent_router.py`
- `backend/src/application/services/conversation_service.py`
- `backend/tests/unit/test_candidate_agent_router.py`
- `backend/tests/integration/test_candidate_portal_bot_chat.py`

## Testes executados

- `ruff check src/application/services/candidate_agent_router.py src/application/services/conversation_service.py tests/unit/test_candidate_agent_router.py tests/integration/test_candidate_portal_bot_chat.py`
- `pytest tests/unit/test_candidate_agent_router.py tests/unit/test_candidate_bot_registry.py tests/integration/test_candidate_portal_bot_chat.py tests/integration/test_conversation_ai_intent.py -q`
- `git diff --check`

## Notas

- a classificação das intents públicas do router foi implementada de forma controlada e determinística, usando heurísticas do domínio e sinais já existentes de `safe_user_message` / `should_handoff`;
- o parser IA já existente continua sendo usado como camada auxiliar de segurança e handoff, sem abrir escrita automática;
- tools proibidas continuam fora do registry do candidato.

## Pendências

- criação de candidatura com confirmação
- LangGraph
- WhatsApp
- multiagent
