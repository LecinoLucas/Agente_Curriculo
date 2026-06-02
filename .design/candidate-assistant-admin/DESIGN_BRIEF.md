# OP-6E - Design Brief - Admin do Assistente do Candidato

Data: 2026-06-01
Fase: OP-6E-PLAN (somente planejamento, sem código)
Status: Planejado. Não implementável antes de OP-6B entregar o Conversation Engine.

## Contexto

O projeto Admissão RH está construindo o **Portal 2**, um portal de candidatos
"leigos" com um **chat** que coleta intenção de vaga em texto livre
("quero vaga de frentista", "qualquer posto em Peritoró").

A fase **OP-6B** roda em paralelo e entregará o **Conversation Engine**:

- `conversation_sessions` (sessão de conversa por candidato/canal)
- `conversation_messages` (mensagens trocadas)
- uma **state machine** que decide as transições do diálogo
- endpoints de conversa para o chat do candidato

Esta fase (OP-6E) **não** constrói o chat nem o engine. Ela planeja a **tela
administrativa** que RH/Admin usarão para **acompanhar e configurar** esse
assistente, em cima do que o OP-6B expõe.

## Objetivo

Definir, em documentação, a futura tela admin "Assistente do Candidato" para que
RH/Admin possam:

1. Acompanhar conversas reais e seu estado.
2. Inspecionar o fluxo de perguntas da state machine.
3. Manter o mapa de frases comuns → intenção esperada.
4. Revisar falhas do assistente (texto não entendido) e propor correções.
5. Configurar canais, limites de IA e mensagens padrão.

## Quem usa

- **RH operacional**: acompanha conversas, encaminha casos, marca abandono.
- **Admin/Configurador**: edita fluxo de perguntas, frases/intenções, mensagens
  padrão e limites de IA.
- **Auditoria**: precisa de rastro de quem alterou o quê e por quê.

Papéis exatos seguem o RBAC já existente no backend; esta fase não cria papéis
novos.

## Princípios de produto

- **Observar antes de configurar**: a primeira entrega útil é só leitura
  (acompanhar conversas e falhas). Edição vem depois.
- **A IA não decide nada irreversível**. Ela só interpreta texto livre e sugere
  intenção. A **state machine** decide transição; a tela admin só configura
  parâmetros, nunca executa decisão de reprovação/aprovação.
- **Botões e respostas rápidas em primeiro lugar**: o desenho favorece "quick
  replies" para o candidato, reduzindo dependência de IA e custo de token.
- **Tudo auditável**: toda ação administrativa (editar estado, mapear frase,
  encaminhar, marcar abandono) gera log.
- **Reaproveitar o que existe**: padrões visuais e de serviço seguem páginas admin
  atuais (ex.: `AdminAiProviderCredentialsPage`, `AuditLogsPage`,
  `EstruturaOperacionalPage`) e o `aiLimitsService`.

## Escopo desta fase

**Permitido**: criar apenas documentação em `.design/candidate-assistant-admin/`.

**Proibido nesta fase**: alterar código, backend, frontend, migrations, OP-6B,
pipeline, `CandidateApplication`, candidate-portal, bot real, WhatsApp,
matching/IA, pré-admissão.

## Relação com outras fases

- **OP-6B (paralela, upstream)**: dona das tabelas `conversation_sessions`,
  `conversation_messages` e da state machine. Esta tela **consome** esses dados;
  não os define nem os altera. Os contratos aqui são **suposições a confirmar**
  com OP-6B antes de implementar.
- **OP-5 / CandidateApplication**: a conversa pode, no futuro, referenciar uma
  candidatura (`candidate_application_id`) apenas como leitura/vínculo. Esta tela
  não cria nem altera candidaturas.

## Entregáveis da OP-6E-PLAN

- `DESIGN_BRIEF.md` (este arquivo)
- `INFORMATION_ARCHITECTURE.md`
- `DATA_MODEL.md`
- `API_CONTRACT.md`
- `FRONTEND_PLAN.md`
- `AI_GUARDS.md`
- `TASKS.md`
- `RISKS.md`

## Critério de "pronto para implementar"

- OP-6B publicou o esquema real de `conversation_sessions` /
  `conversation_messages` e os endpoints de conversa.
- Contratos deste plano reconciliados com o esquema real do OP-6B.
- Papéis RBAC confirmados para cada aba/ação.
