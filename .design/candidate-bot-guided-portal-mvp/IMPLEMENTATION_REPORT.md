# CANDIDATE-BOT-GUIDED-PORTAL-MVP-1

Classificação final: PASS

## Resumo

Foi entregue o MVP guiado do chat no portal do candidato usando a base já validada do backend:

- portal envia mensagem para `ConversationService`;
- backend usa `CandidateBotRegistry` e guardrails de candidato;
- respostas seguras e handoff real continuam ativos;
- `session_id` é reaproveitado no navegador sem persistir dado sensível;
- quick replies e histórico da sessão atual aparecem na UI.

## Endpoint usado/criado

- `GET /api/v1/public/candidate-bot/sessions/{session_id}`
- `POST /api/v1/public/candidate-bot/message`

O endpoint usa `CurrentCandidateSession` e chama `ConversationService.receive_candidate_portal_bot_message(...)` com contexto de candidato.

## Comportamento da UI

- Saudação inicial com quick replies locais.
- Histórico renderizado em bolhas de candidato/assistente.
- Envio de mensagem com loading e erro amigável.
- Aviso de privacidade: não enviar dados sensíveis ou documentos admissionais.
- Handoff visual quando `handoff_required=true`.
- Input continua disponível após handoff, sem promessa de prazo.

## Persistência de sessão

- Chave usada: `candidate_portal_bot_session_id`
- Armazenamento: `sessionStorage`
- Conteúdo persistido: apenas `session_id`
- Se a sessão não puder ser restaurada, o storage é limpo e a conversa reinicia com saudação segura.

## Ajuste técnico importante

O estado visual `GUIDED_PORTAL_CHAT` não foi persistido diretamente em `conversation_sessions.current_state`, porque o banco atual ainda restringe os estados por `CHECK` e esta fase não permite migration.

Correção aplicada:

- o modo guiado fica sinalizado por `context_json.candidate_portal_guided_chat=true`;
- o backend projeta `GUIDED_PORTAL_CHAT` apenas na resposta pública;
- no banco, a sessão continua usando um estado já permitido.

Isso mantém compatibilidade com o schema existente sem relaxar regra de segurança nem exigir migration.

## Arquivos alterados

- `backend/src/application/services/conversation_service.py`
- `backend/src/interface/api/routers/public_candidate_portal.py`
- `backend/src/interface/api/schemas/conversation_schemas.py`
- `backend/src/ai_orchestration/rag/candidate_safe_retriever.py`
- `backend/tests/integration/test_candidate_portal_bot_chat.py`
- `backend/tests/unit/test_candidate_bot_safety_foundation.py`
- `candidate-portal/src/components/shared/CandidateBotChat.tsx`
- `candidate-portal/src/components/shared/CandidateBotChat.test.tsx`
- `candidate-portal/src/pages/CandidateHomePage.tsx`
- `candidate-portal/src/services/candidateBotService.ts`
- `candidate-portal/src/services/candidateBotSessionStorage.ts`
- `candidate-portal/src/services/conversationsService.ts`

## Testes executados

- `APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_candidate_portal_bot_chat.py -q`
- `APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_bot_safety_foundation.py -q`
- `APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_bot_registry.py -q`
- `APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_assistant_intent_service.py -q`
- `APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_ai_intent.py -q`
- `APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_endpoints.py -q`
- `npm --prefix candidate-portal exec vitest run src/components/shared/CandidateBotChat.test.tsx`
- `npm --prefix candidate-portal run build`
- `git diff --check`

## Confirmação do fluxo

`Portal chat -> public candidate endpoint -> ConversationService -> CandidateBotRegistry/guards -> safe response/handoff`

Confirmado:

- candidato consegue enviar mensagem;
- resposta do assistente aparece;
- quick replies funcionam;
- `talk_to_hr` cria handoff real e retorna `handoff_required=true`;
- o retriever candidato continua filtrando conteúdo inseguro;
- nenhuma tool interna/staff foi exposta no fluxo público.

## Riscos restantes

- criação de candidatura com confirmação explícita ainda não foi adicionada;
- LangGraph continua fora do escopo;
- WhatsApp continua fora do escopo;
- fluxo multiagente continua fora do escopo;
- o script agregado `candidate-portal test` continua incluindo validações contratuais públicas mais amplas, independentes deste MVP.

## Próximos passos

- adicionar UI dedicada para confirmação segura antes de qualquer write tool futura;
- evoluir o chat para retomada mais rica de contexto de vaga/unidade;
- preparar integração futura de canais externos sem abrir permissão de tool interna.
