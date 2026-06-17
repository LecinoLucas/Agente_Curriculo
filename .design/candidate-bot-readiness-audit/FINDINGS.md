# Findings — Candidate Bot Readiness Audit

Data: 2026-06-17 | Branch: save/behavioral-ai-and-wips

---

## FINDING-001 — source='bot' existe no constraint do banco

- **Severidade**: BAIXO (achado positivo)
- **Área**: Backend
- **Arquivos**: `backend/src/infrastructure/database/models/candidate_application_model.py` L11, L17-19
- **Descrição**: `APPLICATION_SOURCES = ("web_portal", "bot", "whatsapp", "staff")` com CheckConstraint. `ConversationService._application_source()` mapeia `channel='web'` para `'bot'` e `channel='whatsapp'` para `'whatsapp'`.
- **Evidência**: `CheckConstraint("source IN ('web_portal', 'bot', 'whatsapp', 'staff')", name="ck_candidate_applications_source")`
- **Impacto no bot**: Zero bloqueio. Candidaturas identificadas corretamente por origem.
- **Recomendação**: Nenhuma. Já implementado.

---

## FINDING-002 — LGPD: consentimento obrigatório antes de criar candidato

- **Severidade**: BAIXO (achado positivo)
- **Área**: Backend | Segurança
- **Arquivos**: `backend/src/application/services/public_application_service.py` L182-183; `backend/src/application/services/conversation_service.py` L778-789
- **Descrição**: Dupla proteção: (1) `PublicApplicationService.apply()` levanta `ValidationException` se `lgpd_consent=False`; (2) `ConversationService` não cria `CandidateModel` sem `context.get("lgpd_consent") is True` no estado `COLLECT_LGPD_CONSENT`.
- **Evidência**: `if not lgpd_consent: raise ValidationException("É necessário aceitar os termos de LGPD para continuar")`
- **Impacto no bot**: Proteção automática. Bot não pode criar candidaturas sem consentimento.
- **Recomendação**: Nenhuma.

---

## FINDING-003 — preferred_unit_id pode ser enviado via API (não só web form)

- **Severidade**: BAIXO (achado positivo)
- **Área**: Portal | Backend
- **Arquivos**: `backend/src/interface/api/routers/public.py` L120; `backend/src/application/services/public_application_service.py` L255-275
- **Descrição**: `POST /public/candidates/apply` aceita `preferred_unit_id: UUID | None = Form(default=None)`. Validação completa: verifica pertencimento à vaga, propaga para `CandidateApplicationModel` e `CandidateJobPipelineModel.operational_unit_id`.
- **Evidência**: `preferred_unit_id: UUID | None = Form(default=None),`
- **Impacto no bot**: Bot pode enviar preferred_unit_id capturado no estado `CHOOSE_UNIT_OR_ANY`.
- **Recomendação**: Nenhuma.

---

## FINDING-004 — Tabelas de conversa existem e são robustas

- **Severidade**: BAIXO (achado positivo)
- **Área**: Conversa
- **Arquivos**: `backend/src/infrastructure/database/models/conversation_model.py`; `backend/src/application/services/conversation_service.py` (1866 linhas)
- **Descrição**: `conversation_sessions` (14 estados, 2 canais, context_json, LGPD, OTP) e `conversation_messages` (role, interpreted_intent) implementadas com motor de estado finito completo. Migrations existem em `alembic/versions/`.
- **Evidência**: `CONVERSATION_STATES = ("IDENTIFY", "VERIFY_OTP", "CHOOSE_LOCATION", "CHOOSE_UNIT_OR_ANY", "CHOOSE_FUNCTION", "CHOOSE_SHIFT", "SHOW_JOBS", "COLLECT_RESUME", "AWAITING_RESUME_UPLOAD", "COLLECT_LEAD_NAME", "COLLECT_LEAD_WHATSAPP", "COLLECT_LGPD_CONSENT", "CONFIRM_APPLICATION", "DONE")`
- **Impacto no bot**: Motor de triagem pronto para uso direto.
- **Recomendação**: Nenhuma para MVP. Para LangGraph: adicionar checkpointing de grafo.

---

## FINDING-005 — Tools de IA existem e são read-only seguras

- **Severidade**: BAIXO (achado positivo)
- **Área**: IA
- **Arquivos**: `backend/src/ai_orchestration/tools/candidate_tools.py`; `backend/src/ai_orchestration/tools/job_tools.py`; `backend/src/ai_orchestration/tools/pipeline_tools.py`; `backend/src/ai_orchestration/tools/knowledge_tools.py`
- **Descrição**: Tools reais implementadas com `ToolPermissionGuard`, campos sensíveis explicitamente excluídos (CPF, salary_expectation, password_hash, google_sub, internal_notes). Pipeline tools omitem `notes` das transições.
- **Evidência**: Cabeçalho de `candidate_tools.py`: `# Campos NUNCA retornados: cpf, salary_expectation, password_hash, google_sub, internal_notes, lgpd_consent_at...`
- **Impacto no bot**: Tools prontas para agente. Baixo risco de vazamento.
- **Recomendação**: Criar tools write-safe adicionais: `create_application_for_bot`, `initiate_conversation`.

---

## FINDING-006 — RAG implementado mas SEM separação de audiência pública/interna

- **Severidade**: ALTO
- **Área**: RAG | Segurança
- **Arquivos**: `backend/src/infrastructure/database/models/ai_knowledge_models.py` L35-43; `backend/src/ai_orchestration/rag/schemas.py` L37-47; `backend/src/ai_orchestration/tools/knowledge_tools.py`
- **Descrição**: `AIKnowledgeDocumentModel` tem campo `visibility` (default `'internal'`) e `allowed_roles_json`, mas o `PostgresVectorRetriever` não filtra por audiência. `knowledge_tools.search_knowledge()` busca em toda a base sem discriminar candidato vs. RH. `VALID_SOURCE_TYPES` inclui `rh_policy`, `hiring_rules`, `internal_guide`, `ranking_criteria` — todos potencialmente internos.
- **Evidência**: `visibility: Mapped[str] = mapped_column(sa.String(30), nullable=False, server_default=sa.text("'internal'"))` — default é internal, mas sem filtro aplicado automaticamente.
- **Impacto no bot**: Bot candidato pode recuperar documentos internos (critérios de descarte, políticas salariais, guias de RH) se não houver filtro de audiência.
- **Recomendação**: (1) Adicionar enum `audience` ao modelo; (2) Criar `CandidateKnowledgeRetriever` que filtra `visibility='public' AND audience='candidate'`; (3) Nunca expor `rh_policy`/`hiring_rules` ao bot do candidato.

---

## FINDING-007 — SupervisorAgent LangGraph é um STUB vazio

- **Severidade**: ALTO
- **Área**: IA
- **Arquivos**: `backend/src/ai_orchestration/agents/supervisor_agent.py`
- **Descrição**: O arquivo contém apenas docstring e `# TODO: AI-AGENT-1 — Implementar SupervisorAgent com LangGraph`. Os arquivos `candidate_agent.py`, `job_agent.py`, `pipeline_agent.py` existem mas não são orquestrados. LangGraph está instalado e funcional (usado em `job_ai_draft_graph.py`).
- **Evidência**: Conteúdo completo do arquivo (após docstring): `# TODO: AI-AGENT-1 — Implementar SupervisorAgent com LangGraph`
- **Impacto no bot**: Bot multiagente LangGraph não pode ser construído sem o supervisor. `ConversationService` é a única orquestração ativa.
- **Recomendação**: Implementar `AI-AGENT-1` como prioridade, usando `job_ai_draft_graph.py` como template.

---

## FINDING-008 — Handoff humano (talk_to_hr) não tem ação concreta

- **Severidade**: ALTO
- **Área**: Handoff
- **Arquivos**: `backend/src/application/services/conversation_service.py` L145-167, L1076-1110; `backend/src/application/services/candidate_assistant_intent_service.py`
- **Descrição**: Intent `talk_to_hr` é reconhecido pelo AI intent parser (via Gemini) e mapeado como `should_handoff=True`. Aparece em `_AI_INTENTS_BY_STATE` para todos os estados principais. Porém em `_intent_to_token()`, `talk_to_hr` retorna `None` — cai para fallback determinístico sem ação. Sem notificação, sem registro, sem alerta ao RH.
- **Evidência**: `# _intent_to_token: nenhum case para talk_to_hr → retorna None implicitamente`; `"CHOOSE_LOCATION": ("choose_location", "talk_to_hr", "help", "unclear")` — reconhecido mas sem handler.
- **Impacto no bot**: Candidatos que pedem atendimento humano não são escalados. Experiência potencialmente frustrante.
- **Recomendação**: (1) Tabela `bot_handoff_requests`; (2) Mapear `talk_to_hr` para token que aciona `CommunicationService.notify_event('bot_handoff_requested')`; (3) Estado `HANDOFF_PENDING`.

---

## FINDING-009 — Endpoint público exige arquivo PDF obrigatório

- **Severidade**: MÉDIO
- **Área**: Portal | Backend
- **Arquivos**: `backend/src/interface/api/routers/public.py` L121
- **Descrição**: `POST /public/candidates/apply` usa `resume_file: UploadFile = File(...)` — obrigatório sem default. Um bot que queira criar candidatura com vaga específica via endpoint público precisará enviar PDF. O `ConversationService` cria candidaturas sem PDF mas `job_id=None` (sem pipeline).
- **Evidência**: `resume_file: UploadFile = File(...),  # obrigatório`
- **Impacto no bot**: Bot que tente criar candidatura com vaga específica sem PDF terá erro 422. Contorno via `ConversationService` não associa ao pipeline automaticamente.
- **Recomendação**: Criar endpoint JSON `/api/v1/public/candidates/apply-minimal` sem arquivo, com currículo opcional em segundo momento.

---

## FINDING-010 — context_json armazena PII temporários (lead_cpf, lead_whatsapp)

- **Severidade**: MÉDIO
- **Área**: Segurança | LGPD
- **Arquivos**: `backend/src/application/services/conversation_service.py` L490-497, L1832-1850
- **Descrição**: Durante o fluxo de lead não identificado, `context_json` armazena `lead_cpf` e `lead_whatsapp` temporariamente. `_public_context()` os exclui da API, mas os dados ficam no banco até `_create_lead_candidate_and_application()` removê-los. Sem TTL automático de limpeza.
- **Evidência**: `context["lead_cpf"] = normalized` / `context.pop("lead_cpf", None)` — removido só após criação do candidato.
- **Impacto no bot**: CPF e WhatsApp em texto claro no `context_json` da `conversation_sessions` enquanto sessão está ativa. Acesso direto ao banco expõe PII.
- **Recomendação**: Limpeza síncrona imediata após uso; considerar criptografia de campos PII no JSON; retention policy para sessões abandonadas.

---

## FINDING-011 — Separação pública vs. interna no RAG incompleta (sem audience explícito)

- **Severidade**: MÉDIO
- **Área**: RAG
- **Arquivos**: `backend/src/ai_orchestration/rag/schemas.py` L37-47; `backend/src/infrastructure/database/models/ai_knowledge_models.py` L27-43
- **Descrição**: Embora `visibility` e `allowed_roles_json` existam, não há valor `'candidate'` definido para audiência. `VALID_SOURCE_TYPES` inclui `rh_policy`, `hiring_rules`, `internal_guide`, `ranking_criteria` — tipos claramente internos sem distinção programática.
- **Evidência**: `VALID_SOURCE_TYPES = frozenset({"rh_policy", "hiring_rules", "ats_guide", "pre_admission_docs", ...})` — sem separação de audiência.
- **Impacto no bot**: Sem mapeamento claro de quais source_types são públicos, há risco de configuração errada ao popular a base de conhecimento do bot.
- **Recomendação**: Documentar e codificar quais `source_types` são `audience=candidate` vs. `audience=staff`. Criar `CANDIDATE_SAFE_SOURCE_TYPES` frozenset para uso no retriever do bot.

---

## FINDING-012 — LangGraph instalado e funcional (infraestrutura pronta)

- **Severidade**: BAIXO (achado positivo)
- **Área**: IA
- **Arquivos**: `backend/pyproject.toml` L29; `backend/src/ai_orchestration/jobs/job_ai_draft_graph.py`
- **Descrição**: `langgraph = "^0.2.16"` e `langchain-core = "^0.2.39"` nas dependências de produção. `StateGraph` funcional em `job_ai_draft_graph.py` com nós, transições e integração com `AIServiceFactory`.
- **Evidência**: `from langgraph.graph import StateGraph, START, END` / `workflow = StateGraph(JobAiDraftState)`
- **Impacto no bot**: Nenhuma instalação adicional necessária. LangGraph pronto para novo grafo de triagem.
- **Recomendação**: Usar `job_ai_draft_graph.py` como template para `CandidateScreeningGraph`.

---

## FINDING-013 — Logs de falha armazenam raw_message (risco PII potencial)

- **Severidade**: MÉDIO
- **Área**: Segurança | LGPD
- **Arquivos**: `backend/src/application/services/conversation_service.py` L1680-1711
- **Descrição**: `AssistantFailureRecorder.record_failure()` persiste `raw_message` além de `sanitized_message`. Para estados `IDENTIFY`/`VERIFY_OTP`, o raw é substituído por `"[otp omitido]"` corretamente. Para outros estados (`CHOOSE_LOCATION`, `CHOOSE_FUNCTION`), o input original do candidato é armazenado.
- **Evidência**: `await self._failure_recorder.record_failure(..., raw_message=raw_message, sanitized_message=sanitize...)`
- **Impacto no bot**: Se candidato incluir PII inadvertidamente em mensagem de localidade ou função, fica em `assistant_failures`.
- **Recomendação**: Avaliar necessidade do `raw_message` em estados não-identificação. Considerar armazenar apenas `sanitized_message`.

---

## FINDING-014 — Sem endpoint de status de candidatura por token anônimo

- **Severidade**: MÉDIO
- **Área**: Portal
- **Arquivos**: `backend/src/interface/api/routers/public.py`
- **Descrição**: Não há endpoint `/public/applications/status` para candidato verificar status sem login. O portal exige autenticação (cookie de sessão) para `GET /candidate-portal/overview`.
- **Evidência**: Nenhum endpoint público de consulta de status na listagem de routers.
- **Impacto no bot**: Bot pode criar candidatura mas não pode informar status ao candidato sem autenticação.
- **Recomendação**: Endpoint com magic link/token enviado por WhatsApp após criação da candidatura.

---

## FINDING-015 — ConversationService não cria pipeline diretamente

- **Severidade**: BAIXO
- **Área**: Pipeline | Conversa
- **Arquivos**: `backend/src/application/services/conversation_service.py` L1352-1355
- **Descrição**: `_sync_application()` cria `CandidateApplicationModel` com `job_id=None`. O comentário explicita: "the chat never selects a job → no pipeline coupling". O estado `SHOW_JOBS` existe mas não associa candidatura a uma vaga específica no pipeline.
- **Evidência**: `job_id=None,  # the chat never selects a job → no pipeline coupling`
- **Impacto no bot**: Candidaturas de conversa ficam sem pipeline até RH agir manualmente. Bot que coleta preferência de função/turno não cria pipeline automaticamente.
- **Recomendação**: Implementar `_create_pipeline_from_conversation()` quando `job_id` disponível no contexto e candidatura `status='submitted'`.
