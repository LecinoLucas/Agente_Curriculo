# OP-5 - State Model

Data: 2026-06-01

## Separacao de Estados

`CandidateApplication.status` representa o estado do intake/candidatura estruturada.

`candidate_job_pipeline.relationship_status`, `pipeline_status` e `pipeline_stage` representam o processo seletivo real.

Esses estados nao devem ser fundidos.

## Estados de CandidateApplication

| Estado | Significado |
| --- | --- |
| `started` | Intake iniciado. Pode faltar consentimento, curriculo, vaga ou preferencia. |
| `qualified` | Dados minimos suficientes para RH avaliar ou pedir complemento. |
| `submitted` | Candidato submeteu formalmente com LGPD e dados minimos. |
| `linked_to_pipeline` | Aplicacao foi vinculada ao pipeline. |
| `abandoned` | Intake incompleto expirou ou foi abandonado. |
| `cancelled` | Cancelado pelo candidato/RH antes de virar pipeline. |

## Transicoes Permitidas

```text
started -> qualified
started -> submitted
started -> abandoned
started -> cancelled

qualified -> submitted
qualified -> abandoned
qualified -> cancelled

submitted -> linked_to_pipeline
submitted -> cancelled

abandoned -> started (somente por reabertura explicita ou nova aplicacao)
cancelled -> started (somente por nova aplicacao)
linked_to_pipeline -> terminal no pipeline, nao na aplicacao
```

Recomendacao: nao reabrir a mesma linha de `linked_to_pipeline`. Se o candidato reaplicar, criar nova aplicacao ou registrar novo evento em fase posterior.

## Dados Minimos por Estado

### `started`

Minimo:

- `candidate_id`, se o candidato ja foi resolvido; ou fase futura pode criar intake temporario antes de `candidate_id`;
- `source`;
- `status`.

Nao exigir:

- `job_id`;
- localidade;
- filial;
- curriculo;
- consentimento final.

### `qualified`

Minimo recomendado:

- `candidate_id`;
- pelo menos um destino: `job_id`, `preferred_location_group_id`, `preferred_unit_id`, `desired_job_area` ou `desired_role`;
- contato minimo no `Candidate` associado.

### `submitted`

Minimo recomendado:

- `candidate_id`;
- `lgpd_consent_at`;
- `lgpd_consent_version`;
- pelo menos uma intencao: `job_id`, localidade, filial, area ou funcao;
- `submitted_at`.

Curriculo pode ser exigido pelo produto, mas nao deve ser obrigatorio no modelo se o portal horizontal permitir cadastro inicial sem arquivo.

### `linked_to_pipeline`

Minimo:

- tudo de `submitted`;
- pipeline criado ou associado;
- `linked_to_pipeline_at`.

## Invariantes de Preferencia

### Qualquer filial da localidade

Valido somente quando:

```text
preferred_location_group_id IS NOT NULL
preferred_unit_id IS NULL
accepts_any_unit_in_location = true
```

### Filial especifica

Valido quando:

```text
preferred_unit_id IS NOT NULL
accepts_any_unit_in_location = false
```

Se `preferred_location_group_id` tambem estiver informado, a filial deve ter `operational_units.location_group_id = preferred_location_group_id`.

### Nao inferir por codigo

Nunca inferir grupo/localidade por prefixo do codigo da filial. Sempre usar FK real do cadastro mestre operacional.

## Idempotencia e Duplicidade

### Chave de Idempotencia

Usar `source + idempotency_key` para proteger retries do cliente.

Mesmo payload, mesma chave:

- retornar aplicacao existente.

Mesma chave, payload diferente:

- `409 Conflict`.

### Aplicacao Ativa Equivalente

Aplicacao ativa equivale a:

- mesmo `candidate_id`;
- mesmo `job_id` quando houver;
- mesma localidade/filial preferida quando nao houver vaga;
- mesmo `desired_job_area` ou funcao quando usado como destino principal;
- status em `started`, `qualified` ou `submitted`.

Nao criar duplicidade ativa indevida. Historico terminal pode coexistir.

## Relacao com Pipeline

`CandidateApplication` nao deve criar pipeline automaticamente na fase inicial.

Quando uma aplicacao for vinculada ao pipeline em fase posterior:

1. verificar candidato ativo;
2. verificar vaga publicada/pausada conforme regra atual de pipeline;
3. verificar constraint de um pipeline ativo por candidato;
4. se ja houver pipeline ativo em outra vaga, retornar conflito ou oferecer transferencia explicita;
5. criar/reativar pipeline;
6. marcar aplicacao como `linked_to_pipeline`;
7. gravar evento/auditoria.

## IA e Decisao

IA nao altera `status` para rejeicao/contratacao e nao deve mover pipeline sozinha. Analises podem ser anexadas como subsidio em fase posterior, sempre com decisao humana.
