# OP-6H - Risks - Admin do Assistente do Candidato

Data: 2026-06-02
Status: Planejamento. Riscos e mitigações antes de implementar.

## R1 — Vazamento de PII (ALTO, LGPD)

Conversas e falhas contêm dados pessoais; listas/threads podem expor mais do que o
necessário (CPF/telefone, texto livre com números).

- Mitigação: API só devolve máscaras (`cpf_last4`, telefone mascarado); nunca
  `cpf_hash`/`context_json` cru. Sanitização de texto livre (mascara dígitos
  longos). Render no front também mascara. Acesso a PII é logado.

## R2 — Admin reprogramar o fluxo (ALTO, produto/segurança)

Tentação de editar transições/estados pelo painel, criando lógica paralela à engine.

- Mitigação: painel **só** edita conteúdo (`editable_fields`); `next_states` e
  topologia são read-only e ficam na engine. Sem criar/remover estados.

## R3 — IA ultrapassar seu papel (ALTO)

Intenções/IA acabarem decidindo fluxo, reprovação ou contratação.

- Mitigação: AI_GUARDS — IA só sugere; state machine valida; nenhuma ação cria
  pipeline ou decide elegibilidade. Checklist obrigatório por fase.

## R4 — Acoplamento com a engine (MÉDIO)

Endpoints internos de status de sessão podem não existir; introspecção de estados
e emissão de falhas dependem da engine.

- Mitigação: Fase 0 (reconciliação) bloqueante; painel consome endpoints da engine
  em vez de escrever direto; decisões 0.2/0.3 antes de codar.

## R5 — Apagar/alterar histórico ou auditoria (ALTO)

Mutação acidental de mensagens/auditoria quebraria rastreabilidade.

- Mitigação: histórico e `assistant_admin_audit` são **append-only**; nenhum
  endpoint de delete/edit de mensagem; testes garantem ausência dessas rotas.

## R6 — Identificação tratada como autenticação (MÉDIO/ALTO)

Sem OTP, o vínculo `candidate_id` por CPF/WhatsApp é fraco; o painel poderia exibir
dados de candidatura a quem não é o dono.

- Mitigação: sinalizar `identifier_unresolved`; não tratar identificação como
  login; RBAC restrito; **OTP é a próxima proteção recomendada** (abaixo).

## R7 — Regressão no admin existente (MÉDIO)

Nova rota/menu/serviço afetando navegação e `http.ts` compartilhado.

- Mitigação: página isolada (`CandidateAssistantAdminPage`), serviço dedicado, sem
  alterar serviços existentes; smoke do admin após integração.

## R8 — Vazamento de escopo para áreas proibidas (ALTO, processo)

Mexer em candidate-portal, engine, pipeline, CandidateApplication, WhatsApp,
matching ou pré-admissão.

- Mitigação: escopo explícito no DESIGN_BRIEF; WhatsApp desabilitado; revisão de PR
  checa fronteiras; painel só lê a engine.

## R9 — Configuração inválida derrubar o chat (MÉDIO)

Limite de tentativas/expiração/fallback mal configurado quebra a conversa pública.

- Mitigação: validação no PATCH settings; rejeitar valores perigosos; `channels_enabled`
  não aceita whatsapp nesta fase; mudança auditada e reversível.

## R10 — Falhas sem fechamento de ciclo (BAIXO/MÉDIO)

Falhas acumulam sem virar melhoria.

- Mitigação: ação "classificar → criar frase conhecida" (OP-6H-2/3); métrica de
  ocorrências para priorizar.

## Resumo

| Risco | Severidade | Mitigação principal |
| --- | --- | --- |
| R1 PII | Alto | Máscara + sanitização + log de acesso |
| R2 Reprogramar fluxo | Alto | Só conteúdo; topologia read-only |
| R3 IA fora do papel | Alto | AI_GUARDS + checklist |
| R4 Acoplamento engine | Médio | Fase 0 + consumir endpoints |
| R5 Apagar histórico/auditoria | Alto | Append-only, sem delete |
| R6 Identificação ≠ auth | Médio/Alto | OTP + RBAC + flag unresolved |
| R7 Regressão admin | Médio | Página/serviço isolados + smoke |
| R8 Vazamento de escopo | Alto | Escopo explícito + revisão |
| R9 Config inválida | Médio | Validação + auditoria + reversível |
| R10 Falhas sem ciclo | Baixo/Médio | Classificar → frase conhecida |

## Próxima proteção recomendada (OTP)

Antes de qualquer ação que exponha candidatura a partir de identificação no chat,
exigir **OTP** (código enviado ao CPF/WhatsApp informado) para confirmar a posse do
identificador. Só então tratar `candidate_id` como vínculo forte. O painel deve, até
lá, marcar sessões identificadas como "não verificadas" e restringir o que exibe.

## Próxima fase implementável

**OP-6H-1 (Conversas read-only)** após a Fase 0 (reconciliação). É a primeira fatia
de valor, puramente leitura sobre a engine, sem novas tabelas obrigatórias.
