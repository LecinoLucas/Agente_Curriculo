# OP-5 - Data Model

Data: 2026-06-01

## Estado Atual Relevante

Modelos existentes importantes:

- `candidates`: pessoa/candidato. Pode ter `user_id = null`; ja guarda `cpf_hash` e `cpf_last4`, alem de campos de origem e LGPD usados pelo fluxo publico atual.
- `jobs`: vaga. OP-2 adicionou grupo, localidade, modo de alocacao e `job_units`.
- `operational_groups`, `location_groups`, `operational_units`: cadastro mestre operacional.
- `candidate_job_pipeline`: vinculo candidato-vaga no pipeline. Possui constraint parcial de apenas um pipeline ativo por candidato.
- `resumes` e `resume_versions`: curriculo e versao submetida.

O novo modelo deve ficar entre `Candidate` e `candidate_job_pipeline`.

## CandidateApplicationModel

Tabela proposta: `candidate_applications`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | Identificador da aplicacao/intake. |
| `candidate_id` | UUID FK -> `candidates.id` | Obrigatorio depois que o candidato for resolvido/criado. |
| `job_id` | UUID nullable FK -> `jobs.id` | Vaga desejada, quando definida. |
| `source` | varchar(30) | `web_portal`, `bot`, `whatsapp`, `staff`, `legacy_public`. |
| `status` | varchar(40) | Estado da aplicacao, separado do pipeline. |
| `preferred_location_group_id` | UUID nullable FK -> `location_groups.id` | Localidade preferida. |
| `preferred_unit_id` | UUID nullable FK -> `operational_units.id` | Filial preferida. |
| `accepts_any_unit_in_location` | boolean not null default false | Representa qualquer filial da localidade. |
| `desired_job_area` | varchar(100) nullable | Area/familia de funcao desejada. |
| `desired_role` | varchar(255) nullable | Funcao declarada em texto controlado ou livre. |
| `desired_shift` | varchar(50) nullable | Turno/disponibilidade resumida. |
| `availability_notes` | text nullable | Observacoes de disponibilidade. |
| `resume_version_id` | UUID nullable FK -> `resume_versions.id` | Curriculo usado na submissao, quando houver. |
| `lgpd_consent_at` | timestamptz nullable | Data/hora do consentimento desta aplicacao. |
| `lgpd_consent_version` | varchar(50) nullable | Versao do termo aceito. |
| `idempotency_key` | varchar(255) nullable | Chave enviada pelo cliente ou gerada por intake. |
| `submitted_at` | timestamptz nullable | Quando virou submissao formal. |
| `linked_to_pipeline_at` | timestamptz nullable | Quando gerou/associou pipeline. |
| `pipeline_candidate_id` | UUID nullable | Campo opcional para facilitar auditoria futura, se o pipeline continuar com PK composta. |
| `pipeline_job_id` | UUID nullable | Complemento de auditoria futura para pipeline atual. |
| `metadata` | JSONB nullable | Dados tecnicos nao sensiveis: user agent, utm, canal, versao do formulario. |
| `created_at` | timestamptz not null | Criacao. |
| `updated_at` | timestamptz not null | Atualizacao. |
| `deleted_at` | timestamptz nullable | Soft delete. |

### Valores de `source`

- `web_portal`: portal web horizontal.
- `bot`: bot futuro, nao implementar antes do portal web.
- `whatsapp`: futuro; nao propor como primeira entrega.
- `staff`: criado por usuario interno.
- `legacy_public`: usado apenas se o fluxo publico atual for adaptado para gravar aplicacao alem de manter comportamento legado.

Recomendacao: usar `VARCHAR` + `CHECK` na primeira fase, nao enum PostgreSQL, para rollback e expansao simples.

### Valores de `status`

- `started`: intake iniciado, pode estar incompleto.
- `qualified`: dados minimos suficientes para avaliacao humana ou proxima etapa.
- `submitted`: candidato submeteu formalmente.
- `linked_to_pipeline`: aplicacao ja virou vinculo de pipeline.
- `abandoned`: intake expirado/incompleto.
- `cancelled`: cancelado pelo candidato ou RH.

`status` nao substitui `candidate_job_pipeline.relationship_status`.

### Constraints Recomendadas

- `CHECK source IN (...)`.
- `CHECK status IN (...)`.
- `CHECK accepts_any_unit_in_location = false OR preferred_location_group_id IS NOT NULL`.
- `CHECK NOT (accepts_any_unit_in_location = true AND preferred_unit_id IS NOT NULL)`.
- `CHECK submitted_at IS NOT NULL` quando `status IN ('submitted', 'linked_to_pipeline')`.
- `CHECK linked_to_pipeline_at IS NOT NULL` quando `status = 'linked_to_pipeline'`.
- `UNIQUE (source, idempotency_key)` parcial onde `idempotency_key IS NOT NULL`.

### Duplicidade de Aplicacao Ativa

Recomendacao conservadora:

- permitir varias aplicacoes historicas por candidato;
- bloquear duplicidade ativa equivalente.

Indice parcial recomendado:

```text
UNIQUE (
  candidate_id,
  COALESCE(job_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(preferred_location_group_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(preferred_unit_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(desired_job_area, '')
)
WHERE status IN ('started', 'qualified', 'submitted')
  AND deleted_at IS NULL;
```

Se a implementacao preferir evitar `COALESCE` em indice unico por compatibilidade SQLite/testes, aplicar a regra no service e criar indices nao unicos para busca.

### Indices

- `idx_candidate_applications_candidate_id`
- `idx_candidate_applications_job_id`
- `idx_candidate_applications_status`
- `idx_candidate_applications_source`
- `idx_candidate_applications_location_group`
- `idx_candidate_applications_preferred_unit`
- `idx_candidate_applications_created_at`
- `idx_candidate_applications_idempotency`

## CandidateLocationPreferenceModel

Tabela proposta: `candidate_location_preferences`.

Preferencias persistentes do candidato, independentes de uma aplicacao especifica. Elas podem alimentar novas aplicacoes, portal futuro e atendimento humano.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | Identificador da preferencia. |
| `candidate_id` | UUID FK -> `candidates.id` | Dono da preferencia. |
| `location_group_id` | UUID FK -> `location_groups.id` | Localidade preferida. |
| `operational_unit_id` | UUID nullable FK -> `operational_units.id` | Filial especifica opcional. |
| `desired_shift` | varchar(50) nullable | Turno preferido para aquela localidade/filial. |
| `priority` | integer not null default 1 | Ordenacao de preferencia. |
| `created_at` | timestamptz not null | Criacao. |

### Constraints

- `CHECK priority > 0`.
- `UNIQUE (candidate_id, location_group_id, operational_unit_id, desired_shift)` parcial para registros ativos, se `deleted_at` for adicionado.
- Se `operational_unit_id` for informado, a unidade deve pertencer a `location_group_id`. Essa validacao deve ficar no service; trigger pode ser considerada depois.

## Relacao Futura com Pipeline

Nao alterar `candidate_job_pipeline` na primeira implementacao se isso aumentar risco.

Plano em duas etapas:

1. OP-5 cria `CandidateApplication` independente.
2. Fase posterior adiciona `application_id nullable` em `candidate_job_pipeline`, com FK para `candidate_applications.id`.

Enquanto `candidate_job_pipeline` usa PK composta `(candidate_id, job_id)`, a aplicacao pode guardar `pipeline_candidate_id` e `pipeline_job_id` como referencia auditavel futura, mas a recomendacao preferida e adicionar `application_id` nullable ao pipeline em fase propria.

## Regras de LGPD e CPF

- `CandidateApplication` nao deve armazenar CPF em claro.
- CPF deve continuar sendo normalizado/hasheado na camada de `Candidate`.
- Responses publicos nao retornam CPF, `cpf_hash`, `cpf_last4`, `metadata`, `idempotency_key` ou campos internos.
- Consentimento da aplicacao deve ser gravado mesmo se `Candidate.lgpd_consent_at` ja existir, porque cada submissao pode aceitar versao diferente do termo.

## Alternativas Rejeitadas

### Usar apenas `Candidate`

Rejeitada porque mistura identidade da pessoa com intencao de candidatura, preferencias por localidade e estado transacional do intake.

### Criar pipeline imediatamente

Rejeitada porque ativa a constraint de um pipeline ativo por candidato e mistura lead incompleto com processo seletivo real.

### Guardar preferencias apenas em JSON

Rejeitada para campos principais, porque filtros por localidade, filial, status e candidato precisam ser indexaveis e auditaveis. JSON pode ser usado apenas para metadados tecnicos nao criticos.

### Inferir filial/localidade por codigo textual

Rejeitada por risco operacional. A consistencia deve usar FK real para `operational_units.location_group_id`.
