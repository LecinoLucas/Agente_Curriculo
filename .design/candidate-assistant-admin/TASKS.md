# OP-6H - Tasks - Admin do Assistente do Candidato

Data: 2026-06-02 (atualizado em OP-6H-F0)
Status: **OP-6H-F0 concluída.** OP-6H-1 pronta para implementação.
Vertical slices (back + front + teste por fatia).

## Fase 0 — Reconciliação ✅ CONCLUÍDA

- [x] **OP-6H-0.1** Endpoints internos de status de sessão: **não existem ainda**;
      o painel consultará diretamente as tabelas em OP-6H-1 (read-only) e criará
      endpoints novos de mutação em OP-6H-4.
- [x] **OP-6H-0.2** Origem dos `states`: introspecção da state machine (`conversation_state_machine.py`);
      conteúdo editável virá de `assistant_settings` (OP-6H-3, migration futura).
- [x] **OP-6H-0.3** `assistant_failures`: **não existe tabela**. OP-6H-2 decidirá:
      tabela nova populada pela engine, ou view derivada de `conversation_messages`.
- [x] **OP-6H-0.4** Limites de IA: `aiLimitsService` já existente; `assistant_settings`
      será a fonte para configurações específicas do assistente (OP-6H-3).
- [x] **OP-6H-0.5** RBAC: `HrRecruiterOrAdmin` para leitura; `AdminOnly` para configurações.
      Dep `HrRecruiterOrAdmin` já existe em `src/interface/api/dependencies.py:92`.
- [x] **OP-6H-0.6** Mascaramento PII: definido em `RECONCILIATION.md` §6.
      `candidates.cpf` é texto puro; sanitização de mensagens obrigatória.

> Ver `RECONCILIATION.md` para o diagnóstico completo.

## OP-6H-1 — Conversas read-only (MVP) — ✅ PRONTA PARA IMPLEMENTAR

Nenhuma migration necessária. Todos os dados existem.

**Backend (novo)**
- [ ] **1.1** `src/interface/api/schemas/admin_assistant_schemas.py`
      Schemas: `AdminSessionListItem`, `AdminSessionDetail`, `AdminMessageItem`,
      `AdminSessionListResponse` (paginado), `AdminContextSummary`.
- [ ] **1.2** `src/application/services/admin_assistant_service.py`
      `AdminAssistantService`: método `list_sessions` (filtros + join candidates/applications/pipeline),
      `get_session` (detalhe mascarado), `list_messages` (sanitização de conteúdo).
- [ ] **1.3** `src/interface/api/routers/admin_assistant.py`
      Router `/admin/assistant`, permissão `HrRecruiterOrAdmin`.
      Endpoints: `GET /sessions`, `GET /sessions/{session_id}`, `GET /sessions/{session_id}/messages`.
- [ ] **1.4** Registrar em `main.py`:
      `app.include_router(admin_assistant.router, prefix=_PREFIX)`
- [ ] **1.5** `tests/integration/test_admin_assistant_sessions.py`
      Testes: listagem, filtros por status/state/channel/date, detalhe, mensagens, PII mascarada.

**Frontend (novo)**
- [ ] **1.6** `frontend/src/services/assistantAdminService.ts`
      Métodos: `listSessions`, `getSession`, `listMessages`.
- [ ] **1.7** `frontend/src/pages/CandidateAssistantAdminPage.tsx` + `ConversationsTab` +
      `ConversationDetailDrawer`.
- [ ] **1.8** Testes frontend: mock http, render por aba, PII mascarada.

## OP-6H-2 — Falhas do assistente (MVP+1)

- [ ] **2.1** Backend: emissão/derivação de `assistant_failures` (decisão 0.3).
- [ ] **2.2** Backend: `GET /admin/assistant/failures` + `PATCH .../{id}`
      (classificar/resolver/encaminhar, auditado).
- [ ] **2.3** Frontend: `FailuresTab` + modal de classificação.
- [ ] **2.4** Testes.

## OP-6H-3 — Configuração de textos e quick replies

- [ ] **3.1** Migration: `assistant_settings` (+ `assistant_intents` se entrar aqui).
- [ ] **3.2** Backend: `GET/PATCH /admin/assistant/settings/{key}`
      (rejeita whatsapp; valida limites).
- [ ] **3.3** Backend: `GET /admin/assistant/states` + edição de conteúdo restrita
      a `editable_fields` (sem topologia).
- [ ] **3.4** Backend: CRUD `assistant_intents`.
- [ ] **3.5** Frontend: `AssistantSettingsTab`, `FlowStatesTab` (edição), `IntentsTab`.
- [ ] **3.6** Testes.

## OP-6H-4 — Handoff para RH

- [ ] **4.1** Backend: `POST sessions/{id}/flag-hr | close | reopen` via engine,
      auditado.
- [ ] **4.2** Frontend: ações na `ConversationsTab`/drawer com confirmação.
- [ ] **4.3** Testes (inclui "nenhuma pipeline criada").

## OP-6H-5 — Auditoria administrativa

- [ ] **5.1** Backend: `assistant_admin_audit` (ou integração AuditLogs) em toda
      mutação, append-only.
- [ ] **5.2** Frontend: visão de auditoria (read-only) filtrável.
- [ ] **5.3** Testes.

## Transversal (todas as fases)

- [ ] **T.1** Checklist de AI Guards aprovado (ver AI_GUARDS.md).
- [ ] **T.2** RBAC aplicado e testado por aba/ação.
- [ ] **T.3** PII nunca exposta (teste de contrato de API e de render).
- [ ] **T.4** Revisão de regressão (ver RISKS.md): página/serviço isolados, sem
      tocar candidate-portal, engine, pipeline, CandidateApplication.

## Ordem recomendada

F0 → OP-6H-1 → OP-6H-2 → OP-6H-3 → OP-6H-4 → OP-6H-5. Primeira entrega de valor:
**OP-6H-1** (acompanhar conversas), puramente leitura sobre a engine.
