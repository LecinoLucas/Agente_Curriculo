# OP-6H-3A — Data Model — Conteúdo e Configurações do Assistente

Data: 2026-06-02
Status: **Marco A implementado em OP-6H-3B.** Migration/modelos/seeds/catálogos
criados sem ligar a Conversation Engine ao banco.
Padrão do projeto: `VARCHAR` + `CHECK` (sem enum nativo), UUID PK, `created_at`/
`updated_at` em `timestamptz`, seed das migrações = valores **hoje hardcoded**.

## Fonte de verdade x conteúdo

| Camada | Onde vive | Editável pelo admin? |
| --- | --- | --- |
| Topologia (estados + transições) | `conversation_state_machine.py` (`STATE_TRANSITIONS`) | ❌ nunca |
| Catálogo de `value` de quick reply por estado | código (a engine ramifica por valor) | ❌ valor não; rótulo sim |
| Placeholders válidos por estado | código (whitelist) | ❌ |
| Conteúdo (prompt/helper/fallback/limite/labels) | tabelas `assistant_*` abaixo | ✅ via PATCH validado |

Estados reais (ordem fixa, da engine):
`IDENTIFY(1) → VERIFY_OTP(2) → CHOOSE_LOCATION(3) → CHOOSE_UNIT_OR_ANY(4) →
CHOOSE_FUNCTION(5) → CHOOSE_SHIFT(6) → SHOW_JOBS(7) → COLLECT_RESUME(8) →
CONFIRM_APPLICATION(9) → DONE(10)`.

---

## 1. `assistant_state_contents`

Conteúdo persistido por estado. **Uma linha por `state`** (10 linhas seed).

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | `uuid_generate_v4()` |
| `state` | varchar(50) UNIQUE NOT NULL | CHECK no conjunto dos 10 estados; **não editável** |
| `prompt_text` | text NOT NULL | pergunta principal do estado; não pode ficar vazia |
| `helper_text` | text NULL | texto auxiliar opcional |
| `fallback_text` | text NULL | mensagem quando a entrada não é entendida |
| `input_placeholder` | varchar(160) NULL | placeholder visual para input, se necessário |
| `is_editable` | boolean NOT NULL default true | `IDENTIFY` e `VERIFY_OTP` seedados como `false` nesta fase |
| `is_active` | boolean NOT NULL default true | desativar conteúdo customizado (volta ao default de código) |
| `version` | integer NOT NULL default 1 | versionamento simples do conteúdo |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

Notas:
- `state` e transições **não** são editáveis por API.
- Seed = strings atuais de `prompt_for()` e das constantes `_INVALID_*` /
  `_IDENTIFY_*` (ver `STATE_CONTENT_MODEL.md`).
- Placeholders permitidos por estado são validados contra uma **whitelist em código**
  (ex.: `CHOOSE_UNIT_OR_ANY` aceita `{location_hint}`). Texto com placeholder
  desconhecido é rejeitado.
- Estados marcados **sensíveis** (`IDENTIFY`, `VERIFY_OTP`) têm regras extras de
  validação (anti-enumeração / OTP) — ver RISKS.

## 2. `assistant_quick_replies`

Botões de resposta rápida por estado. **`value` pertence a um catálogo fixo** que a
engine reconhece; o admin edita rótulo, ordem e ativação, e pode escolher **entre os
valores do catálogo** daquele estado — nunca inventar um valor novo.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | |
| `state` | varchar(50) | CHECK nos 10 estados |
| `value` | varchar(40) NOT NULL | **deve** pertencer ao catálogo do estado (validação em código) |
| `label` | varchar(80) NOT NULL | rótulo exibido; editável |
| `sort_order` | integer NOT NULL default 0 | ordem de exibição; editável |
| `is_active` | boolean NOT NULL default true | ocultar botão sem deletar |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

UNIQUE(`state`,`value`). Seed = quick replies atuais (ex.: IDENTIFY:
`cpf/Informar CPF`, `whatsapp/Informar WhatsApp`; CHOOSE_SHIFT:
`morning/afternoon/night/any`; etc.).

> **Guard crítico:** remover/desativar *todos* os quick replies de um estado cujo
> avanço depende deles é bloqueado (ver RISKS). A engine continua aceitando texto
> livre onde já aceita; quick replies são atalhos, não a única via.

## 3. `assistant_settings`

Configurações globais chave/valor (poucas chaves, tipadas pela aplicação).

| Campo | Tipo | Regra |
| --- | --- | --- |
| `key` | varchar(60) PK | CHECK no catálogo de chaves |
| `value_json` | JSONB NOT NULL | valor tipado conforme a chave |
| `description` | text NULL | rótulo amigável (i18n pt-BR) |
| `is_sensitive` | boolean NOT NULL default false | true ⇒ só `admin` edita |
| `updated_by` | UUID FK→users NULL | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

Catálogo de chaves (seed):

| key | tipo | seed | sensível |
| --- | --- | --- | --- |
| `assistant_enabled` | bool | `true` | ✅ |
| `welcome_message` | string | prompt atual de IDENTIFY | ❌ |
| `global_fallback_message` | string | "Não consegui entender…" | ❌ |
| `default_max_attempts` | int (1..10) | `3` (= `_FAILURE_ATTEMPT_LIMIT`) | ✅ |
| `offer_hr_after_attempts` | int (1..10) | `2` | ❌ |
| `talk_to_hr_message` | string | (novo) "Vou te encaminhar para o RH…" | ❌ |
| `session_expiration_minutes` | int | `60` | ✅ |
| `channels_enabled` | string[] | `["web"]` | ✅ (whatsapp bloqueado) |

> `default_max_attempts` é a **fonte única** do limite global (substitui a leitura
> direta de `_FAILURE_ATTEMPT_LIMIT`, que vira o *fallback* de código). Limites de
> **IA** continuam no `aiLimitsService` — não duplicar aqui.

## 4. Auditoria — **reusar a infra existente**

A fase de Falhas (OP-6H-2) já usa `AuditService.log_event(...)`
(`backend/src/application/services/audit_service.py`) gravando em `audit_logs`
(`action`, `resource_type`, `resource_id`, `user_id`, `before_state`, `after_state`,
`metadata`). 

**Decisão reconciliada:** *não* criar a tabela dedicada `assistant_admin_audit`
prevista no rascunho anterior — **reusar `AuditService`**. Ações novas:

| action | resource_type | resource_id |
| --- | --- | --- |
| `admin.assistant.state_content.update` | `assistant_state_content` | `state_key` |
| `admin.assistant.quick_reply.update` | `assistant_quick_reply` | `id` |
| `admin.assistant.setting.update` | `assistant_setting` | `key` |

`before_state`/`after_state` carregam o diff dos campos editáveis. **Append-only**:
admin nunca apaga/edita auditoria.

## Leitura pela engine (read path)

Plano: um *loader* (`AssistantContentProvider`) que a `prompt_for()` /
`_record_failure()` consultam, com **fallback para os defaults de código** quando a
linha está ausente/`is_active=false`. Cacheável (TTL curto) com invalidação no PATCH.
Assim, os testes da conversa que afirmam strings exatas continuam válidos enquanto o
seed = código. **Esta fase apenas planeja; a alteração da engine é fase implementável
posterior e exige regression review dedicado (ver RISKS).**

## Resumo de propriedade

| Tabela | Dono | Painel faz |
| --- | --- | --- |
| `STATE_TRANSITIONS` (código) | Conversation Engine | só lê (GET states) |
| `assistant_state_contents` | OP-6H-3 | lê/edita conteúdo |
| `assistant_quick_replies` | OP-6H-3 | lê/edita rótulo/ordem/ativo |
| `assistant_settings` | OP-6H-3 | lê/edita (sensíveis só admin) |
| `audit_logs` (existente) | infra comum | escreve em toda mutação |
