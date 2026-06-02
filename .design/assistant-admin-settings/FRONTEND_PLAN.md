# OP-6H-3A — Frontend Plan — Aba Fluxo de perguntas e Configurações

Data: 2026-06-02
Status: **Planejamento.** Nenhum componente implementado nesta fase.
Base: `frontend/src/pages/AssistantAdminPage.tsx` (Tabs: Conversas ✓, Falhas ✓,
**Fluxo** hoje `disabled`). Reusar tokens e componentes existentes (`Card`, `Badge`,
`Dialog`, `Tabs`, `EmptyState`, `SkeletonRows`, `useAsyncState`). **Sem classes
legadas `ui-*`.**

## Estrutura de abas (alvo)

```
[ Conversas ]  [ Falhas ]  [ Fluxo de perguntas ]  [ Configurações ]
```

A aba `fluxo` deixa de ser `disabled` e passa a hospedar o **editor de conteúdo**.
Acrescenta-se a aba **Configurações** (settings globais).

## Serviço (`assistantAdminService.ts`) — métodos a adicionar (fase de impl.)

- `listStates()` → GET `/states`
- `listStateContents()` / `getStateContent(state)` → GET `/state-contents[/{state}]`
- `updateStateContent(state, payload)` → PATCH `/state-contents/{state}`
- `getSettings()` → GET `/settings`
- `updateSetting(key, value)` → PATCH `/settings/{key}`

Tipos espelhando o API_CONTRACT (`AssistantState`, `AssistantStateContent`,
`AssistantQuickReply`, `AssistantSettings`).

## Aba "Fluxo de perguntas"

### Iteração 1 — leitura
- Lista ordenada dos 10 estados (timeline vertical read-only mostrando a topologia:
  `IDENTIFY → … → DONE`), deixando claro que a **ordem/transições não são editáveis**.
- Cada card de estado mostra prompt, helper, fallback, `effective_max_attempts`,
  quick replies (chips). Badge "Sensível" em IDENTIFY/VERIFY_OTP.

### Iteração 2 — edição
- Botão "Editar" abre `Dialog`/drawer com formulário:
  - `prompt_text` (textarea, obrigatório), `helper_text` (textarea opcional),
    `fallback_text` (textarea).
  - `max_attempts` (number input, 1–10; VERIFY_OTP faixa restrita).
  - Editor de **quick replies**: lista de linhas com `label` (input), `position`
    (drag/ordem) e `is_active` (toggle). O `value` é **fixo/escolhido do catálogo**
    (`allowed_quick_reply_values`) — exibido como select desabilitado/limitado, nunca
    texto livre.
  - **Chips de placeholders permitidos** (ex.: `{location_hint}`) com botão "inserir";
    aviso se um placeholder obrigatório for removido.
- Validação client-side espelha a do servidor (não-vazio, placeholders, faixa,
  catálogo) + erro amigável vindo da API.
- Banner de aviso em estados sensíveis ("Alterações aqui afetam segurança/
  anti-enumeração — revise com cuidado"). Mensagens de transição do IDENTIFY são
  exibidas como **somente leitura**.
- "Salvar" desabilitado sem mudança (padrão da Aba Falhas); feedback de sucesso/erro.

## Aba "Configurações"

- Formulário de settings agrupado:
  - **Geral**: `assistant_enabled` (toggle, admin), `welcome_message`,
    `global_fallback_message`, `talk_to_hr_message`.
  - **Tentativas**: `default_max_attempts` (admin), `offer_hr_after_attempts`.
  - **Sessão/Canais**: `session_expiration_minutes` (admin), `channels_enabled`
    (web fixo; **WhatsApp desabilitado com tooltip "em breve"**, não selecionável).
- Campos `is_sensitive` ficam desabilitados para RH (com tooltip "somente admin").
- Cada salvar é por chave (PATCH `/settings/{key}`), com confirmação para
  `assistant_enabled` (desligar o assistente é ação de impacto).

## LGPD / PII no frontend

- Telas de conteúdo **não exibem** dados de candidato; são textos estáticos do
  assistente. Mesmo assim, validar no submit que o admin não inseriu CPF/telefone.
- Nenhum `context_json`, `cpf_hash`, e-mail ou telefone renderizado.

## Acessibilidade / responsivo

- Mesma estratégia da Aba Falhas: tabela/timeline em desktop, cards empilhados em
  mobile; `aria-label` em selects/inputs; foco e teclado no Dialog.

## Testes de frontend (fase de impl.)

- aba Fluxo renderiza os 10 estados na ordem da engine;
- timeline/ordem é read-only (sem controles de reordenar estados);
- editar prompt chama `updateStateContent` com payload correto;
- placeholder obrigatório removido bloqueia submit;
- quick reply só permite `value` do catálogo;
- aba Configurações lê/edita settings; `channels_enabled` não permite WhatsApp;
- setting sensível desabilitado para RH;
- nenhum dado pessoal/`context_json` aparece;
- abas Conversas e Falhas continuam funcionando.
