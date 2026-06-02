# OP-6E - API Contract - Admin do Assistente do Candidato

Data: 2026-06-01
Status: Planejamento. Endpoints abaixo são desenho; não implementar antes de
OP-6B publicar o Conversation Engine.

## Princípios

- Prefixo `/api/v1`, padrão atual (`backend/src/interface/api/routers/`).
- Endpoints **administrativos**, protegidos por RBAC admin/RH. Nenhum é público
  para candidato.
- A tela **consome** conversa de OP-6B; quando o endpoint já existir em OP-6B,
  **reusar**, não duplicar. Os contratos de conversa abaixo marcam **[reusar de
  OP-6B se existir]**.
- Nenhum endpoint retorna CPF em claro, `cpf_hash`, ou dados sensíveis do
  candidato além do necessário para identificação na lista.
- Toda mutação registra auditoria.
- IA nunca é chamada por estes endpoints para **decidir** algo; no máximo
  sugerir intenção (read-only).

## Aba 1 - Conversas

### GET /api/v1/admin/assistant/sessions  [reusar de OP-6B se existir]
Lista de conversas com filtros.

Query: `status`, `state`, `channel`, `has_application`, `from`, `to`, `page`,
`page_size`.

Resposta (item):
```json
{
  "id": "uuid",
  "candidate": { "id": "uuid", "display_name": "Maria S." },
  "current_state": "ask_location",
  "status": "waiting",
  "channel": "web",
  "last_message": { "preview": "qualquer posto em Peritoró", "at": "2026-06-01T10:00:00Z" },
  "candidate_application_id": "uuid | null"
}
```

### GET /api/v1/admin/assistant/sessions/{id}  [reusar de OP-6B se existir]
Detalhe + thread de mensagens (somente leitura).
```json
{
  "id": "uuid",
  "candidate": { "id": "uuid", "display_name": "Maria S." },
  "status": "waiting",
  "current_state": "ask_location",
  "candidate_application_id": "uuid | null",
  "messages": [
    {
      "id": "uuid",
      "role": "candidate",
      "content": "quero vaga de frentista",
      "state_at_message": "ask_role",
      "interpreted_intent": { "intent_type": "desired_role", "value": "frentista" },
      "was_understood": true,
      "created_at": "2026-06-01T09:59:00Z"
    }
  ]
}
```

### POST /api/v1/admin/assistant/sessions/{id}/abandon  [reusar de OP-6B se existir]
Marca a sessão como `abandoned`. Body opcional `{ "reason": "..." }`. Auditado.

### POST /api/v1/admin/assistant/sessions/{id}/handoff  [reusar de OP-6B se existir]
Encaminha para RH. Body `{ "assignee_id": "uuid | null", "note": "..." }`.
Define `status=handed_off`, `handed_off_to`. Auditado.

> Nota: abandon/handoff alteram estado de sessão, que é de **OP-6B**. Se OP-6B já
> oferecer esses endpoints, esta tela os consome. Caso contrário, OP-6B deve
> expô-los; OP-6E não escreve direto na tabela.

## Aba 2 - Fluxo de perguntas

### GET /api/v1/admin/assistant/flow/states  [reusar de OP-6B se existir]
```json
[
  {
    "state_key": "ask_role",
    "prompt_text": "Qual vaga você procura?",
    "quick_replies": [ { "label": "Frentista", "value": "frentista" } ],
    "next_states": ["ask_location"],
    "is_active": true
  }
]
```

### PATCH /api/v1/admin/assistant/flow/states/{state_key}  [OP-6E, se conteúdo for editável]
Body: `{ "prompt_text": "...", "quick_replies": [...], "is_active": true }`.
**Não** edita `next_states` (lógica de transição é de OP-6B). Auditado.

## Aba 3 - Frases e intenções

### GET /api/v1/admin/assistant/intents
Lista, com filtro por `intent_type`, `is_active`, busca por `phrase`.

### POST /api/v1/admin/assistant/intents
```json
{
  "phrase": "qualquer posto em Peritoró",
  "intent_type": "location",
  "intent_value": "Peritoró",
  "target_location_group_id": "uuid | null",
  "target_unit_id": null,
  "examples": ["qualquer posto em peritoro", "qq posto peritoro"],
  "is_active": true
}
```
Resposta inclui `id`, `source`, `created_by`, timestamps. Auditado.

### PATCH /api/v1/admin/assistant/intents/{id}
Atualiza frase/intenção/valor/alvo/ativo. Auditado.

### DELETE /api/v1/admin/assistant/intents/{id}
Soft delete / `is_active=false`. Auditado.

## Aba 4 - Falhas do assistente

### GET /api/v1/admin/assistant/failures
Lista de mensagens não entendidas (derivada de OP-6B):
```json
{
  "message_id": "uuid",
  "content": "trabaio perto da br",
  "state_at_message": "ask_location",
  "occurrences": 4,
  "suggested_intent": { "intent_type": "location", "value": "BR (proximidade)" },
  "review_status": "open"
}
```

### POST /api/v1/admin/assistant/failures/{message_id}/map
Mapeia a falha para uma intenção (cria/atualiza `assistant_intents`):
```json
{
  "intent_type": "location",
  "intent_value": "BR-316",
  "target_location_group_id": "uuid | null",
  "phrase_override": "trabalhar perto da BR"
}
```
Efeito: cria intenção com `source=from_failure`, marca `review_status=mapped`.
Auditado. **Não dispara** nenhuma decisão de pipeline/aprovação.

### POST /api/v1/admin/assistant/failures/{message_id}/ignore
`review_status=ignored`. Auditado.

## Aba 5 - Configurações

### GET /api/v1/admin/assistant/settings
```json
{
  "channel_web_enabled": true,
  "channel_whatsapp_enabled": false,
  "welcome_message": "Olá! Vamos achar sua vaga.",
  "not_understood_message": "Não entendi, pode escolher uma opção?",
  "handoff_message": "Vou te encaminhar para o RH.",
  "closing_message": "Obrigado!",
  "ai_max_tokens_per_session": 4000,
  "ai_max_calls_per_session": 6,
  "ai_fallback_behavior": "quick_replies_only"
}
```

### PUT /api/v1/admin/assistant/settings
Atualiza configurações. `channel_whatsapp_enabled` deve **rejeitar** `true`
nesta fase (placeholder). Limites de IA devem validar contra a política do
`aiLimitsService`. Auditado.

## Auditoria

Toda rota de mutação grava em `assistant_admin_audit` (ou na infra de AuditLogs
existente) com `actor_id`, `action`, `target_type`, `target_id`, `before`,
`after`.

## Pendências a confirmar com OP-6B

1. Nomes/campos reais de `conversation_sessions` e `conversation_messages`.
2. Quais endpoints de sessão (`abandon`, `handoff`, listagem) OP-6B já expõe.
3. Se o conteúdo dos estados é editável aqui ou pertence só ao OP-6B.
4. Se "falhas" é tabela ou view sobre mensagens.
5. Fonte de verdade dos limites de IA (`aiLimitsService` vs. tabela nova).
