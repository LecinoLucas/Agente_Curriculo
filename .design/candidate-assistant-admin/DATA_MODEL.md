# OP-6H - Data Model - Admin do Assistente do Candidato

Data: 2026-06-02
Status: Planejamento. Nenhuma migration nesta fase.

## Princípio de propriedade (ownership)

- Tabelas de **conversa/candidatura** já existem e são do Conversation Engine /
  CandidateApplication. O painel admin **lê** essas tabelas e, no máximo, atualiza
  campos operacionais já previstos (status de sessão) **via endpoint da engine**,
  nunca por escrita direta.
- Tabelas **[OP-6H novas]** (`assistant_*`) seriam criadas na fase respectiva, não
  agora. Padrão do projeto: `VARCHAR` + `CHECK` em vez de enum PostgreSQL.
- Toda escrita administrativa gera registro em `assistant_admin_audit`.

## Tabelas existentes (somente leitura pelo painel)

### conversation_sessions (Conversation Engine — real)

| Campo | Tipo | Uso no painel |
| --- | --- | --- |
| `id` | UUID PK | identidade da sessão |
| `candidate_id` | UUID FK→candidates (nullable) | candidato, se identificado |
| `application_id` | UUID FK→candidate_applications (nullable) | link à candidatura |
| `channel` | varchar (`web`/`whatsapp`) | canal |
| `current_state` | varchar (9 estados) | estado atual |
| `status` | varchar (`active`/`completed`/`abandoned`/`cancelled`) | status |
| `context_json` | JSONB | derivar gargalo; **PII já minimizada** |
| `last_message_at` | timestamptz | data última interação |
| `created_at`/`updated_at`/`deleted_at` | timestamptz | auditoria temporal |

`context_json` hoje contém apenas: `identifier_type`, `cpf_last4`,
`identifier_unresolved`, `location_hint`, `preference`, `desired_function`,
`desired_shift`, `show_jobs_ack`, `resume_choice`, `confirmation`. **Nunca CPF
completo.** O painel não deve assumir outros campos sensíveis.

### conversation_messages (Conversation Engine — real)

| Campo | Tipo | Uso no painel |
| --- | --- | --- |
| `id` | UUID PK | identidade |
| `session_id` | UUID FK→conversation_sessions | thread |
| `role` | varchar (`candidate`/`assistant`/`system`) | quem falou |
| `content` | text | conteúdo (sanitizar ao exibir) |
| `message_type` | varchar (`text`/`quick_reply`/`system`) | tipo |
| `interpreted_intent` | varchar(100) nullable | intenção, quando houver |
| `metadata_json` | JSONB nullable | p/ assistant: `{state, quick_replies[]}` |
| `created_at` | timestamptz | ordenação |

O painel **lê**; nunca escreve nem edita mensagens.

### candidate_applications / candidates / location_groups / operational_units

Lidas para enriquecer a visão (candidatura vinculada, localidade/unidade
preferida). Sem escrita pelo painel. Exibição sempre mascarando PII de
`candidates` (CPF/telefone). Reuso do cadastro mestre operacional para rótulos.

---

## Tabelas novas [OP-6H] (futuras — não criar nesta fase)

### 1. assistant_intents (Aba 3)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | |
| `phrase` | text not null | frase original |
| `normalized_phrase` | text not null | normalizada (casefold/sem acento) |
| `intent` | varchar(40) not null | catálogo de intenções (CHECK) |
| `is_active` | boolean not null default true | |
| `created_at`/`updated_at` | timestamptz | |

Catálogo de `intent` (CHECK): `job_search_interest`, `choose_location`,
`choose_unit`, `choose_function`, `choose_shift`, `talk_to_hr`.
Índice único sugerido em `normalized_phrase` (parcial onde `is_active`).
**A intenção só sugere; a state machine valida** (ver AI_GUARDS).

### 2. assistant_failures (Aba 4)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | |
| `session_id` | UUID FK→conversation_sessions | onde ocorreu |
| `message_id` | UUID FK→conversation_messages (nullable) | mensagem alvo |
| `state` | varchar(60) | estado no momento |
| `raw_message` | text | texto sanitizado (sem PII bruta) |
| `reason` | varchar(60) | `not_understood`/`stuck`/`max_attempts` |
| `status` | varchar(20) not null default `open` | `open`/`resolved`/`forwarded` |
| `reviewed_by` | UUID FK→users (nullable) | revisor |
| `reviewed_at` | timestamptz nullable | |
| `created_at` | timestamptz | |

Pode ser **tabela** populada pela engine ao detectar falha **ou** derivada por
*view* sobre `conversation_messages` (a decidir com o time da engine — ver RISKS).
Classificar uma falha pode criar uma `assistant_intents` (`talk_to_hr` etc.).

### 3. assistant_settings (Aba 5)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `key` | varchar(60) PK | chave da configuração |
| `value` | text/JSONB | valor |
| `description` | text nullable | rótulo amigável |
| `updated_by` | UUID FK→users | quem alterou |
| `updated_at` | timestamptz | quando |

Chaves planejadas: `assistant_enabled`, `welcome_message`, `fallback_message`,
`max_attempts_per_state`, `offer_hr_after_attempts`, `session_expiration_minutes`,
`require_otp` (futuro, default false), `channels_enabled`
(ex.: `["web"]`; whatsapp desabilitado nesta fase).
Limites de IA devem conversar com o `aiLimitsService` existente (não duplicar).

### 4. assistant_admin_audit (transversal)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | |
| `actor_id` | UUID FK→users | quem agiu |
| `action` | varchar(40) | `view`/`flag_followup`/`close`/`reopen`/`edit_state_content`/`map_intent`/`resolve_failure`/`edit_settings` |
| `entity_type` | varchar(30) | `session`/`state`/`intent`/`failure`/`settings` |
| `entity_id` | varchar(80) | alvo |
| `before_json` | JSONB nullable | estado anterior |
| `after_json` | JSONB nullable | estado posterior |
| `created_at` | timestamptz | |

Reusar a infra de AuditLogs existente se cobrir o caso; senão, esta tabela
dedicada. **Append-only**: admin nunca apaga/edita auditoria.

## Resumo de propriedade

| Tabela | Dono | Painel faz |
| --- | --- | --- |
| conversation_sessions | Conversation Engine | lê; status via endpoint da engine |
| conversation_messages | Conversation Engine | lê |
| candidate_applications / candidates / master | OP-5/OP-2 | lê (mascarado) |
| assistant_intents | OP-6H | CRUD |
| assistant_failures | OP-6H (ou view da engine) | lê + classifica |
| assistant_settings | OP-6H | lê/edita |
| assistant_admin_audit | OP-6H / AuditLogs | escreve em toda mutação |

## Decisões a confirmar

1. Conteúdo dos estados editável (Aba 2): a engine expõe e o painel grava em
   `assistant_settings`/override próprio, ou os textos continuam só no código?
2. `assistant_failures` é tabela populada pela engine ou view?
3. Origem única dos limites de IA (`aiLimitsService` vs. `assistant_settings`).
