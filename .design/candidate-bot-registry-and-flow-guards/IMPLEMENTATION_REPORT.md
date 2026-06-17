# Implementation Report — Candidate Bot Registry And Flow Guards

**Data:** 2026-06-17
**Classificação final:** `PASS`

## Resumo Executivo

Esta fase separou o catálogo operacional do bot candidato do registry interno ATS/RH e conectou os sinais do parser ao fluxo real do `ConversationService`.

O resultado validado foi:

- `CandidateBotRegistry` com allowlist explícita e falha fechada;
- `ToolPermissionGuard` aceitando apenas permissões `candidate_*` no contexto candidato;
- `should_handoff=True` criando handoff real e idempotente;
- `talk_to_hr_message` passando por validação de saída segura antes de ser usado;
- `safe_user_message` entrando no fallback operacional apenas quando seguro.

## Arquivos Alterados

- `backend/src/ai_orchestration/core/agent_context.py`
- `backend/src/ai_orchestration/core/permission_guard.py`
- `backend/src/ai_orchestration/tools/candidate_bot_tools.py`
- `backend/src/ai_orchestration/tools/candidate_bot_registry.py`
- `backend/src/application/services/candidate_assistant_intent_service.py`
- `backend/src/application/services/conversation_service.py`
- `backend/tests/unit/test_candidate_bot_registry.py`
- `backend/tests/unit/test_candidate_assistant_intent_service.py`
- `backend/tests/unit/test_candidate_bot_safety_foundation.py`
- `backend/tests/integration/test_conversation_ai_intent.py`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_TOOLS_POLICY.md`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_EVAL_CASES.md`
- `.design/candidate-bot-registry-and-flow-guards/IMPLEMENTATION_REPORT.md`

## CandidateBotRegistry

Tools permitidas no registry do candidato:

- `search_public_jobs`
- `get_public_job_detail`
- `get_public_job_units`
- `search_candidate_knowledge`
- `answer_candidate_knowledge`
- `get_my_application_status`

Ferramentas bloqueadas por desenho:

- pipeline interno
- admission
- Protheus
- resumos internos de candidato
- knowledge base interna staff/admin
- ações de aprovação, rejeição, pré-admissão, exportação e notas internas

Comportamento de segurança:

- o registry candidato não herda o `DEFAULT_REGISTRY`;
- lookup fora da allowlist falha fechado;
- tentativa de uso de tool bloqueada gera log `candidate_bot_registry.tool_blocked`.

## Flow Guards

### `should_handoff`

Quando o parser retorna `should_handoff=True`, o `ConversationService`:

- persiste `interpreted_intent`;
- cria `conversation_handoffs` com status `pending`;
- evita duplicidade quando já existe handoff pendente na sessão;
- retorna `handoff_required=True`.

### `talk_to_hr_message`

O texto vindo do parser só é usado quando passa pela política segura de saída. Caso contrário, o serviço usa o fallback:

`Certo, vou encaminhar sua solicitação para o RH. Assim que possível, alguém continuará o atendimento.`

Bloqueios aplicados:

- promessa de prazo;
- pedido ou menção a dado sensível;
- linguagem de aprovação/rejeição;
- instrução interna ao RH;
- afirmação não suportada sobre salário ou benefícios.

### `safe_user_message`

O fallback seguro do parser só entra no fluxo quando:

- a mensagem não foi transformada em token determinístico;
- o intent é `unclear`, de baixa confiança, ou a entrada parece arriscada;
- a resposta segura passa pela validação de saída.

O `safe_user_message` é descartado quando tentar:

- pedir CPF, salário ou outros dados sensíveis;
- prometer prazo;
- inventar vaga, regra ou benefício;
- rejeitar/aprovar candidato.

## Cadeia Validada

```text
candidate intent
  -> CandidateBotRegistry + ToolPermissionGuard
  -> ConversationService
  -> safe response ou real handoff
```

Confirmações:

- o registry de candidato ficou separado do catálogo staff;
- tools proibidas continuam fora do alcance do candidato;
- `should_handoff` agora produz handoff rastreável;
- `talk_to_hr_message` perigosa é substituída pelo fallback;
- `safe_user_message` só entra quando segura.

## Testes Executados

```bash
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_bot_registry.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_ai_tool_registry.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_assistant_intent_service.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_bot_safety_foundation.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_ai_intent.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_endpoints.py -q
git diff --check
git status --short
```

Resultados:

- `test_candidate_bot_registry.py`: `7 passed`
- `test_ai_tool_registry.py`: `33 passed`
- `test_candidate_assistant_intent_service.py`: `17 passed`
- `test_candidate_bot_safety_foundation.py`: `18 passed`
- `test_conversation_ai_intent.py`: `12 passed`
- `test_conversation_endpoints.py`: `18 passed`
- `git diff --check`: sem erros

## Riscos Restantes

- a UI final do chat ainda não existe;
- LangGraph multiagente continua fora do escopo;
- WhatsApp continua fora do escopo;
- write tools com confirmação ainda não foram expostas no runtime do candidato;
- o registry candidato ainda não está acoplado a uma superfície final de chat no portal.

## Próximos Passos

1. Conectar o registry candidato à UI final do chat do portal.
2. Modelar writes seguros com confirmação explícita antes de expor candidatura ou atualização de contato.
3. Definir a camada de orquestração futura para LangGraph sem reabrir acesso a tools internas.
