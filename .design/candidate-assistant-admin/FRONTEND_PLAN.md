# OP-6E - Frontend Plan - Admin do Assistente do Candidato

Data: 2026-06-01
Status: Planejamento. Nenhum componente criado nesta fase.

## Padrões reaproveitados

Seguir convenções já existentes no frontend admin:

- Página única com abas, como `EstruturaOperacionalPage.tsx`.
- Serviço dedicado em `frontend/src/services/`, padrão de
  `operationalMasterService.ts` / `aiLimitsService.ts` / `auditLogsService.ts`.
- Cliente HTTP central `http.ts`.
- Estado de aba via query param (deep-link), como nas páginas admin atuais.
- Tabela + drawer de detalhe, padrão de `CandidaturasPage` / `PipelinePage`.

## Arquivos propostos (quando implementar)

```
frontend/src/pages/
  CandidateAssistantAdminPage.tsx        # página container com 5 abas
frontend/src/pages/__tests__/
  CandidateAssistantAdminPage.test.tsx
frontend/src/components/assistant-admin/  # subcomponentes por aba
  ConversationsTab.tsx
  ConversationDetailDrawer.tsx
  FlowStatesTab.tsx
  IntentsTab.tsx
  FailuresTab.tsx
  AssistantSettingsTab.tsx
frontend/src/services/
  candidateAssistantAdminService.ts       # chama /api/v1/admin/assistant/*
frontend/src/services/__tests__/
  candidateAssistantAdminService.test.ts
```

Rota registrada na navegação admin existente: `/admin/assistente-candidato`.

## Aba 1 - Conversas (entrega 1, read-mostly)

- Tabela: candidato, estado atual, última mensagem, candidatura vinculada, status.
- Filtros no topo (status, estado, canal, período, tem candidatura).
- Linha → abre `ConversationDetailDrawer` com a thread (somente leitura).
- Ações por linha: Ver histórico, Marcar abandonada, Encaminhar para RH.
- Ações de mutação confirmam antes de executar e mostram toast de auditoria.

## Aba 2 - Fluxo de perguntas (entrega 2)

- Lista de estados (state_key, pergunta, quick replies, próximas etapas, ativo).
- Entrega 1: somente leitura. Entrega 2: editar texto/quick replies/ativo.
- `next_states` sempre read-only (lógica de OP-6B).

## Aba 3 - Frases e intenções (entrega 2)

- Tabela editável: frase, intenção, valor, alvo (localidade/unidade), ativo.
- Form de criar/editar com seletor de `location_groups`/`operational_units`
  reaproveitando serviços de cadastro mestre operacional.
- Filtro por tipo de intenção e busca por frase.

## Aba 4 - Falhas do assistente (entrega 1, leitura + ação de mapear)

- Tabela: mensagem não entendida, estado, ocorrências, sugestão, status.
- Ação "Mapear" → modal que cria/atualiza intenção (Aba 3), com `source=from_failure`.
- Ação "Ignorar".
- Feedback claro de que mapear **não** decide nada sobre o candidato.

## Aba 5 - Configurações (entrega 2)

- Form: canal web (toggle), WhatsApp (toggle **desabilitado**/placeholder),
  mensagens padrão (textarea), limites de IA (numéricos), fallback (select).
- Limites de IA validados contra política do `aiLimitsService`.

## Acessibilidade e responsividade

- Tabelas com cabeçalho fixo e versão mobile em cards (padrão das páginas atuais).
- Drawer com foco preso e fechável por ESC.
- Ações destrutivas/irreversíveis (abandonar, encaminhar) com confirmação.

## Economia de token (UX)

- A tela admin **incentiva quick replies**: ao editar estados, destacar que
  respostas rápidas reduzem chamadas de IA.
- A aba Frases/Falhas existe justamente para resolver intenções por **match
  direto**, evitando IA quando possível.

## Entrega faseada (frontend)

1. **F1 (read-mostly)**: Conversas (lista, detalhe, abandon/handoff) + Falhas
   (lista + mapear). Depende só de leitura de OP-6B + endpoints de sessão.
2. **F2 (config)**: Frases/intenções CRUD, Fluxo (edição de conteúdo),
   Configurações.
3. **F3**: melhorias (diagrama de fluxo, agregação avançada de falhas).

## Testes

- Serviço: mock de `http.ts`, cobrir cada endpoint e erros.
- Página: render por aba, filtros, confirmação de ações, estados vazios/erro.
- Sem chamadas reais a IA nos testes.
