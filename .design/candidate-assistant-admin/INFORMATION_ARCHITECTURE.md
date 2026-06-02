# OP-6H - Information Architecture - Admin do Assistente do Candidato

Data: 2026-06-02
Status: Planejamento

## Localização e navegação

- Rota: `/admin/assistente-candidato`
- Nome no menu: **Assistente do Candidato**
- Área administrativa existente (mesma navegação de `AdminPage` /
  `EstruturaOperacionalPage` / `AdminAiProviderCredentialsPage`).
- Uma página com **5 abas** (não 5 itens de menu), estado de aba por query param
  para deep-link e botão "voltar":
  - `?tab=conversas` (default)
  - `?tab=fluxo`
  - `?tab=frases`
  - `?tab=falhas`
  - `?tab=config`

## Visão geral das abas

```
Assistente do Candidato
├── 1. Conversas            (read-only no MVP)         [MVP]
├── 2. Fluxo de perguntas   (leitura da state machine) [depois]
├── 3. Frases e intenções   (mapa frase → intenção)    [depois]
├── 4. Falhas do assistente (revisão + classificação)  [MVP+1]
└── 5. Configurações        (textos, limites, canais)  [futuro]
```

Ordem reflete valor e maturidade: Conversas e Falhas primeiro (observação);
Fluxo, Frases e Config depois (edição de conteúdo, sempre auditada).

---

## Aba 1 — Conversas

- **Objetivo:** acompanhar sessões abertas/concluídas/abandonadas e onde os
  candidatos param.
- **Usuário-alvo:** hr (principal), admin, recruiter (filtrado por vaga).
- **Campos exibidos (lista):**
  - candidato (nome mascarado se identificado; senão "Anônimo")
  - canal (`web` / futuro `whatsapp`)
  - estado atual (label amigável do estado)
  - status da sessão (`active`/`completed`/`abandoned`/`cancelled`)
  - última mensagem (trecho)
  - data da última interação (`last_message_at`)
  - `application_id` (link, se existir)
  - alerta de falha/handoff (badge, se existir)
- **Filtros:** status, estado atual, canal, período, "tem candidatura",
  "tem falha/handoff".
- **Ações (futuras, faseadas):** ver conversa (drawer read-only), marcar para
  acompanhamento do RH, encerrar conversa, reabrir conversa, copiar link/contexto.
- **Endpoints:** `GET /admin/assistant/sessions`,
  `GET /admin/assistant/sessions/{id}`,
  `GET /admin/assistant/sessions/{id}/messages`.
- **Riscos:** vazar PII na lista; expor conversas de candidatos a recruiters sem
  vínculo. Mitiga com mascaramento + RBAC.
- **O que NÃO fazer:** editar/apagar mensagens; expor CPF/telefone completos.
- **Prioridade:** **MVP** (ver/listar). Ações de estado em OP-6H-4.

## Aba 2 — Fluxo de perguntas

- **Objetivo:** mostrar a state machine de forma legível (os 9 estados, ordem,
  prompt e quick replies de cada um).
- **Usuário-alvo:** admin (e hr em leitura).
- **Campos por estado:** `state_key`, ordem, texto da pergunta, texto auxiliar,
  quick replies permitidas, fallback do estado, limite de tentativas, ativo.
- **Ações:** somente leitura no MVP. Edição **futura** apenas de: texto da
  pergunta, texto auxiliar, quick replies, fallback, limite de tentativas —
  **nunca transições/topologia** (continuam no backend).
- **Endpoints:** `GET /admin/assistant/states`.
- **Riscos:** dar a impressão de que dá para reprogramar o fluxo; edição de quick
  replies inválidas quebrar a conversa.
- **O que NÃO fazer:** editar transições; criar estados; remover estados.
- **Prioridade:** leitura **depois**; edição de conteúdo **futuro** (OP-6H-3).

## Aba 3 — Frases e intenções

- **Objetivo:** cadastrar/revisar frases comuns e mapear para intenções.
- **Usuário-alvo:** admin.
- **Exemplos de frase:** "quero emprego", "tem vaga?", "quero trabalhar de
  frentista", "moro perto da BR", "qualquer posto serve".
- **Intenções (catálogo):** `job_search_interest`, `choose_location`,
  `choose_unit`, `choose_function`, `choose_shift`, `talk_to_hr`.
- **Campos:** frase, `normalized_phrase`, intenção, ativo, timestamps.
- **Ações (futuras):** criar/editar/desativar frase; revisar sugestão vinda de
  uma falha.
- **Endpoints:** `GET/POST /admin/assistant/intents`,
  `PATCH /admin/assistant/intents/{id}`.
- **Riscos:** transformar isto em "IA decide fluxo". Mitiga: o interpretador só
  **sugere** intenção; a **state machine valida** a transição.
- **O que NÃO fazer:** deixar a intenção sozinha disparar transição/decisão.
- **Prioridade:** **depois** (alimenta a interpretação futura).

## Aba 4 — Falhas do assistente

- **Objetivo:** mostrar mensagens que o bot não entendeu / onde o candidato travou.
- **Usuário-alvo:** hr e admin.
- **Campos:** mensagem original (sanitizada), estado em que ocorreu, nº de
  tentativas, sessão/candidato (se seguro, mascarado), data/hora, possível
  classificação, resolvido/não resolvido (`status`).
- **Ações (futuras):** classificar como localidade/função/filial/turno; mandar
  para RH; adicionar frase conhecida (cria entrada em "Frases e intenções").
- **Endpoints:** `GET /admin/assistant/failures`,
  `PATCH /admin/assistant/failures/{id}`.
- **Riscos:** PII em texto livre da mensagem; classificação virar decisão de fluxo.
- **O que NÃO fazer:** apagar a falha/histórico; reprovar candidato.
- **Prioridade:** **MVP+1** (OP-6H-2).

## Aba 5 — Configurações

- **Objetivo:** configurar parâmetros seguros do assistente.
- **Usuário-alvo:** admin.
- **Configurações:** assistente ativo/inativo; mensagem inicial; mensagem de
  fallback; limite de tentativas por estado; quando oferecer "Falar com RH";
  expiração da sessão; exigir OTP (futuro); canais habilitados (web / futuro
  whatsapp).
- **Ações:** editar valores (auditado). WhatsApp permanece desabilitado nesta fase.
- **Endpoints:** `GET /admin/assistant/settings`,
  `PATCH /admin/assistant/settings/{key}`.
- **Riscos:** configuração inválida derrubar o chat; habilitar canal sem engine
  pronta.
- **O que NÃO fazer:** permitir IA reprovar/contratar; criar transição; apagar
  auditoria.
- **Prioridade:** **futuro** (OP-6H-3+).

---

## Fluxos de usuário principais

1. **Acompanhar:** hr abre Conversas → filtra `abandoned`/estado → vê conversa →
   marca para acompanhamento / encaminha ao RH.
2. **Diagnosticar gargalo:** admin abre Conversas, agrupa por estado atual → vê
   onde os candidatos param → cruza com Falhas.
3. **Melhorar:** hr abre Falhas → classifica uma falha frequente → "adicionar
   frase conhecida" cria entrada em Frases e intenções.
4. **Ajustar conteúdo:** admin abre Fluxo → edita texto/quick replies/fallback de
   um estado (futuro) → salva (auditado).
5. **Configurar:** admin abre Configurações → ajusta limites, mensagem de
   fallback, quando oferecer "Falar com RH".

## Mascaramento de PII na navegação

- Nome: exibir primeiro nome + inicial, ou "Candidato #curto-id".
- CPF: apenas `cpf_last4` (ex.: `•••-••-4725`).
- Telefone: mascarado (ex.: `(11) ••••-8888`).
- Mensagem livre em Falhas: passar por sanitização que remove sequências de
  dígitos longas (possível CPF/telefone) antes de exibir.
