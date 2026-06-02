# OP-6E - AI Guards - Admin do Assistente do Candidato

Data: 2026-06-01
Status: Planejamento. Regras de IA e auditoria para a futura tela e o engine que
ela observa.

## Regras inegociáveis

1. **IA não decide reprovação.** Nenhuma chamada de IA, nem ação desta tela,
   reprova/aprova candidato. Decisão de elegibilidade é humana + regras, nunca o
   modelo.
2. **IA não cria pipeline sozinha.** A IA não dispara criação/movimentação de
   `candidate_job_pipeline`. Vínculo de candidatura→pipeline é de outra fase e é
   acionado por humano/regra.
3. **IA apenas interpreta texto livre.** Papel do modelo: transformar
   "qualquer posto em Peritoró" em uma **sugestão** de intenção
   (função/localidade/turno). Sugestão, não comando.
4. **A state machine decide a transição.** O próximo estado vem da máquina de
   estados (OP-6B), não do modelo. A IA pode preencher um slot; a transição é
   determinística.
5. **Tudo é auditável.** Toda interpretação e toda ação admin têm rastro
   (quem, quando, antes/depois). Ver `assistant_admin_audit` no DATA_MODEL.
6. **Preferir botões/respostas rápidas.** Quick replies primeiro; IA é fallback
   para texto livre não coberto por frases mapeadas. Economiza token e aumenta
   previsibilidade.

## Ordem de interpretação (econômica)

Para cada mensagem de candidato em texto livre:

1. **Quick reply / opção clicada** → sem IA.
2. **Match em `assistant_intents`** (frase/exemplos) → sem IA.
3. **Heurística simples** (palavras-chave de função/localidade conhecidas) →
   sem IA.
4. **IA (último recurso)** → só se 1–3 falharem e dentro dos limites de IA.

Quando IA não resolve, a mensagem entra em **Falhas do assistente** e o estado
usa a `not_understood_message` com quick replies, sem travar o candidato.

## Limites de IA (configuráveis, aba Configurações)

- `ai_max_tokens_per_session`, `ai_max_calls_per_session`.
- `ai_fallback_behavior`: `quick_replies_only` (default) ou `handoff`.
- Ao exceder limite: parar de chamar IA na sessão e cair no fallback. Nunca
  "tentar mais forte" automaticamente.
- Reusar a política do `aiLimitsService` existente como fonte de verdade
  (confirmar) em vez de duplicar limites.

## Fronteiras de escopo (o que a IA/tela NÃO toca)

- Não altera `CandidateApplication` nem candidate-portal.
- Não aciona matching/IA de scoring.
- Não interage com pré-admissão.
- Não envia WhatsApp (placeholder desabilitado).
- Não altera o bot real nem o pipeline.

## Privacidade / LGPD

- Conversas podem conter dados pessoais; a tela mostra apenas o necessário para
  identificação (nome curto/ID), nunca CPF em claro/hash.
- `interpreted_intent` e mensagens são dados de candidato; acesso restrito por
  RBAC e logado.
- Sugestões de IA são marcadas como sugestão e não persistem como verdade até um
  humano confirmar (ex.: mapear falha → intenção).

## Auditoria mínima por ação

| Ação | O que registrar |
| --- | --- |
| Encaminhar/abandonar sessão | actor, sessão, status antes/depois, motivo |
| Editar estado (conteúdo) | actor, state_key, diff de texto/quick replies |
| Criar/editar/remover intenção | actor, intenção, diff |
| Mapear falha → intenção | actor, message_id, intenção resultante, `source=from_failure` |
| Editar configurações | actor, diff de settings (inclui limites de IA) |

## Checklist de revisão de IA (antes de implementar)

- [ ] Nenhum endpoint/ação chama IA para decidir aprovação/reprovação.
- [ ] Nenhuma ação cria/move pipeline automaticamente.
- [ ] Transições continuam determinísticas (state machine), IA só sugere slot.
- [ ] Quick replies cobrem os caminhos principais; IA é fallback.
- [ ] Limites de IA aplicados e originados do `aiLimitsService`.
- [ ] Toda mutação grava auditoria com diff.
- [ ] Nenhum dado sensível exposto além do necessário.
