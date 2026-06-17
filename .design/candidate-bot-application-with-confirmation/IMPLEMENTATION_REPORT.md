# IMPLEMENTATION_REPORT.md

## Status

PASS

## Fluxo implementado

- `bot chat -> escolha vaga/unidade -> candidate_application_draft -> resumo -> confirmação explícita -> CandidateApplication source='bot'`
- o router continua classificando free text, mas agora envia `apply_to_job`, `choose_unit`, `provide_candidate_data`, `confirm` e `cancel` para um fluxo de draft controlado no `ConversationService`
- `talk_to_hr` continua criando handoff real
- `ask_question` continua usando RAG público
- `see_jobs` continua usando tool read-only

## Como o draft é salvo

- chave: `conversation.context_json["candidate_application_draft"]`
- campos persistidos:
  - `status`
  - `job_id`
  - `job_title`
  - `preferred_unit_id`
  - `unit_name`
  - `candidate_name`
  - `contact_email`
  - `contact_phone`
  - `consent_given`
  - `confirmation_requested_at`
  - `submitted_application_id`
- o draft não salva CPF, RG, dados bancários, documentos admissionais ou outros dados sensíveis

## Como a confirmação explícita é validada

- o bot só mostra a candidatura final após gerar um resumo com:
  - vaga
  - unidade
  - nome
  - contato
- quick replies de confirmação:
  - `confirmar_candidatura`
  - `alterar_dados`
  - `cancelar_candidatura`
- a tool `create_candidate_application_from_bot` falha se:
  - não houver `explicit_confirmation=True`
  - `confirmation_requested_at` estiver ausente
  - o draft estiver sem nome, contato, consentimento, vaga ou unidade obrigatória

## Service/tool de criação

- tool write-safe: `backend/src/ai_orchestration/tools/candidate_bot_tools.py`
  - `create_candidate_application_from_bot`
- registry:
  - `CandidateBotRegistry` expõe a tool com permissão `candidate_write_safe_application`
  - a tool permanece bloqueada no `ToolRuntime(read_only=True)`
- criação da candidatura:
  - usa `CandidateApplicationService.create_application(...)`
  - grava `source="bot"`

## preferred_unit_id

- quando a vaga tem 1 unidade ativa:
  - o draft autopreenche `preferred_unit_id`
  - a confirmação já mostra a unidade resolvida
- quando a vaga tem 2+ unidades ativas:
  - o draft exige escolha explícita
  - unidade inválida é rejeitada antes da escrita
- o valor final é preservado em `CandidateApplication.preferred_unit_id`

## Arquivos alterados

- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_EVAL_CASES.md`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_PROMPTS.md`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_TOOLS_POLICY.md`
- `backend/src/ai_orchestration/tools/candidate_bot_registry.py`
- `backend/src/ai_orchestration/tools/candidate_bot_tools.py`
- `backend/src/application/services/candidate_agent_router.py`
- `backend/src/application/services/conversation_service.py`
- `backend/tests/integration/test_candidate_portal_bot_chat.py`
- `backend/tests/unit/test_candidate_agent_router.py`
- `backend/tests/unit/test_candidate_bot_registry.py`
- `candidate-portal/src/components/shared/CandidateBotChat.tsx`
- `candidate-portal/src/components/shared/CandidateBotChat.test.tsx`

## Testes executados

- `backend/.venv/bin/ruff check backend/src/application/services/conversation_service.py backend/src/application/services/candidate_agent_router.py backend/src/ai_orchestration/tools/candidate_bot_tools.py backend/src/ai_orchestration/tools/candidate_bot_registry.py backend/tests/unit/test_candidate_agent_router.py backend/tests/unit/test_candidate_bot_registry.py backend/tests/integration/test_candidate_portal_bot_chat.py`
- `APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://user:pass@localhost/test JWT_SECRET_KEY=test-jwt backend/.venv/bin/python -m pytest backend/tests/unit/test_candidate_agent_router.py backend/tests/unit/test_candidate_bot_registry.py backend/tests/integration/test_candidate_portal_bot_chat.py -q`
- `APP_SECRET_KEY=test-secret DATABASE_URL=postgresql+asyncpg://user:pass@localhost/test JWT_SECRET_KEY=test-jwt backend/.venv/bin/python -m pytest backend/tests/unit/test_candidate_agent_router.py backend/tests/unit/test_candidate_bot_registry.py backend/tests/unit/test_candidate_bot_safety_foundation.py backend/tests/unit/test_candidate_assistant_intent_service.py backend/tests/integration/test_candidate_portal_bot_chat.py backend/tests/integration/test_conversation_ai_intent.py backend/tests/integration/test_conversation_endpoints.py -q`
- `npm --prefix candidate-portal exec vitest run src/components/shared/CandidateBotChat.test.tsx`
- `npm --prefix candidate-portal run build`
- `git diff --check`

## Git status --short

```text
 M .design/candidate-bot-consolidation-and-legacy-cleanup/BOT_EVAL_CASES.md
 M .design/candidate-bot-consolidation-and-legacy-cleanup/BOT_PROMPTS.md
 M .design/candidate-bot-consolidation-and-legacy-cleanup/BOT_TOOLS_POLICY.md
 M backend/src/ai_orchestration/tools/candidate_bot_registry.py
 M backend/src/ai_orchestration/tools/candidate_bot_tools.py
 M backend/src/application/services/candidate_agent_router.py
 M backend/src/application/services/conversation_service.py
 M backend/tests/integration/test_candidate_portal_bot_chat.py
 M backend/tests/unit/test_candidate_agent_router.py
 M backend/tests/unit/test_candidate_bot_registry.py
 M candidate-portal/src/components/shared/CandidateBotChat.test.tsx
 M candidate-portal/src/components/shared/CandidateBotChat.tsx
```

## Riscos restantes

- a extração de nome/contato no draft ainda usa heurísticas simples de texto
- a cobertura nova está concentrada no portal chat e nos guards principais, não em todos os caminhos de escrita possíveis
- ainda não há LangGraph, WhatsApp, multiagent ou triagem avançada

## Pendências

- criação de candidatura com confirmação: entregue nesta fase
- LangGraph: pendente
- WhatsApp: pendente
- multiagent: pendente
- triagem avançada: pendente
