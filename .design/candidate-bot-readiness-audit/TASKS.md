# Tasks — Implementação do Bot de Triagem

Data: 2026-06-17 | Branch de referência: save/behavioral-ai-and-wips

**Pré-condição**: Motor de conversa (`ConversationService`), tabelas (`conversation_sessions`, `conversation_messages`), RAG (`RagAnswerService`, `AIKnowledgeDocumentModel`), tools read-only (`job_tools`, `candidate_tools`, `pipeline_tools`) e `CandidateAssistantIntentService` já estão implementados.

---

## Fase 1 — Bot MVP Guiado (Motor de Conversa Existente)

Usar o `ConversationService` existente como motor principal. Sem LangGraph nesta fase.

- [ ] **F1.1** Implementar handler concreto para intent `talk_to_hr` no `ConversationService._intent_to_token()`: retornar token `"talk_to_hr"` e adicionar case no `receive_message()` que aciona `CommunicationService.notify_event(event_type="bot_handoff_requested")` e transiciona para novo estado `HANDOFF_PENDING`.
  - Arquivo: `backend/src/application/services/conversation_service.py`
  - Arquivo: `backend/src/application/services/conversation_state_machine.py` (adicionar estado)
  - Arquivo: `backend/src/infrastructure/database/models/conversation_model.py` (adicionar `HANDOFF_PENDING` ao CheckConstraint)

- [ ] **F1.2** Adicionar estado `HANDOFF_PENDING` ao motor de estado finito com prompt "Seu pedido foi encaminhado para a equipe. Um recrutador entrará em contato em breve."
  - Arquivo: `backend/src/application/services/conversation_state_machine.py`

- [ ] **F1.3** Criar migration para adicionar `HANDOFF_PENDING` ao CheckConstraint da `conversation_sessions.current_state`.
  - Novo arquivo: `backend/alembic/versions/XXXX_add_handoff_pending_state.py`

- [ ] **F1.4** Criar tabela `bot_handoff_requests` com campos: `id`, `session_id`, `candidate_id`, `reason`, `status` (`pending`/`assigned`/`resolved`), `assigned_to` (UUID recruiter), `notes`, `created_at`, `resolved_at`.
  - Novo arquivo: `backend/src/infrastructure/database/models/bot_handoff_model.py`
  - Nova migration: `backend/alembic/versions/XXXX_create_bot_handoff_requests.py`

- [ ] **F1.5** Criar endpoint JSON `/api/v1/public/candidates/apply-minimal` sem arquivo obrigatório para uso pelo bot. Currículo opcional. Mesma lógica do `PublicApplicationService.apply()` mas sem `File(...)`.
  - Arquivo: `backend/src/interface/api/routers/public.py` (novo endpoint) ou novo router
  - Arquivo: `backend/src/application/services/public_application_service.py` (novo método `apply_minimal`)

- [ ] **F1.6** Adicionar campo `handoff_requested_at` e `handoff_reason` (str) à `ConversationSessionModel` para rastreabilidade.
  - Arquivo: `backend/src/infrastructure/database/models/conversation_model.py`
  - Nova migration: incluir em F1.3

- [ ] **F1.7** Criar endpoint de status de candidatura por token anônimo: `GET /api/v1/public/applications/status?token=...`. Token enviado via WhatsApp/email após criação.
  - Novo arquivo ou extensão de `backend/src/interface/api/routers/public.py`

---

## Fase 2 — Estado de Conversa e Histórico Avançado

- [ ] **F2.1** Implementar limpeza síncrona de `lead_cpf` e `lead_whatsapp` do `context_json` imediatamente após uso em `_create_lead_candidate_and_application()` (já ocorre em `context.pop()` mas confirmar que é antes do `flush()`).
  - Arquivo: `backend/src/application/services/conversation_service.py`

- [ ] **F2.2** Adicionar retention policy (scheduled job ou trigger) para limpar `context_json` de sessões `completed`/`abandoned` mais antigas que N dias, removendo campos PII residuais.
  - Novo arquivo: `backend/src/infrastructure/queue/tasks/cleanup_conversation_context.py` (Celery task)

- [ ] **F2.3** Implementar `_create_pipeline_from_conversation()` no `ConversationService`: quando a candidatura está `status='submitted'` e há `job_id` no contexto (selecionado no `SHOW_JOBS`), criar `CandidateJobPipelineModel` automaticamente.
  - Arquivo: `backend/src/application/services/conversation_service.py`

- [ ] **F2.4** Adicionar LangGraph checkpointing para sessiões de bot: tabela `bot_graph_checkpoints` para persistir estado do grafo entre requests.
  - Nova migration: `backend/alembic/versions/XXXX_create_bot_graph_checkpoints.py`
  - Novo modelo: `backend/src/infrastructure/database/models/bot_graph_checkpoint_model.py`

---

## Fase 3 — LangGraph (SupervisorAgent)

- [ ] **F3.1** Instalar dependências adicionais se necessário (langgraph já instalado `^0.2.16`):
  ```bash
  # Verificar se langgraph-checkpoint-postgres está disponível
  ```

- [ ] **F3.2** Implementar `SupervisorAgent` com LangGraph `StateGraph` (AI-AGENT-1):
  - Arquivo: `backend/src/ai_orchestration/agents/supervisor_agent.py` (implementar TODO existente)
  - Usar `job_ai_draft_graph.py` como template de estrutura
  - Nós mínimos: `classify_intent`, `route_to_agent`, `aggregate_response`

- [ ] **F3.3** Criar `CandidateScreeningGraph` como StateGraph separado para triagem:
  - Novo arquivo: `backend/src/ai_orchestration/agents/candidate_screening_graph.py`
  - Estado: `CandidateScreeningState` com campos `session_id`, `messages`, `intent`, `job_matches`, `application_created`
  - Nós: `identify_intent`, `search_jobs`, `collect_preferences`, `validate_lgpd`, `create_application`, `handoff_check`

- [ ] **F3.4** Integrar `CandidateAssistantIntentService` existente como nó do grafo:
  - Arquivo: `backend/src/ai_orchestration/agents/candidate_screening_graph.py`
  - Reusar `CandidateAssistantIntentService` sem modificação

- [ ] **F3.5** Criar endpoint para o bot LangGraph: `POST /api/v1/bot/chat` com `session_id` e `message`.
  - Novo arquivo: `backend/src/interface/api/routers/bot.py`

---

## Fase 4 — RAG Público do Candidato

- [ ] **F4.1** Adicionar campo `audience` ao `AIKnowledgeDocumentModel` com valores `candidate` | `staff` | `both`.
  - Arquivo: `backend/src/infrastructure/database/models/ai_knowledge_models.py`
  - Nova migration

- [ ] **F4.2** Definir `CANDIDATE_SAFE_SOURCE_TYPES` no schema RAG:
  - `faq_candidate`, `benefits_info`, `admission_checklist`, `job_requirements_public`
  - Arquivo: `backend/src/ai_orchestration/rag/schemas.py`

- [ ] **F4.3** Criar `CandidateKnowledgeRetriever` que filtra `visibility='public' AND audience IN ('candidate', 'both')`:
  - Novo arquivo: `backend/src/ai_orchestration/rag/candidate_knowledge_retriever.py`
  - Baseado em `postgres_vector_retriever.py` com filtro extra de audiência

- [ ] **F4.4** Criar pipeline de ingestão separado para documentos públicos do candidato:
  - Novo arquivo: `backend/scripts/seed_candidate_knowledge_base.py`
  - Conteúdo inicial: FAQ de vagas, lista de documentos de admissão, benefícios, processo seletivo

- [ ] **F4.5** Criar tool `search_candidate_knowledge()` que usa `CandidateKnowledgeRetriever`:
  - Arquivo: `backend/src/ai_orchestration/tools/knowledge_tools.py` (adicionar função)
  - Permissão: sem autenticação (público)

---

## Fase 5 — Tools Controladas

- [ ] **F5.1** Criar `search_public_jobs_for_bot()` tool read-only que filtra apenas vagas `status='published'` e retorna `job_units` (unidades com localização):
  - Arquivo: `backend/src/ai_orchestration/tools/job_tools.py` (adicionar função)
  - Nenhuma autenticação necessária (dados públicos)

- [ ] **F5.2** Criar `create_application_for_bot()` tool write-safe com validação LGPD, preferred_unit_id e source='bot':
  - Arquivo: `backend/src/ai_orchestration/tools/bot_tools.py` (novo arquivo)
  - Delegar ao `PublicApplicationService.apply_minimal()` criado na F1.5
  - `requires_approval=False` (criação direta com dados validados)

- [ ] **F5.3** Criar `request_hr_handoff()` tool write-safe que cria registro em `bot_handoff_requests`:
  - Arquivo: `backend/src/ai_orchestration/tools/bot_tools.py`
  - `requires_approval=False` (alerta ao RH é sempre seguro)

- [ ] **F5.4** Criar `get_application_status_for_candidate()` tool que retorna status da candidatura sem dados internos:
  - Arquivo: `backend/src/ai_orchestration/tools/bot_tools.py`
  - Retorna apenas: status, stage, last_updated — sem dados de recrutadores ou notas

---

## Fase 6 — WhatsApp

- [ ] **F6.1** Criar webhook `POST /api/v1/integrations/whatsapp/webhook` para receber mensagens:
  - Diretório `backend/src/interface/api/routers/integrations/` já existe
  - Novo arquivo: `backend/src/interface/api/routers/integrations/whatsapp_webhook.py`
  - Validar HMAC signature (Evolution API ou Twilio)

- [ ] **F6.2** Criar `WhatsAppMessageAdapter` que converte payload webhook para `ConversationMessageCreateRequest`:
  - Novo arquivo: `backend/src/infrastructure/channels/whatsapp_adapter.py`

- [ ] **F6.3** Criar `WhatsAppMessageSender` para enviar respostas do bot:
  - Novo arquivo: `backend/src/infrastructure/channels/whatsapp_sender.py`
  - Configurável via `settings.WHATSAPP_API_URL`, `settings.WHATSAPP_TOKEN`

- [ ] **F6.4** Criar Celery task para processar mensagens WhatsApp de forma assíncrona:
  - Novo arquivo: `backend/src/infrastructure/queue/tasks/process_whatsapp_message.py`

- [ ] **F6.5** Adicionar variáveis ao `settings.py`: `WHATSAPP_API_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`.
  - Arquivo: `backend/src/core/settings.py`

---

## Fase 7 — Multiagent (pós-MVP)

- [ ] **F7.1** Implementar `CandidateAgent` completo com LangGraph:
  - Arquivo: `backend/src/ai_orchestration/agents/candidate_agent.py` (implementar stub)
  - Responsabilidade: triagem, coleta de preferências, match de vagas

- [ ] **F7.2** Implementar `JobAgent` para busca e apresentação de vagas:
  - Arquivo: `backend/src/ai_orchestration/agents/job_agent.py` (implementar stub)

- [ ] **F7.3** Implementar `KnowledgeAgent` para FAQ e documentação pública:
  - Novo arquivo: `backend/src/ai_orchestration/agents/knowledge_agent.py`
  - Usa `CandidateKnowledgeRetriever` (Fase 4)

- [ ] **F7.4** Implementar Human-in-the-loop via `requires_approval=True` no grafo (AI-AGENT-5):
  - Arquivo: `backend/src/ai_orchestration/agents/supervisor_agent.py`
  - Pausa o grafo e aguarda aprovação de recrutador via `bot_handoff_requests`

- [ ] **F7.5** Criar dashboard RH de sessões de bot com handoffs pendentes:
  - Arquivo: `frontend/src/features/bot-workspace/BotHandoffDashboard.tsx`
  - Endpoint: `GET /api/v1/bot/handoffs` (admin-only)
