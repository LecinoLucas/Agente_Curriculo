# OP-6H - Design Brief - Admin do Assistente do Candidato

Data: 2026-06-02
Fase: OP-6H-PLAN (somente planejamento; nenhum código alterado)
Status: Planejado. Implementável em fases OP-6H-1..5 após aprovação.

> Este documento **supersede** os rascunhos OP-6E-PLAN que existiam nesta pasta.
> A diferença: o Conversation Engine, a identificação segura e a integração com
> CandidateApplication **já foram implementados**, então o plano agora é ancorado
> no schema real, não em suposições.

## Contexto (o que já existe)

- **Portal 2** no `candidate-portal` com chat simples (rota `/portal-2`), integrado
  ao backend real de conversa.
- **Conversation Engine** (`backend`): tabelas `conversation_sessions` e
  `conversation_messages`, state machine de 9 estados, endpoints
  `POST/GET /api/v1/conversations[...]`.
- **Identificação segura** (OP-6F): IDENTIFY resolve `candidate_id` por CPF
  (lookup por `cpf_hash` + fallback) ou WhatsApp (telefone normalizado), sem
  guardar CPF em claro; só `identifier_type`, `cpf_last4`, `identifier_unresolved`
  vão para `context_json`.
- **Integração CandidateApplication** (OP-6E): quando há `candidate_id` seguro e
  dado real coletado, a conversa projeta uma `candidate_applications` (idempotente
  via `conversation_sessions.application_id`), **sem criar pipeline**.
- **Futuro**: bot com IA auxiliar e canal WhatsApp **reaproveitando a mesma
  engine** (não uma lógica paralela).

## Estados reais da state machine

`IDENTIFY → CHOOSE_LOCATION → CHOOSE_UNIT_OR_ANY → CHOOSE_FUNCTION →
CHOOSE_SHIFT → SHOW_JOBS → COLLECT_RESUME → CONFIRM_APPLICATION → DONE`

Status de sessão: `active`, `completed`, `abandoned`, `cancelled`.

## Objetivo

Planejar a tela administrativa **"Assistente do Candidato"** (`/admin/assistente-candidato`)
para que RH/Admin possam:

1. Visualizar conversas (abertas/concluídas/abandonadas).
2. Entender onde os candidatos estão parando (gargalos por estado).
3. Revisar mensagens não compreendidas (falhas do assistente).
4. Acompanhar os estados da state machine (somente leitura da lógica).
5. Configurar textos, quick replies e fallback (conteúdo, não topologia).
6. Preparar handoff para o RH.
7. Manter controle/auditoria sobre o bot.

## Princípios de produto

- **Observar antes de configurar.** A primeira entrega (OP-6H-1) é read-only de
  conversas. Edição vem depois e sempre auditada.
- **A engine manda.** O admin nunca cria transições arbitrárias; a state machine
  permanece controlada pelo backend. O painel edita apenas **conteúdo** (texto,
  quick replies, fallback, limites) — nunca a topologia de estados.
- **IA só sugere.** Frases/intenções alimentam interpretação; a state machine
  valida. IA nunca reprova/contrata, nunca decide fluxo sozinha.
- **Tudo auditável e imutável onde importa.** Histórico de mensagens e auditoria
  de conversa não podem ser apagados nem editados pelo admin.
- **Privacidade por padrão.** CPF e telefone completos nunca aparecem; apenas
  máscaras (`cpf_last4`, telefone mascarado).
- **Um só motor.** WhatsApp futuro consome a mesma engine; o admin trata canais
  como configuração, não como sistemas separados.
- **Reaproveitar o que existe.** Padrões de página/serviço seguem o admin atual
  (`AdminAiProviderCredentialsPage`, `AuditLogsPage`, `EstruturaOperacionalPage`)
  e a infra de AuditLogs/aiLimits.

## Usuários-alvo e papéis

- **admin**: configura e visualiza tudo o que é permitido (sem apagar auditoria).
- **hr**: visualiza conversas e falhas; pode marcar acompanhamento/handoff.
- **recruiter**: visualiza conversas ligadas a candidatura/vaga, se permitido.
- **viewer**: sem acesso, ou read-only muito limitado.

Papéis seguem o RBAC já existente; esta fase não cria papéis novos.

## Escopo desta fase

**Permitido:** criar apenas documentação em `.design/candidate-assistant-admin/`.

**Proibido:** alterar backend, frontend, candidate-portal, pipeline, migrations,
Conversation Engine, CandidateApplication, WhatsApp, matching/IA, pré-admissão;
criar mock; criar dados falsos dos 51 postos.

## Entregáveis (OP-6H-PLAN)

`DESIGN_BRIEF.md`, `INFORMATION_ARCHITECTURE.md`, `DATA_MODEL.md`,
`API_CONTRACT.md`, `FRONTEND_PLAN.md`, `AI_GUARDS.md`, `TASKS.md`, `RISKS.md`.

## Fases futuras (implementáveis)

- **OP-6H-1** — Conversas read-only
- **OP-6H-2** — Falhas do assistente
- **OP-6H-3** — Configuração de textos e quick replies
- **OP-6H-4** — Handoff para RH
- **OP-6H-5** — Auditoria administrativa

## Critério de "pronto para implementar"

- RBAC confirmado por aba/ação.
- Decisão sobre origem do conteúdo dos estados (engine expõe vs. tabela de override).
- Política de mascaramento de PII revisada com segurança/LGPD.
- Tabelas novas (`assistant_*`) aprovadas para migration na fase respectiva.
