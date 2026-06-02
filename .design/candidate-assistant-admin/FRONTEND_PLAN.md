# OP-6H - Frontend Plan - Admin do Assistente do Candidato

Data: 2026-06-02
Status: Planejamento. Nenhum componente criado nesta fase.

## App e padrões

- Vive no app **`frontend`** (staff/admin), **não** no `candidate-portal`.
- Página única com abas, padrão `EstruturaOperacionalPage.tsx`.
- Serviço dedicado em `frontend/src/services/`, padrão `operationalMasterService.ts`
  / `auditLogsService.ts`, usando o cliente central `http.ts`.
- Estado de aba por query param (deep-link), como no admin atual.
- Tabela + drawer de detalhe, padrão `CandidaturasPage`/`PipelinePage`.

## Arquivos propostos (quando implementar)

```
frontend/src/pages/
  CandidateAssistantAdminPage.tsx          # container com 5 abas
frontend/src/pages/__tests__/
  CandidateAssistantAdminPage.test.tsx
frontend/src/features/assistant-admin/     # subcomponentes por aba
  ConversationsTab.tsx
  ConversationDetailDrawer.tsx
  FlowStatesTab.tsx
  IntentsTab.tsx
  FailuresTab.tsx
  AssistantSettingsTab.tsx
frontend/src/services/
  assistantAdminService.ts                 # chama /api/v1/admin/assistant/*
frontend/src/services/__tests__/
  assistantAdminService.test.ts
```

Rota registrada na navegação admin: `/admin/assistente-candidato`. Item de menu
e rota protegidos por RBAC.

## Aba 1 — Conversas (MVP, read-only)

- Tabela: candidato (mascarado), canal, estado atual, status, última mensagem,
  data, candidatura, badges de falha/handoff.
- Filtros no topo (status, estado, canal, período, tem candidatura, tem falha).
- Linha → `ConversationDetailDrawer` (thread read-only, mensagens sanitizadas).
- Ações de estado (flag/close/reopen) chegam em OP-6H-4, com confirmação + toast
  de auditoria.

## Aba 2 — Fluxo de perguntas (read-only → edição futura)

- Lista/diagrama dos 9 estados, com prompt, helper, quick replies, fallback,
  limite de tentativas, ativo.
- MVP: somente leitura. Edição futura restrita a `editable_fields`; `next_states`
  sempre read-only.

## Aba 3 — Frases e intenções (futuro)

- Tabela editável: frase, intenção (select do catálogo), ativo.
- Form criar/editar; busca por frase; filtro por intenção.
- Deixar claro na UI que isto **sugere**, não decide fluxo.

## Aba 4 — Falhas do assistente (MVP+1)

- Tabela: mensagem (sanitizada), estado, tentativas, sessão/candidato (mascarado),
  data, sugestão, status.
- Ação "Classificar" → modal (localidade/função/filila/turno/RH) que pode criar
  frase conhecida (Aba 3) e/ou encaminhar ao RH.
- Feedback explícito: classificar **não** decide nada sobre o candidato.

## Aba 5 — Configurações (futuro)

- Form: assistente ativo (toggle), mensagem inicial/fallback (textarea), limite de
  tentativas (numérico), "oferecer Falar com RH após N", expiração (numérico),
  exigir OTP (toggle desabilitado/placeholder), canais (web on; whatsapp
  desabilitado).
- Limites validados contra `aiLimitsService`.

## Acessibilidade, responsividade, PII

- Tabelas com cabeçalho fixo e versão mobile em cards (padrão atual).
- Drawer com foco preso e fechável por ESC.
- Ações irreversíveis/sensíveis (encerrar/encaminhar) com confirmação.
- **PII sempre mascarada na renderização**; nunca renderizar CPF/telefone
  completos mesmo que cheguem por engano — o serviço também filtra.

## Entrega faseada (frontend)

1. **OP-6H-1**: Conversas (lista + detalhe read-only).
2. **OP-6H-2**: Falhas (lista + classificar).
3. **OP-6H-3**: Configurações + edição de conteúdo dos estados; Frases/intenções.
4. **OP-6H-4**: ações de handoff/close/reopen nas Conversas.
5. **OP-6H-5**: visão de auditoria administrativa.

## Testes

- Serviço: mock de `http.ts`, cobrir cada endpoint, paginação e erros.
- Página: render por aba, filtros, confirmação de ações, estados vazio/erro, e
  **asserção de que PII completa nunca aparece**.
- Sem chamadas reais de IA nos testes.
