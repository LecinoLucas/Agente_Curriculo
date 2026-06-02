# OP-6H-3A — Risks and Guards

Data: 2026-06-02
Status: **Planejamento.** Riscos da edição de conteúdo do assistente e as guardas
que a fase implementável deve aplicar.

## Regras inegociáveis (herdadas dos AI_GUARDS da OP-6H)

1. IA não decide reprovação/contratação. 2. Painel não cria/move pipeline.
3. Engine é a única fonte do fluxo; painel edita **só conteúdo**. 4. Tudo auditável,
nada apagável. 5. PII completa nunca sai da API/UI. 6. WhatsApp permanece desabilitado.

## Riscos × guardas

### R1 — Edição quebra o avanço da conversa
Prompt vazio, fallback vazio, ou remoção de quick replies essenciais deixa o candidato
preso.
- **Guard:** `prompt_text` obrigatório (não vazio pós-trim); proibido desativar
  **todas** as quick replies de um estado dirigido por botão; engine mantém aceitação
  de texto livre onde já existe; preview antes de salvar.

### R2 — Placeholder corrompido
Trocar `{location_hint}` por `{cidade}` em CHOOSE_UNIT_OR_ANY gera texto com chave
literal ou erro de template.
- **Guard:** whitelist de placeholders por estado; placeholders **obrigatórios**
  validados como presentes; placeholders desconhecidos → 422.

### R3 — Quick reply com `value` inválido
Admin cria botão cujo `value` a engine não reconhece → botão "morto" que não avança.
- **Guard:** `value` ∈ catálogo do estado (`allowed_quick_reply_values`); UI oferece
  só os valores válidos; servidor revalida; UNIQUE(state,value).

### R4 — Anti-enumeração do IDENTIFY
Tornar as mensagens de sucesso/não-encontrado diferentes revelaria se um CPF/WhatsApp
existe (enumeração).
- **Guard:** mensagens de transição de IDENTIFY **não editáveis** nesta fase (ou,
  se editáveis no futuro, trava que força ambas idênticas). Documentado no
  STATE_CONTENT_MODEL.

### R5 — `max_attempts` perigoso
`0` ⇒ falha imediata; valor enorme ⇒ candidato/atacante preso em loop; em VERIFY_OTP
um limite alto enfraquece proteção contra brute force.
- **Guard:** faixa [1,10] geral; VERIFY_OTP restrito (ex.: 3..6) e não desabilitável.
  Mudar `default_max_attempts` afeta o sufixo `_attempt_limit` das Falhas → regression.

### R6 — PII injetada em texto estático
Admin cola CPF/telefone de exemplo no prompt; passa a ser exibido a todos.
- **Guard:** sanitização/validação anti-PII no PATCH (sequências de 10–11 dígitos);
  texto rejeitado ou mascarado; auditoria registra autor.

### R7 — Desligar o assistente sem querer
`assistant_enabled=false` derruba o Portal 2 inteiro.
- **Guard:** `is_sensitive`, somente `admin`, confirmação explícita na UI, auditado;
  estado padrão `true`.

### R8 — Regressão na engine ao trocar leitura hardcoded → DB
Os testes de conversa afirmam strings exatas; mudar a origem pode quebrá-los, e um
loader mal feito pode falhar em runtime.
- **Guard:** seed = strings atuais **idênticas**; loader com **fallback para os
  defaults de código** quando linha ausente/`is_active=false`; cache com invalidação
  no PATCH; **regression review dedicado** na fase que tocar a engine; rodar a suíte de
  conversa + portal-2 smoke.

### R9 — WhatsApp habilitado prematuramente
`channels_enabled` aceitar `whatsapp` antes do suporte da engine.
- **Guard:** validação rejeita `whatsapp`; UI não oferece a opção.

### R10 — Cache stale
Conteúdo editado não reflete por causa de cache.
- **Guard:** invalidar cache do loader no PATCH; TTL curto; chave de versão por
  `state_key`/`key`.

### R11 — Escopo (mexer onde não deve)
Esta fase é **só documentação**; a fase de impl. não pode tocar Conversation Engine
além do *read path*, nem CandidateApplication/pipeline/WhatsApp/matching/pré-admissão.
- **Guard:** PRs separados; checklist de não-alteração; o write path do admin é isolado
  em serviços `assistant_*` novos.

## Checklist antes de implementar

- [ ] Seed = strings atuais, byte a byte; loader com fallback de código.
- [ ] Topologia/transições continuam só na engine (GET states read-only).
- [ ] `prompt_text` não-vazio; placeholders na whitelist; obrigatórios presentes.
- [ ] Quick reply `value` no catálogo; não esvaziar estados dirigidos por botão.
- [ ] IDENTIFY transição não editável; OTP `max_attempts` em faixa segura.
- [ ] `max_attempts` ∈ faixa; impacto no `_attempt_limit` revisado.
- [ ] Anti-PII no PATCH; nenhuma PII na API/UI.
- [ ] Settings sensíveis só admin; WhatsApp bloqueado; limites de IA via aiLimitsService.
- [ ] Toda mutação audita (before/after); auditoria/histórico append-only.
- [ ] Suíte de conversa + portal-2 smoke verdes após o read path.
