# Audit Report — Candidate Bot Readiness

**Data**: 2026-06-17
**Branch**: save/behavioral-ai-and-wips
**Auditor**: Claude Code (claude-sonnet-4-6)
**Classificação**: PARCIALMENTE PRONTO

---

## Classificação Final

### PARCIALMENTE PRONTO

O sistema está significativamente mais avançado do que uma instalação típica. O motor de conversa (ConversationService), o modelo de domínio (CandidateApplicationModel com `source='bot'`), o RAG com suporte a pgvector, as tools de IA, o controlo de permissões e até o flow de coleta de leads já existem como código de produção. Faltam pontas específicas para tornar um bot de triagem seguro e completo: (1) handoff humano real com notificação ao RH, (2) RAG com separação de audiência candidato vs. RH, (3) SupervisorAgent LangGraph ainda é um stub TODO, (4) o endpoint POST /public/candidates/apply aceita apenas multipart/form-data com arquivo obrigatório, impedindo o bot de criar candidaturas via JSON puro.

---

## Resumo Executivo

O projeto dispõe de um motor de conversa de estado finito completamente implementado em `ConversationService` com 14 estados (`IDENTIFY`, `VERIFY_OTP`, `CHOOSE_LOCATION`, `CHOOSE_UNIT_OR_ANY`, `CHOOSE_FUNCTION`, `CHOOSE_SHIFT`, `SHOW_JOBS`, `COLLECT_RESUME`, `AWAITING_RESUME_UPLOAD`, `COLLECT_LEAD_NAME`, `COLLECT_LEAD_WHATSAPP`, `COLLECT_LGPD_CONSENT`, `CONFIRM_APPLICATION`, `DONE`). Esse motor já suporta dois canais (`web`, `whatsapp`), cria `CandidateApplicationModel` com `source='bot'` ou `source='whatsapp'`, e preserva `preferred_unit_id`. A máquina de estados foi desenhada especificamente para a triagem de candidatos.

O módulo `ai_orchestration` contém tools read-only reais para vagas (`job_tools`), candidatos (`candidate_tools`) e pipeline (`pipeline_tools`), todas com guard de permissões (`ToolPermissionGuard`). O RAG está implementado com `pgvector`, embeddings via Gemini, `AIKnowledgeDocumentModel` com campo `visibility` e `allowed_roles_json`, `TextIngestionService` e `RagAnswerService` com redação de PII. O `CandidateAssistantIntentService` usa Gemini para interpretar mensagens livres e mapeá-las em tokens determinísticos — a camada AI do bot já existe.

As lacunas críticas são: (a) o `SupervisorAgent` LangGraph é um arquivo com apenas um comentário `# TODO: AI-AGENT-1`, ou seja, a orquestração multiagente não existe; (b) não há filtro de `audience='candidate'` na base de conhecimento para garantir que apenas documentos públicos sejam usados pelo bot; (c) o fluxo de handoff `talk_to_hr` está reconhecido como intent mas não tem ação concreta de notificação RH; (d) o endpoint público de candidatura requer arquivo PDF obrigatório, o que bloqueia um bot que queira criar uma candidatura apenas com dados textuais.

A segurança LGPD está bem implementada: `lgpd_consent` é validado antes de qualquer persistência tanto no `ConversationService` (estado `COLLECT_LGPD_CONSENT`) quanto no `PublicApplicationService`. Dados sensíveis (CPF, salário, `internal_notes`) são explicitamente excluídos das tools de IA. O CPF nunca é armazenado no `context_json` da sessão; apenas `cpf_last4` é mantido.

---

## Estado Atual — Portal e Candidatura

**Endpoints públicos existentes**:
- `GET /public/jobs` — lista vagas publicadas
- `GET /public/jobs/{job_id}` — detalhe da vaga com `job_units` (unidades com id, city, state, address)
- `POST /public/candidates/apply` — cria candidatura (multipart/form-data, arquivo PDF obrigatório)
- `GET /public/candidates/check-exists` — compatibilidade, sempre retorna ok (sem enumerar CPF/email)
- `POST /conversations` — cria sessão de conversa (sem autenticação)
- `POST /conversations/{session_id}/messages` — envia mensagem
- `GET /conversations/{session_id}` — estado da sessão
- `POST /conversations/{session_id}/upload` — upload de currículo via conversa

**Dados coletados na candidatura pública**:
`full_name`, `cpf`, `email`, `phone`, `city`, `state`, `salary_expectation`, `desired_contract_type`, `works_at_marajo_group`, `job_id` (opcional), `password`, `lgpd_consent` (obrigatório), `preferred_unit_id` (opcional/obrigatório se vaga tem múltiplas unidades), arquivo PDF (obrigatório).

**source='bot' no constraint**: CONFIRMADO. `APPLICATION_SOURCES = ("web_portal", "bot", "whatsapp", "staff")` com `CheckConstraint` no banco. O `ConversationService._application_source()` mapeia `channel='web'` para `'bot'` e `channel='whatsapp'` para `'whatsapp'`.

**preferred_unit_id via JSON/API**: O endpoint `POST /public/candidates/apply` aceita `preferred_unit_id` como campo de formulário (`Form(default=None)`). O bot pode enviar via multipart/form-data. Não há endpoint JSON puro para criação de candidatura sem arquivo — **limitação crítica para bot que não quer exigir PDF**.

**Criação/reuso de candidato**: O `PublicApplicationService.apply()` busca candidato por CPF e email. Se encontrado e senha correta: reusa; se novo: cria com `application_source='bot'`. O `ConversationService._create_lead_candidate_and_application()` cria candidatos com `application_source='bot'` diretamente.

**LGPD**: Obrigatório em dois pontos: (1) `PublicApplicationService.apply()` levanta `ValidationException` se `lgpd_consent=False`; (2) `ConversationService` coleta `COLLECT_LGPD_CONSENT` antes de criar candidato, e não cria `CandidateApplication` sem `lgpd_consent=True` no contexto.

**Upload de currículo**: O endpoint público exige arquivo PDF (`File(...)`). O `ConversationService` suporta upload via `POST /conversations/{session_id}/upload` e resume pode ser omitido (`skip_resume`). URL externa de currículo: não suportada diretamente.

---

## Estado Atual — Pipeline

**Como a candidatura entra no pipeline**: O `PublicApplicationService.apply()` cria `CandidateJobPipelineModel` com `stage='entry'` e `source='manual'` quando `job_id` é fornecido. O `ConversationService._sync_application()` sincroniza `CandidateApplicationModel` mas **não cria pipeline diretamente** — a candidatura fica em `status='started'/'submitted'` sem pipeline até que o RH a mova.

**Eventos/log de ação**: `CandidateJobPipelineEventModel` existe para registrar transições. `_sync_application()` não gera eventos de pipeline; os eventos são gerados na movimentação de estágio pelo `PipelineService`.

**Notas/resumo de conversa no pipeline**: Não há campo direto. `CandidateJobPipelineModel` tem `notes` no model, mas o bot não persiste notas de conversa no pipeline. O `context_json` da sessão persiste o histórico de intenções na tabela `conversation_sessions`.

**Handoff para RH**: O intent `talk_to_hr` é reconhecido pelo `CandidateAssistantIntentService` e mapeado como `should_handoff=True`, mas **a ação de notificação ao RH não está implementada**. No `ConversationService`, `talk_to_hr` não tem handler específico — cai no fluxo padrão.

**assigned_to/recruiter**: Não existe campo `assigned_to` ou `recruiter_id` no `CandidateJobPipelineModel`. O responsável pela triagem não é persistido por candidatura no pipeline.

---

## Estado Atual — IA / RAG / Tools

**Módulo `ai_orchestration`** existe com estrutura completa:

| Componente | Status |
|---|---|
| `job_tools.py` | Implementado — read-only, `can_view_jobs` |
| `candidate_tools.py` | Implementado — read-only, `can_view_candidates`, CPF/salary/password excluídos |
| `pipeline_tools.py` | Implementado — read-only, `can_view_pipeline`, notes internas excluídas |
| `knowledge_tools.py` | Implementado — busca vetorial via `PostgresVectorRetriever` |
| `admission_tools.py` | Implementado |
| `ToolPermissionGuard` | Implementado com `enforce()` pattern |
| `SupervisorAgent` | **STUB — apenas comentário TODO: AI-AGENT-1** |
| `CandidateAgent` | Arquivo existe mas não carregado pelo supervisor |
| `JobAgent` | Arquivo existe mas não carregado pelo supervisor |
| `PipelineAgent` | Arquivo existe mas não carregado pelo supervisor |
| LangGraph (`StateGraph`) | Instalado e usado em `job_ai_draft_graph.py` para draft de vagas |
| RAG (`RagAnswerService`) | Implementado com Gemini, pgvector, redação de PII |
| `TextIngestionService` | Implementado — chunking, hash, deduplicação |
| `CandidateAssistantIntentService` | Implementado — interpreta mensagens livres via Gemini |

**Bot-specific tools ausentes**: Não existe tool de criação de candidatura (`create_application_tool`) que um agente LangGraph poderia chamar com controle granular.

---

## Estado Atual — Conversas e Estado

**Tabelas existentes**:
- `conversation_sessions` — id, candidate_id, application_id, channel (web/whatsapp), current_state (14 valores), status, context_json, last_message_at
- `conversation_messages` — id, session_id, role (candidate/assistant/system), content, message_type, interpreted_intent, metadata_json

**Estado de sessão**: Completamente implementado com `context_json` JSONB. Resume de sessão seguro via `_SAFE_RESUME_CONTEXT_KEYS` (campos sem PII).

**Histórico de triagem**: Mensagens persistidas por sessão. `interpreted_intent` registrado por mensagem para observabilidade.

**Faltante**: Não há tabela de sessões de bot LangGraph (checkpointing de grafo), nem tabela de handoff/escalação com estado pendente de atendimento humano.

---

## Riscos de Segurança / LGPD

1. **RAG sem audiência separada**: `AIKnowledgeDocumentModel` tem campo `visibility` e `allowed_roles_json`, mas não há filtro `audience='candidate'` ou `visibility='public'` aplicado automaticamente pelo bot. Uma base de conhecimento interna de RH (política salarial, critérios de descarte) poderia ser consultada pelo bot se os tipos de fonte não forem segregados corretamente.

2. **context_json pode conter lead_whatsapp e lead_cpf temporariamente**: Embora `_public_context()` os oculte da API, esses dados ficam na coluna `context_json` até o fim da sessão. Uma query direta ao banco expõe dados PII no JSON. Sem TTL de limpeza automático confirmado.

3. **Handoff talk_to_hr sem notificação real**: Candidato pode expressar vontade de falar com humano mas o sistema não garante que o RH seja alertado. Isso pode gerar frustração e abandono sem registro.

4. **Arquivo PDF obrigatório no endpoint público**: Um bot que crie candidaturas via API sem PDF terá que enviar um arquivo placeholder ou usar apenas o `ConversationService`, que não cria pipeline diretamente.

5. **Logs de falha com raw_message**: `AssistantFailureRecorder` persiste `raw_message` e `sanitized_message`. O `sanitise_assistant_text` não foi auditado neste relatório — verificar se CPF/WhatsApp informados errados são sanitizados antes de persistência em `assistant_failures`.

---

## Riscos de Unidade / Posto

**O bot CONSEGUE preservar preferred_unit_id**. A evidência é clara:

- `ConversationSessionModel.context_json` armazena `preference` (nome do posto) e `_derive_application_sync()` resolve `preferred_unit_id` por `normalized_name` no banco.
- `CandidateApplicationModel.preferred_unit_id` é persistido pelo `_sync_application()`.
- O estado `CHOOSE_UNIT_OR_ANY` permite selecionar posto específico ou "qualquer posto da localidade" (`accepts_any_unit_in_location`).
- A validação do `PublicApplicationService.apply()` verifica se `preferred_unit_id` pertence aos `active_unit_ids` da vaga.

**Risco residual**: O `ConversationService` usa `normalized_name` para resolver posto. Se dois postos em localizações diferentes têm nome normalizado igual, pode haver ambiguidade. O filtro por `location_group_id` está presente, mitigando.

---

## Recomendação de Arquitetura

### Fase 1 — Bot MVP via ConversationEngine (já existe, finalizar)
- Implementar handler concreto para intent `talk_to_hr` (notificação via `CommunicationService`)
- Adicionar endpoint JSON puro para criação de candidatura (sem arquivo PDF obrigatório) ou adaptar `ConversationService` para lidar com vaga específica no pipeline diretamente
- Adicionar campo `handoff_requested_at` e `handoff_reason` na `ConversationSessionModel`

### Fase 2 — RAG Público Seguro
- Adicionar `audience` (`candidate` | `staff`) ao `AIKnowledgeDocumentModel`
- Criar `PostgresVectorRetriever` especializado para candidatos que filtra `visibility='public'` + `audience='candidate'`
- Separar pipelines de ingestão: FAQ público vs. políticas internas

### Fase 3 — SupervisorAgent LangGraph
- Implementar `AI-AGENT-1`: `SupervisorAgent` com roteamento para `JobAgent` e `KnowledgeAgent`
- Usar LangGraph `StateGraph` com checkpointing em PostgreSQL (pgvector já habilitado)
- Integrar com `AgentContext` e `ToolPermissionGuard` existentes

### Fase 4 — Tools Write-Safe para Bot
- Criar `create_application_tool` com validação completa de LGPD + preferred_unit_id
- Adicionar `initiate_conversation_tool` para abrir sessão de conversa
- Todas as tools write com `requires_approval=True` (já modelado em `AgentResult`)

### Fase 5 — Handoff Humano Robusto
- Tabela `bot_handoff_requests`: session_id, reason, status, assigned_to, resolved_at
- Integração com `CommunicationService` para notificar recrutador
- Portal RH mostrando sessões com handoff pendente

### Fase 6 — WhatsApp
- Implementar webhook `/integrations/whatsapp/webhook` (diretório `routers/integrations` já existe)
- Adaptar `ConversationService` para receber mensagens via webhook Evolution API / Twilio
- Canal `channel='whatsapp'` já está no enum da tabela

### Fase 7 — Multiagente (pós-MVP)
- Orquestrador com LangGraph multi-agent (LangGraph já instalado: `^0.2.16`)
- Agentes especializados: `CandidateScreeningAgent`, `JobMatchAgent`, `KnowledgeAgent`
- Human-in-the-loop via `requires_approval` (AI-AGENT-5 planejado no supervisor stub)

---

## Comandos Executados

```bash
find backend/src -type f -name "*.py" | sort
find backend/src -type d | sort
# Leitura de arquivos chave:
# - backend/src/interface/api/routers/public.py
# - backend/src/interface/api/routers/public_candidate_portal.py
# - backend/src/application/services/public_application_service.py
# - backend/src/infrastructure/database/models/candidate_application_model.py
# - backend/src/infrastructure/database/models/candidate_model.py
# - backend/src/infrastructure/database/models/conversation_model.py
# - backend/src/infrastructure/database/models/ai_knowledge_models.py
# - backend/src/application/services/conversation_service.py (1866 linhas)
# - backend/src/ai_orchestration/tools/candidate_tools.py
# - backend/src/ai_orchestration/tools/job_tools.py
# - backend/src/ai_orchestration/tools/pipeline_tools.py
# - backend/src/ai_orchestration/tools/knowledge_tools.py
# - backend/src/ai_orchestration/rag/rag_answer_service.py
# - backend/src/ai_orchestration/rag/ingestion_service.py
# - backend/src/ai_orchestration/rag/schemas.py
# - backend/src/ai_orchestration/agents/supervisor_agent.py
# - backend/src/ai_orchestration/core/permission_guard.py
# - backend/src/ai_orchestration/jobs/job_ai_draft_graph.py
# - backend/src/application/services/candidate_assistant_intent_service.py

# Testes (todos falharam por ausência de env vars APP_SECRET_KEY, DATABASE_URL, JWT_SECRET_KEY)
pytest backend/tests/test_public_application.py --no-cov  # ImportError/missing env
pytest backend/tests/unit/ --no-cov  # ImportError/missing env
# As falhas são pré-existentes (ambiente sem .env carregado). Não são regressões deste branch.
```

---

*Worktree status: 10 arquivos modificados no branch save/behavioral-ai-and-wips (backend services, frontend components). Nenhum arquivo de código foi alterado por este audit.*
