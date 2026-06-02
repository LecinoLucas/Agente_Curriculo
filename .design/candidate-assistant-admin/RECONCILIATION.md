# OP-6H-F0 — Reconciliação: Plano vs. Schema Real

Data: 2026-06-02
Status: Reconciliação concluída. OP-6H-1 pronta para implementação.
Autoria: leitura direta dos modelos e serviços no commit atual.

---

## 1. O que existe hoje no schema real

### conversation_sessions

| Campo | Tipo | Disponível | Observação |
| --- | --- | --- | --- |
| `id` | UUID PK | ✅ | Session ID |
| `candidate_id` | UUID FK→candidates nullable | ✅ | null = sessão anônima |
| `application_id` | UUID FK→candidate_applications nullable | ✅ | vinculado pelo OP-6E |
| `channel` | varchar(30) | ✅ | `web` | `whatsapp` |
| `current_state` | varchar(50) | ✅ | 11 estados: IDENTIFY, VERIFY_OTP, CHOOSE_LOCATION, CHOOSE_UNIT_OR_ANY, CHOOSE_FUNCTION, CHOOSE_SHIFT, SHOW_JOBS, COLLECT_RESUME, CONFIRM_APPLICATION, DONE |
| `status` | varchar(30) | ✅ | `active` \| `completed` \| `abandoned` \| `cancelled` |
| `context_json` | JSONB | ✅ | **Ver seção 2 para chaves seguras** |
| `last_message_at` | timestamptz | ✅ | Útil para "última interação" |
| `created_at` | timestamptz | ✅ | |
| `updated_at` | timestamptz | ✅ | |
| `deleted_at` | timestamptz nullable | ✅ | Soft-delete; o repo já filtra `deleted_at IS NULL` |

Índices já existentes: `candidate_id`, `application_id`, `status`, `current_state`, `last_message_at`.

### conversation_messages

| Campo | Tipo | Disponível | Observação |
| --- | --- | --- | --- |
| `id` | UUID PK | ✅ | |
| `session_id` | UUID FK→sessions CASCADE | ✅ | |
| `role` | varchar(20) | ✅ | `candidate` \| `assistant` \| `system` |
| `content` | text | ✅ | **Texto livre — deve ser sanitizado (ver PII)** |
| `message_type` | varchar(30) | ✅ | `text` \| `quick_reply` \| `system` |
| `interpreted_intent` | varchar(100) nullable | ✅ | Intenção interpretada, quando houver |
| `metadata_json` | JSONB nullable | ✅ | Para assistente: `{state, quick_replies[{value,label}]}` |
| `created_at` | timestamptz | ✅ | |

Índices: `session_id`, `created_at`.
**Sem `direction` na tabela** — direção é derivada de `role` (`candidate`→`inbound`, `assistant`→`outbound`).

### candidates (PII relevante)

| Campo | Disponível | PII | Para admin |
| --- | --- | --- | --- |
| `id` | ✅ | — | FK para join |
| `full_name` | ✅ | **SIM** | Mascarar: exibir apenas primeiro nome + inicial |
| `email` | ✅ | **SIM** | **Não exibir** no painel de conversas |
| `phone` | ✅ | **SIM** | **Não exibir** completo |
| `cpf` | ✅ | **SIM — texto puro** | **Nunca exibir** |
| `cpf_hash` | ✅ | hash | Nunca exibir |
| `cpf_last4` | ✅ | parcial | Pode exibir se `identity_verified=true` no contexto |
| `deleted_at` | ✅ | — | Filtrar deleted |

### candidate_applications

| Campo | Disponível | Para admin |
| --- | --- | --- |
| `id` | ✅ | Link da sessão para candidatura |
| `candidate_id` | ✅ | FK |
| `job_id` | ✅ | Vaga vinculada (nullable) |
| `source` | ✅ | `bot`, `web_portal`, etc. |
| `status` | ✅ | `started`\|`qualified`\|`submitted`\|`linked_to_pipeline`\|`abandoned`\|`cancelled` |
| `desired_job_area` | ✅ | Função desejada |
| `desired_shift` | ✅ | Turno |
| `preferred_location_group_id` | ✅ | Localidade |
| `preferred_unit_id` | ✅ | Unidade |
| `accepts_any_unit_in_location` | ✅ | |

### candidate_job_pipeline (OP-6G)

| Campo | Disponível | Para admin |
| --- | --- | --- |
| `candidate_job_pipeline_id` | ✅ | ID do registro no pipeline |
| `candidate_id` | ✅ | FK |
| `job_id` | ✅ | FK |
| `application_id` | ✅ | FK→candidate_applications (adicionado OP-6G) |
| `pipeline_stage` | ✅ | `entry`, ... `rejected` |
| `link_status` | ✅ | `active`, `removed`, etc. |
| `relationship_status` | ✅ | `active`, `hired`, etc. |
| `is_terminal` | ✅ | booleano |

---

## 2. context_json — chaves seguras e inseguras

O `context_json` é o JSONB de contexto da sessão. Não deve ser exposto cru ao admin; apenas chaves não-sensíveis devem aparecer.

| Chave | Origem | Seguro exibir? | Observação |
| --- | --- | --- | --- |
| `identifier_type` | OP-6F | ✅ | `cpf` ou `whatsapp` |
| `cpf_last4` | OP-6F | ✅ com cuidado | Exibir somente se `identity_verified=true` |
| `identifier_unresolved` | OP-6F | ✅ | Indica candidato não encontrado |
| `identity_verified` | OP-6F.2 (OTP) | ✅ | Indica OTP verificado |
| `location_hint` | OP-6C | ✅ | Texto digitado pelo candidato |
| `preference` | OP-6C | ✅ | `any_in_location` ou `choose_unit` |
| `desired_function` | OP-6C | ✅ | Texto livre |
| `desired_shift` | OP-6C | ✅ | Turno escolhido |
| `show_jobs_ack` | OP-6C | ✅ | Ack de continuação |
| `resume_choice` | OP-6C | ✅ | `send_resume` ou `skip_resume` |
| `confirmation` | OP-6C | ✅ | `confirm` ou `review` |
| `identifier_raw` | Nunca armazenado | — | A engine garante que nunca é salvo |

**Regra**: nunca enviar o `context_json` cru ao frontend. Projetar apenas as chaves listadas acima como campos explícitos na resposta.

---

## 3. Análise do plano OP-6H-PLAN vs. realidade

### ✅ Confirmados (existem hoje, sem migration)

- `conversation_sessions` com todos os campos previstos, incluindo `application_id` (FK já existe).
- `candidate_id` nullable → sessão anônima identificável.
- `context_json` com chaves seguras deriváveis.
- `candidate_applications.status` com todos os valores previstos, incluindo `linked_to_pipeline`.
- `candidate_job_pipeline.application_id` presente (OP-6G adicionou).
- `candidates.cpf_last4` e `cpf_hash` presentes (OP-6F.1 adicionou e backfillou).
- Índices úteis para filtros e joins: status, state, last_message_at, candidate_id.

### ⚠️ Gaps encontrados (relatados no plano como suposições)

1. **Sem tabela `assistant_failures`**: não existe nada em código. Mensagens não-entendidas podem ser inferidas por `role='candidate' AND message_type='text'` + heurística, mas não há campo `was_understood` na `conversation_messages`. Para OP-6H-1 (read-only) isso não bloqueia; os badges de "atenção" precisarão de lógica derivada ou são postergados para OP-6H-2.

2. **`has_failure_signal` / `needs_attention`**: não existe campo nem tabela. Para OP-6H-1, exibir apenas informações diretas da sessão sem badge de falha é o caminho seguro. Badge pode ser calculado como `status='active' AND current_state IN ('IDENTIFY','VERIFY_OTP') AND last_message_at < agora - threshold` (sessão presa).

3. **Sem endpoint admin existente**: `/api/v1/admin/assistant/*` não existe. Todos os 3 endpoints para OP-6H-1 precisam ser criados. O padrão de `admin_audit_logs.py` é o template correto (prefixo `/admin/*`, `AdminOnly` ou `HrRecruiterOrAdmin`, paginação, `PaginatedResponse`).

4. **`direction` não é campo** em `conversation_messages` — derivado de `role` (`candidate`→`inbound`, `assistant`→`outbound`, `system`→`system`). O contrato da OP-6H deve usar `role` diretamente, ou derivar `direction` no service layer.

5. **`candidate_job_pipeline_id` não é a PK** da tabela — é uma UUID gerada separada (a PK legada usa `candidate_id`+`job_id` de forma composta). Para o painel admin, usar `candidate_job_pipeline_id` como identificador do pipeline entry.

6. **Sem campo `handoff_to`/`flagged_for_hr`**: o plano previa ações de handoff para OP-6H-4. Não existe nenhum campo desse tipo. Para OP-6H-1 (somente leitura) não afeta; a implementação de handoff precisará de migration para OP-6H-4.

### ✅ Decisão final: OP-6H-1 não requer migration

Todos os dados para a tela de Conversas read-only existem nas tabelas atuais. A OP-6H-1 é **somente leitura via joins** sobre dados existentes.

---

## 4. Joins necessários para OP-6H-1

```
conversation_sessions (cs)
  LEFT JOIN candidates (c) ON c.id = cs.candidate_id AND c.deleted_at IS NULL
  LEFT JOIN candidate_applications (ca) ON ca.id = cs.application_id
  LEFT JOIN candidate_job_pipeline (p)
      ON p.application_id = cs.application_id    -- OP-6G garantiu este FK
     AND p.relationship_status = 'active'
     AND p.is_terminal = false
WHERE cs.deleted_at IS NULL
```

O join no pipeline via `application_id` (não via `candidate_id`+`job_id`) é o mais direto e correto: vincula o pipeline criado exatamente a partir dessa candidatura.

**Campos selecionados por tabela:**

`cs`: `id`, `candidate_id`, `application_id`, `channel`, `current_state`, `status`, `context_json` (parcial), `last_message_at`, `created_at`

`c`: `full_name` (mascarar), `cpf_last4` (condicional)

`ca`: `status AS application_status`, `job_id`, `source AS application_source`

`p`: `candidate_job_pipeline_id AS pipeline_id`, `pipeline_stage`

---

## 5. Contrato técnico para OP-6H-1

### GET /api/v1/admin/assistant/sessions

Filtros (query params): `status`, `current_state`, `channel`, `from_date`, `to_date`, `has_application` (bool), `has_pipeline` (bool), `page`, `page_size`.

Permissão: `HrRecruiterOrAdmin` (HR visualiza conversas ligadas a candidaturas; Recruiter também; Admin tudo).

Resposta por item:
```json
{
  "session_id": "uuid",
  "candidate": {
    "id": "uuid | null",
    "display_name": "Maria S.",
    "cpf_last4": "4725 | null",
    "identity_verified": false
  },
  "channel": "web",
  "current_state": "CHOOSE_LOCATION",
  "status": "active",
  "last_message_at": "2026-06-02T10:00:00Z",
  "created_at": "2026-06-02T09:50:00Z",
  "application": {
    "id": "uuid | null",
    "status": "started | null",
    "job_id": "uuid | null"
  },
  "pipeline": {
    "id": "uuid | null",
    "stage": "entry | null"
  },
  "context_summary": {
    "identifier_type": "cpf | null",
    "identity_verified": false,
    "location_hint": "Peritoró | null",
    "desired_function": "Frentista | null",
    "desired_shift": "night | null"
  }
}
```

**Nunca incluir**: `cpf` completo, `phone` completo, `email`, `context_json` cru.

`display_name`: primeiro nome + inicial do sobrenome (ex.: `full_name="Maria Silva"` → `"Maria S."`). Se `candidate_id` for null, retornar `"Candidato anônimo"`.

`cpf_last4`: exibir apenas se `context_json.identity_verified = true` (OTP verificado).

### GET /api/v1/admin/assistant/sessions/{session_id}

Mesmo objeto acima, com `context_summary` completo. Sem `context_json` cru.

Permissão: `HrRecruiterOrAdmin`. Acesso logado (audit) — ver AI_GUARDS.md.

### GET /api/v1/admin/assistant/sessions/{session_id}/messages

Lista de mensagens, ordenada por `created_at ASC, id ASC`. Sem paginação (threads são curtas; max ~20 mensagens típicas).

```json
[
  {
    "id": "uuid",
    "role": "candidate",
    "direction": "inbound",
    "content": "<sanitizado>",
    "message_type": "text | quick_reply | system",
    "quick_replies": [],
    "state_at_message": "CHOOSE_LOCATION",
    "created_at": "..."
  }
]
```

`quick_replies`: extrair de `metadata_json.quick_replies` quando `role='assistant'`.
`state_at_message`: extrair de `metadata_json.state` quando disponível.
`content`: **sanitizar antes de retornar** (ver seção PII abaixo).
`direction`: derivar de `role`.

---

## 6. Mascaramento de PII

| Dado | Regra |
| --- | --- |
| `full_name` | Exibir `"Primeiro U."` (primeiro nome + inicial maiúscula) |
| `email` | Não expor na lista/detalhe de conversas |
| `phone` | Não expor |
| `cpf` | **Nunca** expor |
| `cpf_last4` | Expor somente se `context_json.identity_verified = true` |
| `context_json.cpf_last4` | Repassar como campo explícito; nunca o json cru |
| `content` em mensagens | Passar por sanitização: mascarar sequências de 10-11 dígitos contíguos (possível CPF/WhatsApp) antes de retornar |
| Acesso a PII | Toda chamada ao detalhe de sessão deve gerar log de auditoria (via `AuditLogService` existente) |

**Sanitização de texto livre**: regex `\d{10,11}` → substituir por `[número omitido]`. Aplica a `content` de `role='candidate'` e a valores de `context_json` que possam ter vazado texto livre (defensivo).

---

## 7. Permissões recomendadas para OP-6H-1

Usar `HrRecruiterOrAdmin` (já existe em `src/interface/api/dependencies.py`, linha 92-93):
```python
HrRecruiterOrAdmin = Annotated[
    User, Depends(require_roles(UserRole.HR, UserRole.RECRUITER, UserRole.ADMIN))
]
```

**HR**: visão completa — acompanhar candidatos, ver histórico.
**Recruiter**: visão completa — cruzar com candidaturas/vagas.
**Admin**: visão completa + configurações futuras.
**Viewer**: sem acesso (dados de candidatos são sensíveis).

Não criar nenhuma dependência nova de autenticação; reutilizar `HrRecruiterOrAdmin`.

---

## 8. Arquitetura da implementação (OP-6H-1)

### Arquivos a criar (backend)

```
src/interface/api/routers/admin_assistant.py
src/application/services/admin_assistant_service.py
src/interface/api/schemas/admin_assistant_schemas.py
tests/integration/test_admin_assistant_sessions.py
```

Registrar no `main.py`:
```python
from src.interface.api.routers import admin_assistant
app.include_router(admin_assistant.router, prefix=_PREFIX)
```

### Service layer

`AdminAssistantService` recebe `AsyncSession` e executa as queries com joins descritos na seção 4. Não usa nem `ConversationService` nem `CandidateApplicationService` — consulta SQLAlchemy diretamente para ter controle total sobre a projeção e não expor os métodos destinados ao candidato.

### Sem modelo novo

Nenhuma tabela nova, nenhuma migration. Todos os dados existem.

---

## 9. O que NÃO implementar em OP-6H-1

- **Sem `assistant_failures`**: não existe tabela; badge de falha pode ser derivado de heurística na OP-6H-2.
- **Sem `has_failure_signal` dinâmico**: requer nova tabela ou polling de mensagens — OP-6H-2.
- **Sem ações de mutação**: sem close/reopen/flag/handoff — OP-6H-4.
- **Sem edição de fluxo, frases ou configurações**: OP-6H-3/5.
- **Sem `context_json` cru** exposto ao frontend.

---

## 10. Riscos de PII confirmados

| Risco | Severidade | Confirmado no código |
| --- | --- | --- |
| `candidates.cpf` em texto puro na tabela | Alto | ✅ (`Mapped[Optional[str]]`) |
| `candidates.phone` sem máscara | Alto | ✅ |
| `content` de mensagens pode conter CPF digitado | Alto | ✅ (texto livre no chat) |
| `context_json.cpf_last4` derivável de sessão | Médio | ✅ (chave existe quando identifier_type=cpf) |
| `context_json` cru contém location_hint, preference etc. | Baixo | ✅ (não-sensível, mas não deve ir cru) |

**Principal risco não óbvio**: o candidato pode ter digitado o CPF completo em texto livre (ex.: em IDENTIFY antes do OTP), e esse texto pode ter sido salvo como `content` em `conversation_messages`. A sanitização de mensagens antes de retornar é obrigatória.

---

## 11. Próxima fase implementável

**OP-6H-1 está pronta para implementação.**

Pré-condições: todas atendidas.
- Tabelas existem com todos os campos necessários ✅
- FKs `application_id` e `pipeline.application_id` existem ✅
- `HrRecruiterOrAdmin` dep existe ✅
- `PaginatedResponse` schema existe ✅
- `AuditLogService` para log de acesso existe ✅
- Padrão de admin router (`admin_audit_logs.py`) disponível como template ✅

Estimativa de arquivos novos: 4 (router, service, schemas, tests).
Estimativa de linhas de migração: **zero**.
