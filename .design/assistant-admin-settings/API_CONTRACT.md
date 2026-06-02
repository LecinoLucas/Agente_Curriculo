# OP-6H-3A — API Contract — Conteúdo e Configurações do Assistente

Data: 2026-06-02
Status: **Marco B implementado em OP-6H-3C.** Endpoints GET read-only criados;
PATCH/POST/DELETE permanecem fora desta fase.
Prefixo: `/api/v1/admin/assistant/...`. Todos administrativos, protegidos por RBAC.

## Princípios

- Reuso do padrão de `routers/admin_assistant.py` já existente (sessions/failures).
- Nenhuma resposta expõe CPF/telefone/e-mail completos, `cpf_hash` ou `context_json`.
- Endpoints de conteúdo **não** alteram topologia: não há POST/DELETE de estado nem
  de transição. Quick replies novas só com `value` do catálogo do estado.
- Toda mutação futura grava auditoria via `AuditService` (ver DATA_MODEL §4).
- IA nunca é chamada para decidir.

## RBAC

| Endpoint | admin | hr/recruiter | viewer/candidate |
| --- | --- | --- | --- |
| GET states | ✓ | ✓ | — |
| GET state-contents / {state} | ✓ | ✓ | — |
| GET quick-replies | ✓ | ✓ | — |
| PATCH state-contents/{state} | ✓ | ✓ (conteúdo) | — |
| GET settings | ✓ | ✓ | — |
| PATCH settings/{key} (não sensível) | ✓ | ✓ | — |
| PATCH settings/{key} (sensível) | ✓ | — | — |

Dependência implementada: `HrRecruiterOrAdmin` para leitura/conteúdo. Checagem extra
de `is_sensitive` exige role `admin` no PATCH de settings futuro.

---

## 1. GET /api/v1/admin/assistant/states  (topologia — read-only)

Introspecção do catálogo fixo da máquina de estados. **Sempre read-only.**

```json
[
  {
    "state": "IDENTIFY",
    "label": "Identificação",
    "description": "Coleta CPF ou WhatsApp para iniciar o atendimento.",
    "is_sensitive": true,
    "is_editable": false,
    "order": 0,
    "allowed_quick_reply_values": ["cpf", "whatsapp"],
    "allowed_placeholders": []
  }
]
```

- `order`: ordem fixa dos 10 estados reais; **não editável**.
- `allowed_quick_reply_values` / `allowed_placeholders`: catálogo fixo que o frontend
  usa para validar antes de enviar (espelho da whitelist de código).

## 2. GET /api/v1/admin/assistant/state-contents

Lista o conteúdo persistido dos estados em `assistant_state_contents`.

Filtros: `state`, `is_active`, `is_editable`.

```json
[
  {
    "state": "CHOOSE_UNIT_OR_ANY",
    "prompt_text": "Encontrei {location_hint}. Você prefere...",
    "helper_text": null,
    "fallback_text": "Não consegui identificar esse posto...",
    "input_placeholder": null,
    "is_editable": true,
    "is_active": true,
    "version": 1,
    "updated_at": "2026-06-02T10:00:00Z"
  }
]
```

### GET /api/v1/admin/assistant/state-contents/{state}
Mesmo objeto, um estado. 404 se `state` não pertence ao catálogo.

## 3. GET /api/v1/admin/assistant/quick-replies

Lista quick replies persistidas em `assistant_quick_replies`.

Filtros: `state`, `is_active`.

```json
[
  {
    "id": "uuid",
    "state": "CHOOSE_SHIFT",
    "value": "morning",
    "label": "Manhã",
    "sort_order": 0,
    "is_active": true,
    "created_at": "2026-06-02T10:00:00Z",
    "updated_at": "2026-06-02T10:00:00Z"
  }
]
```

## 4. PATCH /api/v1/admin/assistant/state-contents/{state}

**Fase futura. Não implementado em OP-6H-3C.**

Edita **somente** campos de conteúdo. `extra="forbid"` (rejeita campos não previstos,
como na Aba 4).

```json
{
  "prompt_text": "Em qual cidade você quer trabalhar?",
  "helper_text": null,
  "fallback_text": "Não encontrei essa cidade. Tente o nome completo.",
  "max_attempts": 3,
  "quick_replies": [
    { "value": "any_in_location", "label": "Qualquer posto", "position": 1, "is_active": true }
  ]
}
```

Validações (rejeitam com **422** + mensagem amigável):
- `prompt_text` não vazio após trim.
- Placeholders usados ⊆ `allowed_placeholders` do estado; placeholders **obrigatórios**
  (ex.: `{location_hint}` em CHOOSE_UNIT_OR_ANY) **presentes**.
- `max_attempts` ∈ [1,10] (VERIFY_OTP faixa restrita; ver RISKS).
- Cada `quick_replies[].value` ∈ catálogo do estado; sem duplicar `value`.
- Não pode zerar/desativar **todas** as quick replies de um estado que depende delas.
- Texto não pode conter padrões de PII (sequências de 10–11 dígitos) — sanitização
  rejeita/limpa.
- Estados sensíveis (IDENTIFY anti-enumeração, VERIFY_OTP) aplicam regras extras.
- Campos fora de `editable_fields` → 422.

Resposta: o objeto completo atualizado (igual ao GET). Efeito colateral: auditoria
`admin.assistant.state_content.update` (+ `quick_reply.update` por linha alterada) e
invalidação de cache do loader.

## 5. GET /api/v1/admin/assistant/settings

```json
[
  {
    "key": "channels_enabled",
    "value_json": null,
    "is_sensitive": true,
    "description": "Canais habilitados. WhatsApp permanece desabilitado até existir canal real.",
    "updated_at": "2026-06-02T10:00:00Z"
  },
  {
    "key": "welcome_message",
    "value_json": "Olá! Vou te ajudar...",
    "is_sensitive": false,
    "description": "Mensagem inicial exibida ao candidato.",
    "updated_at": "2026-06-02T10:00:00Z"
  }
]
```

Settings com `is_sensitive=true` retornam `value_json: null`.

## 6. PATCH /api/v1/admin/assistant/settings/{key}

**Fase futura. Não implementado em OP-6H-3C.**

`{ "value": <tipado pela chave> }`. Validações:
- `key` ∈ catálogo; tipo de `value` compatível.
- `channels_enabled` **não** aceita `"whatsapp"` nesta fase (422).
- Inteiros dentro das faixas (`default_max_attempts` 1..10, etc.).
- Limites de **IA** não são definidos aqui (delegados ao `aiLimitsService`).
- `is_sensitive=true` exige role `admin`; senão **403**.

Resposta: a chave atualizada. Auditoria `admin.assistant.setting.update`
(before/after). Invalida cache do loader.

## Erros (padrão do projeto)

`401/403` RBAC · `404` estado/chave inexistente · `422` validação (corpo
`{detail|error}` com mensagem pt-BR) · `409` conflito de `value` duplicado em quick
reply.

## Pendências a confirmar com a engine

1. Forma do *read path*: loader com cache + fallback de código (recomendado) vs.
   leitura direta por turno.
2. RH pode editar settings não sensíveis, ou conteúdo apenas? (recomendação:
   conteúdo + settings não sensíveis).
3. Mensagens de transição de IDENTIFY: manter não editáveis (recomendado) ou editáveis
   com trava de igualdade.
