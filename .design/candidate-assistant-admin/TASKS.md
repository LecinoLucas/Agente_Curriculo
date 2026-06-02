# OP-6E - Tasks - Admin do Assistente do Candidato

Data: 2026-06-01
Status: Backlog de planejamento. Nada implementável até OP-6B publicar o
Conversation Engine. Tarefas em vertical slices (back + front + teste por fatia).

## Fase 0 - Reconciliação (bloqueante)

- [ ] **OP-6E-0.1** Confirmar com OP-6B o esquema real de `conversation_sessions`
      e `conversation_messages` (nomes, status, campos).
- [ ] **OP-6E-0.2** Confirmar quais endpoints de sessão OP-6B já expõe
      (listar, detalhe, abandon, handoff).
- [ ] **OP-6E-0.3** Decidir: conteúdo dos estados é editável aqui ou só em OP-6B.
- [ ] **OP-6E-0.4** Decidir: "falhas" é view sobre mensagens ou tabela própria.
- [ ] **OP-6E-0.5** Confirmar fonte de verdade dos limites de IA
      (`aiLimitsService`).
- [ ] **OP-6E-0.6** Confirmar papéis RBAC para cada aba/ação.

## Fase 1 - Slice "Conversas" (read-mostly)

- [ ] **OP-6E-1.1** Backend: `GET /admin/assistant/sessions` (lista + filtros)
      — reusar de OP-6B se existir.
- [ ] **OP-6E-1.2** Backend: `GET /admin/assistant/sessions/{id}` (thread).
- [ ] **OP-6E-1.3** Backend: `POST .../abandon` e `.../handoff` com auditoria
      (ou consumir os de OP-6B).
- [ ] **OP-6E-1.4** Frontend: `candidateAssistantAdminService` (métodos de sessão).
- [ ] **OP-6E-1.5** Frontend: `CandidateAssistantAdminPage` + `ConversationsTab`
      + `ConversationDetailDrawer`.
- [ ] **OP-6E-1.6** Testes: serviço (mock http) + página (lista, filtros, ações).

## Fase 2 - Slice "Falhas do assistente"

- [ ] **OP-6E-2.1** Backend: `GET /admin/assistant/failures` (view/agregação).
- [ ] **OP-6E-2.2** Backend: `POST .../failures/{id}/map` e `.../ignore`
      (cria intenção `from_failure`, auditado).
- [ ] **OP-6E-2.3** Frontend: `FailuresTab` + modal de mapear.
- [ ] **OP-6E-2.4** Testes.

## Fase 3 - Slice "Frases e intenções"

- [ ] **OP-6E-3.1** Migration: `assistant_intents` (VARCHAR+CHECK, sem enum).
- [ ] **OP-6E-3.2** Backend: CRUD `GET/POST/PATCH/DELETE /admin/assistant/intents`.
- [ ] **OP-6E-3.3** Frontend: `IntentsTab` com seletor de localidade/unidade.
- [ ] **OP-6E-3.4** Testes.

## Fase 4 - Slice "Fluxo de perguntas"

- [ ] **OP-6E-4.1** Backend: `GET /admin/assistant/flow/states` (de OP-6B).
- [ ] **OP-6E-4.2** Backend: `PATCH .../flow/states/{key}` se conteúdo editável
      (texto/quick replies/ativo; nunca `next_states`).
- [ ] **OP-6E-4.3** Frontend: `FlowStatesTab` (leitura → edição).
- [ ] **OP-6E-4.4** Testes.

## Fase 5 - Slice "Configurações"

- [ ] **OP-6E-5.1** Migration/config: `assistant_settings`.
- [ ] **OP-6E-5.2** Backend: `GET/PUT /admin/assistant/settings` (rejeitar
      WhatsApp=true; validar limites de IA contra `aiLimitsService`).
- [ ] **OP-6E-5.3** Frontend: `AssistantSettingsTab`.
- [ ] **OP-6E-5.4** Testes.

## Fase 6 - Transversal

- [ ] **OP-6E-6.1** Auditoria: gravar `assistant_admin_audit` em toda mutação
      (ou integrar AuditLogs existente).
- [ ] **OP-6E-6.2** Checklist de AI Guards aprovado (ver AI_GUARDS.md).
- [ ] **OP-6E-6.3** RBAC aplicado e testado por aba/ação.
- [ ] **OP-6E-6.4** Revisão de regressão (ver RISKS.md) e smoke do admin.

## Ordem recomendada de entrega

F0 → F1 → F2 → (F3, F4, F5 em paralelo conforme F0.3/0.4/0.5) → F6 contínuo.

A primeira entrega de valor é **F1 + F2** (acompanhar conversas e revisar falhas),
puramente em cima de leitura do OP-6B.
