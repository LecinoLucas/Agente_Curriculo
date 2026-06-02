# OP-6H - API Contract - Admin do Assistente do Candidato

Data: 2026-06-02
Status: Planejamento. Endpoints são desenho; não implementar nesta fase.

## Princípios

- Prefixo `/api/v1/admin/assistant/...` (padrão `backend/src/interface/api/routers/`).
- Todos os endpoints são **administrativos**, protegidos por RBAC. Nenhum é
  público para candidato.
- O painel **consome** a conversa; quando a engine já expõe algo, **reusar** os
  contratos internos, não duplicar lógica.
- Nenhuma resposta retorna CPF completo, telefone completo, `cpf_hash` ou
  `context_json` cru com PII. Apenas máscaras (`cpf_last4`, telefone mascarado).
- Toda mutação grava auditoria (`assistant_admin_audit`).
- IA nunca é chamada por estes endpoints para **decidir**; no máximo sugerir
  intenção (read-only).

## RBAC por endpoint (resumo)

| Endpoint | admin | hr | recruiter | viewer |
| --- | --- | --- | --- | --- |
| GET sessions / {id} / messages | ✓ | ✓ | ✓ (ligadas a vaga) | ro limitado/—|
| GET states | ✓ | ✓ | — | — |
| GET failures | ✓ | ✓ | — | — |
| PATCH failures/{id} | ✓ | ✓ (classificar/handoff) | — | — |
| GET/POST/PATCH intents | ✓ | — | — | — |
| GET settings / PATCH settings/{key} | ✓ | — | — | — |

---

## Aba 1 — Conversas

### GET /api/v1/admin/assistant/sessions
Query: `status`, `state`, `channel`, `has_application`, `has_failure`, `from`,
`to`, `page`, `page_size`.
```json
{
  "items": [
    {
      "id": "uuid",
      "candidate": { "id": "uuid", "display_name": "Maria S.", "cpf_last4": "4725" },
      "channel": "web",
      "current_state": "CHOOSE_LOCATION",
      "status": "active",
      "last_message_preview": "qualquer posto serve",
      "last_message_at": "2026-06-02T10:00:00Z",
      "application_id": "uuid | null",
      "has_failure": false,
      "flagged_for_hr": false
    }
  ],
  "total": 0, "page": 1, "page_size": 20
}
```
`candidate` é `null` para sessão anônima. Nunca inclui CPF/telefone completos.

### GET /api/v1/admin/assistant/sessions/{id}
Detalhe da sessão + resumo do contexto **mascarado** (estado, canal, candidatura,
flags). Não retorna `context_json` cru.

### GET /api/v1/admin/assistant/sessions/{id}/messages
Thread somente leitura:
```json
[
  {
    "id": "uuid",
    "role": "assistant",
    "content": "Em qual localidade você prefere trabalhar?",
    "message_type": "text",
    "state": "CHOOSE_LOCATION",
    "quick_replies": [],
    "created_at": "2026-06-02T09:59:00Z"
  }
]
```
`content` de mensagens do candidato passa por sanitização (mascara dígitos longos).

### (OP-6H-4) Ações de sessão — sempre via engine, auditadas
- `POST /admin/assistant/sessions/{id}/flag-hr` `{ "note": "..." }`
- `POST /admin/assistant/sessions/{id}/close`
- `POST /admin/assistant/sessions/{id}/reopen`
- `GET  /admin/assistant/sessions/{id}/share-context` (link/contexto mascarado)

> Encerrar/reabrir altera `status` da sessão, que pertence à **engine**. O painel
> chama o endpoint da engine; não escreve direto na tabela.

## Aba 2 — Fluxo de perguntas

### GET /api/v1/admin/assistant/states
```json
[
  {
    "state_key": "IDENTIFY",
    "order": 1,
    "prompt_text": "Olá! ... me diga seu CPF ou WhatsApp.",
    "helper_text": null,
    "quick_replies": [
      { "value": "cpf", "label": "Informar CPF" },
      { "value": "whatsapp", "label": "Informar WhatsApp" }
    ],
    "fallback_text": "Não consegui entender. Digite seu CPF ou WhatsApp...",
    "max_attempts": 3,
    "is_active": true,
    "editable_fields": ["prompt_text","helper_text","quick_replies","fallback_text","max_attempts"]
  }
]
```
`next_states`/topologia **não** são editáveis (read-only). Edição de conteúdo
(futura) via `PATCH` restrito a `editable_fields`.

## Aba 3 — Frases e intenções

- `GET /api/v1/admin/assistant/intents` (filtros: `intent`, `is_active`, busca)
- `POST /api/v1/admin/assistant/intents`
  ```json
  { "phrase": "qualquer posto serve", "intent": "choose_unit", "is_active": true }
  ```
- `PATCH /api/v1/admin/assistant/intents/{id}` (frase/intenção/ativo)

Resposta inclui `normalized_phrase`, timestamps. Auditado. `intent` validado
contra o catálogo. **Nunca** dispara transição por si só.

## Aba 4 — Falhas do assistente

### GET /api/v1/admin/assistant/failures
Query: `status`, `state`, `reason`, `from`, `to`, paginação.
```json
{
  "items": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "state": "CHOOSE_LOCATION",
      "raw_message": "moro perto da br",
      "reason": "not_understood",
      "attempts": 2,
      "candidate": { "display_name": "Anônimo" },
      "status": "open",
      "suggested_intent": "choose_location",
      "created_at": "2026-06-02T10:01:00Z"
    }
  ]
}
```

### PATCH /api/v1/admin/assistant/failures/{id}
```json
{
  "status": "resolved",
  "classified_intent": "choose_location",
  "create_known_phrase": true,
  "forward_to_hr": false
}
```
Efeitos: marca status; opcionalmente cria `assistant_intents`
(`create_known_phrase`); opcionalmente encaminha ao RH. Auditado. **Não** decide
nada sobre o candidato (não reprova/contrata).

## Aba 5 — Configurações

### GET /api/v1/admin/assistant/settings
```json
{
  "assistant_enabled": true,
  "welcome_message": "Olá! Vou te ajudar a encontrar uma vaga...",
  "fallback_message": "Não consegui entender...",
  "max_attempts_per_state": 3,
  "offer_hr_after_attempts": 2,
  "session_expiration_minutes": 60,
  "require_otp": false,
  "channels_enabled": ["web"]
}
```

### PATCH /api/v1/admin/assistant/settings/{key}
`{ "value": ... }`. Regras: `channels_enabled` **não** aceita `whatsapp` nesta
fase; limites validados contra a política do `aiLimitsService`; valores que
quebrariam o chat são rejeitados. Auditado.

## Auditoria

Toda rota de mutação grava em `assistant_admin_audit` (ou AuditLogs) com
`actor_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`.

## Pendências a confirmar com a engine

1. Endpoints internos já existentes para status de sessão (close/reopen/flag).
2. Origem dos `states` (introspecção da state machine vs. tabela de conteúdo).
3. `failures` como tabela emitida pela engine ou view derivada.
4. Fonte única de limites de IA.
