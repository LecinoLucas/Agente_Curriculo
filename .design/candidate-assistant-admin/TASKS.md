# OP-6H - Tasks - Admin do Assistente do Candidato

Data: 2026-06-02
Status: Backlog de planejamento. Vertical slices (back + front + teste por fatia).
Nada implementável nesta fase (somente docs).

## Fase 0 — Reconciliação (bloqueante)

- [ ] **OP-6H-0.1** Confirmar com a engine os endpoints internos de status de
      sessão (close/reopen/flag) ou definir que o painel os solicita à engine.
- [ ] **OP-6H-0.2** Decidir origem dos `states` (introspecção da state machine vs.
      tabela de conteúdo editável).
- [ ] **OP-6H-0.3** Decidir `assistant_failures`: tabela emitida pela engine ou
      view derivada de `conversation_messages`.
- [ ] **OP-6H-0.4** Fonte única dos limites de IA (`aiLimitsService`).
- [ ] **OP-6H-0.5** RBAC por aba/ação confirmado (admin/hr/recruiter/viewer).
- [ ] **OP-6H-0.6** Política de mascaramento/sanitização de PII revisada com
      segurança/LGPD.

## OP-6H-1 — Conversas read-only (MVP)

- [ ] **1.1** Backend: `GET /admin/assistant/sessions` (filtros + paginação,
      candidato mascarado).
- [ ] **1.2** Backend: `GET /admin/assistant/sessions/{id}` (resumo mascarado).
- [ ] **1.3** Backend: `GET /admin/assistant/sessions/{id}/messages`
      (thread + sanitização).
- [ ] **1.4** Frontend: `assistantAdminService` (métodos de sessão).
- [ ] **1.5** Frontend: `CandidateAssistantAdminPage` + `ConversationsTab` +
      `ConversationDetailDrawer`.
- [ ] **1.6** Testes: serviço (mock http) + página (lista, filtros, PII mascarada).

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
