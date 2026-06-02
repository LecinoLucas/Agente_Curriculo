# OP-6E - Data Model - Admin do Assistente do Candidato

Data: 2026-06-01
Status: Planejamento. Nenhuma migration nesta fase.

## Princípio de propriedade (ownership)

- Tabelas de **conversa** são de **OP-6B** (Conversation Engine). Esta tela só
  **lê** e, no máximo, atualiza campos operacionais já previstos por OP-6B
  (status da sessão). Os esquemas abaixo marcados como **[OP-6B]** são
  **suposições a confirmar** com OP-6B antes de qualquer código.
- Tabelas de **configuração/admin** marcadas como **[OP-6E]** são novas e seriam
  criadas quando esta tela for implementada — não nesta fase.
- Sem enum PostgreSQL: usar `VARCHAR` + `CHECK`, padrão já adotado em OP-5, para
  rollback e expansão simples.

## [OP-6B] conversation_sessions (assumido)

Esperado do Conversation Engine. Confirmar nomes reais com OP-6B.

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | UUID PK | Sessão de conversa. |
| `candidate_id` | UUID FK nullable -> `candidates.id` | Candidato, se resolvido. |
| `candidate_application_id` | UUID FK nullable | Candidatura vinculada (só leitura nesta tela). |
| `channel` | varchar(20) | `web`, futuro `whatsapp`. |
| `current_state` | varchar(60) | Estado atual da state machine. |
| `status` | varchar(20) | `active`, `waiting`, `abandoned`, `handed_off`, `closed`. |
| `last_message_at` | timestamptz | Para coluna "última mensagem". |
| `handed_off_to` | UUID nullable | Usuário RH responsável, se encaminhado. |
| `created_at` / `updated_at` | timestamptz | Auditoria temporal. |

Campos que a tela **lê**: todos acima.
Campos que a tela pode **atualizar** (via endpoint do OP-6B, não direto):
`status` (abandonar/encaminhar), `handed_off_to`.

## [OP-6B] conversation_messages (assumido)

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | UUID PK | Mensagem. |
| `session_id` | UUID FK -> `conversation_sessions.id` | Sessão. |
| `role` | varchar(15) | `candidate`, `assistant`, `system`. |
| `content` | text | Texto da mensagem. |
| `state_at_message` | varchar(60) nullable | Estado quando a mensagem ocorreu. |
| `interpreted_intent` | JSONB nullable | Intenção inferida (função/local/turno). |
| `was_understood` | boolean nullable | `false` alimenta a aba Falhas. |
| `created_at` | timestamptz | Ordenação da thread. |

A tela lê tudo; **não escreve** em mensagens.

## [OP-6B/compartilhado] flow_states (estados da state machine)

A **lógica** de transição é de OP-6B. Esta tela precisa de uma representação de
conteúdo dos estados para a Aba "Fluxo de perguntas". Duas opções a decidir com
OP-6B:

- (A) OP-6B já expõe estados + conteúdo via endpoint → esta tela só consome.
- (B) Conteúdo editável (texto da pergunta, quick replies, ativo/inativo) vive em
  tabela própria **[OP-6E]** `assistant_flow_states_content`, referenciando a
  chave de estado do OP-6B.

Estrutura assumida para exibição:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `state_key` | varchar(60) | Identificador do estado (de OP-6B). |
| `prompt_text` | text | Pergunta exibida ao candidato. |
| `quick_replies` | JSONB | Lista de opções rápidas `[{label, value}]`. |
| `next_states` | JSONB | Transições possíveis (somente leitura; de OP-6B). |
| `is_active` | boolean | Ativo/Inativo. |

## [OP-6E] assistant_intents (Aba "Frases e intenções")

Nova tabela admin. Mapa frase → intenção, base do interpretador econômico.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | Entrada de intenção. |
| `phrase` | text not null | Frase comum (ex.: "quero vaga de frentista"). |
| `intent_type` | varchar(30) not null | `desired_role`, `location`, `shift`, `any_unit`, `other`. |
| `intent_value` | varchar(255) nullable | Valor normalizado (ex.: `frentista`, `Peritoró`). |
| `target_location_group_id` | UUID FK nullable -> `location_groups.id` | Quando intenção é localidade. |
| `target_unit_id` | UUID FK nullable -> `operational_units.id` | Quando intenção é unidade. |
| `examples` | JSONB nullable | Variações da frase. |
| `is_active` | boolean not null default true | Ativo/Inativo. |
| `source` | varchar(20) | `manual`, `from_failure` (criada a partir de falha). |
| `created_by` / `updated_by` | UUID | Auditoria de autoria. |
| `created_at` / `updated_at` | timestamptz | Auditoria temporal. |

Reaproveita cadastro mestre operacional (`location_groups`, `operational_units`)
para casar com a estrutura real de filiais/localidades.

## [OP-6E] assistant_failures (Aba "Falhas do assistente")

Pode ser tabela própria **ou** uma *view* derivada de `conversation_messages`
onde `was_understood = false`. Decisão depende de OP-6B.

Visão lógica necessária:

| Campo | Origem | Observação |
| --- | --- | --- |
| `message_id` | conversation_messages | Mensagem não entendida. |
| `content` | conversation_messages | Texto do candidato. |
| `state_at_message` | conversation_messages | Estado em que ocorreu. |
| `occurrences` | agregação | Quantas mensagens equivalentes. |
| `suggested_intent` | derivado/heurística | Sugestão de correção (não decide nada). |
| `review_status` | [OP-6E] | `open`, `mapped`, `ignored`. |
| `mapped_intent_id` | FK -> assistant_intents | Preenchido quando vira intenção. |

Mapear uma falha cria/atualiza uma linha de `assistant_intents` com
`source='from_failure'`.

## [OP-6E] assistant_settings (Aba "Configurações")

Configuração singleton (uma linha por ambiente) ou key/value.

| Chave | Tipo | Observação |
| --- | --- | --- |
| `channel_web_enabled` | boolean | Canal web ligado. |
| `channel_whatsapp_enabled` | boolean | **Sempre false nesta fase** (placeholder). |
| `welcome_message` | text | Saudação. |
| `not_understood_message` | text | Mensagem de "não entendi". |
| `handoff_message` | text | Mensagem ao encaminhar para RH. |
| `closing_message` | text | Encerramento. |
| `ai_max_tokens_per_session` | int | Limite de IA por sessão. |
| `ai_max_calls_per_session` | int | Limite de chamadas de IA por sessão. |
| `ai_fallback_behavior` | varchar(20) | `quick_replies_only`, `handoff`. |

Limites de IA devem conversar com o `aiLimitsService` já existente — confirmar se
reutiliza a mesma fonte de verdade em vez de duplicar.

## [OP-6E] assistant_admin_audit (auditoria de ações admin)

Toda ação administrativa desta tela é auditável. Reusar a infra de `AuditLogs`
existente se possível; senão, tabela dedicada:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | UUID PK | Evento. |
| `actor_id` | UUID | Quem executou. |
| `action` | varchar(40) | `abandon_session`, `handoff_session`, `edit_state`, `map_intent`, `edit_settings`. |
| `target_type` | varchar(30) | `session`, `state`, `intent`, `settings`. |
| `target_id` | varchar(80) | Alvo. |
| `before` / `after` | JSONB | Diff da mudança. |
| `created_at` | timestamptz | Quando. |

## Resumo de propriedade

| Tabela | Dono | Esta tela faz |
| --- | --- | --- |
| `conversation_sessions` | OP-6B | lê; atualiza status via endpoint OP-6B |
| `conversation_messages` | OP-6B | lê |
| estados da state machine | OP-6B | lê lógica; edita conteúdo (a decidir) |
| `assistant_intents` | OP-6E | CRUD |
| `assistant_failures` | OP-6E (ou view OP-6B) | lê + marca/mapeia |
| `assistant_settings` | OP-6E | lê/edita |
| `assistant_admin_audit` | OP-6E / AuditLogs | escreve em toda ação |
