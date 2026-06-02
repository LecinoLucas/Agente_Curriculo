# OP-5 - API Contract

Data: 2026-06-01

## Principios

- Contratos internos podem expor IDs e estado operacional.
- Contratos publicos devem expor apenas campos necessarios ao candidato.
- Nenhum endpoint deve retornar CPF em claro, `cpf_hash`, `idempotency_key`, `metadata` interno ou diagnosticos de duplicidade sensiveis.
- `CandidateApplication` nao cria pipeline por padrao.
- Endpoints publicos desta pagina sao planejamento; nao implementar antes da fase web.

## Objetos de Contrato

### Application Response Interno

```json
{
  "id": "uuid",
  "candidate_id": "uuid",
  "job_id": "uuid | null",
  "source": "web_portal",
  "status": "submitted",
  "preferred_location_group_id": "uuid | null",
  "preferred_unit_id": "uuid | null",
  "accepts_any_unit_in_location": true,
  "desired_job_area": "operations",
  "desired_role": "Frentista",
  "desired_shift": "morning",
  "availability_notes": "Disponivel aos fins de semana",
  "resume_version_id": "uuid | null",
  "lgpd_consent_at": "2026-06-01T10:00:00Z",
  "lgpd_consent_version": "2026-06",
  "submitted_at": "2026-06-01T10:00:00Z",
  "linked_to_pipeline_at": null,
  "created_at": "2026-06-01T10:00:00Z",
  "updated_at": "2026-06-01T10:00:00Z"
}
```

Campos internos que nao devem ir ao candidato:

- `idempotency_key`
- `metadata`
- `deleted_at`
- `pipeline_candidate_id`
- `pipeline_job_id`
- CPF, hash de CPF ou ultimos digitos, mesmo vindo por join de candidato.

## POST /api/v1/applications

Cria aplicacao por usuario interno ou integracao autenticada.

### Permissoes

- `RecruiterOrAdmin`.
- Futuramente um perfil de atendimento pode criar `source=staff`.

### Payload

```json
{
  "candidate_id": "uuid",
  "job_id": "uuid | null",
  "source": "staff",
  "status": "started",
  "preferred_location_group_id": "uuid | null",
  "preferred_unit_id": "uuid | null",
  "accepts_any_unit_in_location": false,
  "desired_job_area": "operations",
  "desired_role": "Frentista",
  "desired_shift": "morning",
  "availability_notes": "Pode trabalhar em escala",
  "resume_version_id": "uuid | null",
  "lgpd_consent_at": "2026-06-01T10:00:00Z",
  "lgpd_consent_version": "2026-06",
  "idempotency_key": "optional-client-key"
}
```

### Response

- `201 Created`
- Body: Application Response Interno.

### Erros Esperados

- `400`: transicao/estado impossivel.
- `401/403`: sem permissao.
- `404`: candidato, vaga, localidade, filial ou resume version inexistente.
- `409`: aplicacao ativa equivalente ja existe ou idempotency key reutilizada com payload diferente.
- `422`: payload invalido, consentimento exigido ausente, filial incoerente com localidade.

### Idempotencia

- Header recomendado: `Idempotency-Key`.
- Campo aceito em payload interno: `idempotency_key`.
- Se a mesma chave e o mesmo payload chegarem novamente, retornar a aplicacao existente com `200 OK` ou `201` idempotente conforme padrao local escolhido.
- Se a mesma chave chegar com payload diferente, retornar `409`.

## GET /api/v1/applications/{id}

Consulta aplicacao interna.

### Permissoes

- `RecruiterOrAdmin`.
- Candidato autenticado nao deve usar este endpoint interno.

### Response

- `200 OK`: Application Response Interno.

### Erros

- `401/403`: sem permissao.
- `404`: aplicacao nao encontrada ou deletada.

## GET /api/v1/applications

Lista aplicacoes internas.

### Query Params

| Param | Tipo | Regra |
| --- | --- | --- |
| `candidate_id` | UUID | Filtra por candidato. |
| `job_id` | UUID | Filtra por vaga desejada. |
| `status` | string | Pode aceitar multiplos em fase posterior. |
| `source` | string | Filtra origem. |
| `preferred_location_group_id` | UUID | Filtra localidade preferida. |
| `preferred_unit_id` | UUID | Filtra filial preferida. |
| `created_from` | datetime | Inicio de periodo. |
| `created_to` | datetime | Fim de periodo. |
| `page` | integer | Paginacao. |
| `page_size` | integer | Paginacao. |

### Response

```json
{
  "data": [
    {
      "id": "uuid",
      "candidate_id": "uuid",
      "job_id": null,
      "status": "submitted",
      "source": "web_portal",
      "preferred_location_group_id": "uuid",
      "preferred_unit_id": null,
      "accepts_any_unit_in_location": true,
      "desired_role": "Frentista",
      "created_at": "2026-06-01T10:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

### Erros

- `401/403`: sem permissao.
- `422`: filtros invalidos.

## PATCH /api/v1/applications/{id}

Atualiza aplicacao interna.

### Semantica

- Campo omitido: nao altera.
- Campo nullable enviado como `null`: limpa quando a regra permitir.
- `status` segue transicoes do `STATE_MODEL.md`.
- Nao deve criar pipeline automaticamente, exceto se uma fase futura criar endpoint explicito de link.

### Payload

```json
{
  "job_id": "uuid | null",
  "status": "qualified",
  "preferred_location_group_id": "uuid | null",
  "preferred_unit_id": "uuid | null",
  "accepts_any_unit_in_location": true,
  "desired_job_area": "operations",
  "desired_role": "Frentista",
  "desired_shift": "afternoon",
  "availability_notes": "Disponivel a partir de julho",
  "resume_version_id": "uuid | null"
}
```

### Response

- `200 OK`: Application Response Interno.

### Erros

- `400`: transicao de status invalida.
- `401/403`: sem permissao.
- `404`: aplicacao ou recurso referenciado inexistente.
- `409`: duplicidade ativa equivalente.
- `422`: preferencia incoerente.

## Endpoint Futuro: POST /api/v1/public/applications

Planejamento para portal web horizontal sem login. Nao implementar antes da fase web.

### Permissao

- Publico, com rate limit e protecoes anti abuso.
- Nao exige login.
- OTP/validacao sera fase futura; nao bloquear OP-5 backend interno.

### Payload Publico Planejado

```json
{
  "full_name": "Maria Silva",
  "email": "maria@example.com",
  "phone": "98999999999",
  "cpf": "nunca-retornar",
  "job_id": "uuid | null",
  "preferred_location_group_id": "uuid | null",
  "preferred_unit_id": "uuid | null",
  "accepts_any_unit_in_location": true,
  "desired_job_area": "operations",
  "desired_role": "Frentista",
  "desired_shift": "morning",
  "lgpd_consent": true,
  "lgpd_consent_version": "2026-06",
  "idempotency_key": "browser-generated-key"
}
```

### Response Publico Planejado

```json
{
  "application_id": "uuid",
  "candidate_id": "uuid",
  "status": "submitted",
  "job_id": "uuid | null",
  "preferred_location_group_id": "uuid | null",
  "preferred_unit_id": "uuid | null",
  "accepts_any_unit_in_location": true,
  "message": "Candidatura recebida."
}
```

Nao retornar:

- CPF;
- hash de CPF;
- status de duplicidade detalhado;
- `idempotency_key`;
- dados internos de pipeline;
- dados internos de analise IA.

### Erros Publicos Planejados

- `202` ou `201`: considerar resposta generica em casos sensiveis para evitar enumeracao.
- `400`: payload impossivel.
- `409`: idempotency key com payload diferente, se o produto aceitar expor.
- `422`: LGPD ausente, preferencia incoerente, campos obrigatorios invalidos.
- `429`: rate limit.

## Endpoint Futuro: PATCH /api/v1/public/applications/{id}/preferences

Atualiza preferencias publicas antes de vincular ao pipeline.

### Permissao

- Publico apenas com token de acesso curto, OTP ou sessao futura.
- Sem token/validacao, retornar `401/403`.

### Payload

```json
{
  "preferred_location_group_id": "uuid | null",
  "preferred_unit_id": "uuid | null",
  "accepts_any_unit_in_location": true,
  "desired_job_area": "operations",
  "desired_role": "Frentista",
  "desired_shift": "night"
}
```

### Response

- `200 OK`: resumo publico da aplicacao.

### Erros

- `401/403`: token/OTP ausente ou invalido.
- `404`: aplicacao nao encontrada no escopo do token.
- `409`: aplicacao ja vinculada ao pipeline e nao editavel publicamente.
- `422`: preferencia incoerente.

## Futuro Endpoint Explicitamente Recomendado

Para vincular ao pipeline, criar fase posterior:

- `POST /api/v1/applications/{id}/link-to-pipeline`

Esse endpoint deve:

- exigir usuario interno;
- verificar se a aplicacao esta `submitted` ou `qualified`;
- respeitar a constraint de um pipeline ativo por candidato;
- criar ou reativar entrada no pipeline de forma transacional;
- marcar aplicacao como `linked_to_pipeline`.

Nao colocar essa acao dentro de `PATCH /applications/{id}` para evitar efeitos colaterais escondidos.
