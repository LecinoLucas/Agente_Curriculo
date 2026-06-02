# OP-6H - AI Guards - Admin do Assistente do Candidato

Data: 2026-06-02
Status: Planejamento. Regras de IA, segurança e auditoria para o painel admin.

## Regras inegociáveis

1. **IA não decide reprovação nem contratação.** Nenhuma ação do painel nem do
   interpretador aprova/reprova/contrata. Decisão é humana + regras.
2. **IA não cria/move pipeline.** O painel não dispara
   `candidate_job_pipeline`. CandidateApplication só vira pipeline em fase
   explícita, fora daqui.
3. **IA apenas sugere intenção.** O interpretador/IA transforma texto livre em uma
   **sugestão** (`choose_location`, `talk_to_hr`, ...). A **state machine valida**
   e decide a transição. Sugestão nunca é comando.
4. **A engine é a única fonte de verdade do fluxo.** O painel não cria transições,
   não cria estados, não roda lógica paralela ao Conversation Engine. Edição
   futura é só **conteúdo** (texto, quick replies, fallback, limites).
5. **Um só motor para todos os canais.** WhatsApp futuro usa a mesma engine; o
   painel trata canal como configuração, nunca como pipeline de IA separado.
6. **Tudo auditável; nada apagável.** Histórico de mensagens e auditoria de
   conversa são imutáveis para o admin. Toda mutação administrativa é registrada.

## Fronteiras do que o admin NÃO pode

- Apagar/editar `conversation_messages` ou `assistant_admin_audit`.
- Criar transição arbitrária da state machine.
- Permitir que IA reprove/contrate.
- Expor CPF/telefone completos.
- Habilitar WhatsApp antes da engine suportar o canal.
- Alterar CandidateApplication de forma a criar pipeline.

## Privacidade / LGPD

- **CPF nunca em claro.** O painel só vê `cpf_last4` (já o que a engine guarda em
  `context_json`). Telefone sempre mascarado.
- **Sanitização de texto livre:** mensagens do candidato (Falhas/thread) passam por
  filtro que mascara sequências longas de dígitos (possível CPF/telefone) antes de
  exibir/persistir em `assistant_failures.raw_message`.
- **Minimização:** respostas de API expõem só o necessário; nada de `cpf_hash`,
  `context_json` cru, e-mail.
- **Anti-enumeração herdada:** o painel não revela se um CPF/telefone existe; ele
  apenas mostra sessões já criadas (com candidato mascarado ou anônimo).
- **OTP é a próxima proteção** (ver RISKS): enquanto não houver OTP, o vínculo de
  `candidate_id` por identificador é "fraco"; o painel deve sinalizar sessões
  `identifier_unresolved` e não tratar identificação como autenticação.

## Ordem de interpretação (quando a IA/interpretador entrar)

1. Quick reply / opção clicada → sem IA.
2. Match em `assistant_intents` (frase/normalized) → sugestão direta, sem IA.
3. Heurística simples (palavras-chave de localidade/função) → sem IA.
4. IA (último recurso) → só dentro dos limites do `aiLimitsService`.

Falha em todos → registra `assistant_failures` e usa `fallback_message` com quick
replies; nunca trava o candidato. **Preferir botões/respostas rápidas** para
economizar token e aumentar previsibilidade.

## Auditoria mínima por ação

| Ação | Registrar |
| --- | --- |
| Ver conversa | actor, session_id (acesso a PII logado) |
| Flag/encerrar/reabrir sessão | actor, session, status antes/depois, nota |
| Classificar/resolver falha | actor, failure_id, classificação, intent gerada |
| Criar/editar/desativar intenção | actor, intent, diff |
| Editar conteúdo de estado | actor, state_key, diff (só campos editáveis) |
| Editar settings | actor, key, valor antes/depois |

## Checklist de revisão (antes de implementar cada fase)

- [ ] Nenhum endpoint/ação chama IA para decidir aprovação/reprovação/contratação.
- [ ] Nenhuma ação cria/move pipeline.
- [ ] Transições/estados continuam só na engine; painel edita só conteúdo.
- [ ] PII completa nunca sai da API nem é renderizada.
- [ ] Texto livre sanitizado antes de exibir/persistir.
- [ ] Toda mutação grava auditoria; auditoria/histórico são append-only.
- [ ] WhatsApp permanece desabilitado; canais reusam a mesma engine.
- [ ] Limites de IA originados do `aiLimitsService`.
