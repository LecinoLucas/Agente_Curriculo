# OP-2 - Data Model

Data: 2026-06-01

## Estado Atual Relevante

`jobs.location` e um campo texto nullable em `jobs`. Ele participa de respostas de API, busca/listagem de vagas e contratos publicos. A OP-2 deve ser aditiva e preservar esse campo.

A OP-1A criou o cadastro mestre operacional:

- `operational_groups`
- `location_groups`
- `operational_units`

## Modelo Recomendado

### Novos Campos em `jobs`

Todos os campos devem ser nullable para compatibilidade com vagas existentes.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `operational_group_id` | UUID nullable FK -> `operational_groups.id` | Grupo interno/Protheus principal da vaga. |
| `location_group_id` | UUID nullable FK -> `location_groups.id` | Localidade humana principal da vaga. |
| `allocation_mode` | string nullable | Semantica do vinculo operacional. |

Valores recomendados para `allocation_mode`:

- `single_unit`: vaga direcionada a uma unidade operacional.
- `multi_unit`: vaga direcionada a varias unidades especificas.
- `location_pool`: vaga-pool por localidade, com unidades associadas ou selecionaveis.
- `corporate`: vaga corporativa/escritorio com vinculo operacional opcional.
- `null`: vaga legada/texto livre, sem vinculo operacional.

Recomendacao: usar `VARCHAR(30)` com `CHECK` em vez de enum PostgreSQL na primeira fase. Isso simplifica rollback e expansao controlada de modos.

### Nova Tabela `job_units`

Tabela de associacao entre vagas e unidades operacionais.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID PK | Identificador do vinculo. |
| `job_id` | UUID NOT NULL FK -> `jobs.id` | Vaga vinculada. |
| `operational_unit_id` | UUID NOT NULL FK -> `operational_units.id` | Filial/posto real. |
| `openings_count` | integer nullable | Quantidade de vagas da unidade, quando conhecida. |
| `is_active` | boolean NOT NULL default true | Inativacao logica do vinculo. |
| `priority` | integer nullable | Ordenacao/preferencia operacional. |
| `created_at` | timestamp | Criacao do vinculo. |
| `updated_at` | timestamp | Ultima atualizacao do vinculo. |

Constraints recomendadas:

- `UNIQUE (job_id, operational_unit_id)`
- `CHECK (openings_count IS NULL OR openings_count > 0)`
- `CHECK (priority IS NULL OR priority >= 0)`

Indices recomendados:

- `idx_jobs_operational_group_id`
- `idx_jobs_location_group_id`
- `idx_jobs_allocation_mode`
- `idx_job_units_job_id`
- `idx_job_units_operational_unit_id`
- `idx_job_units_operational_unit_active` em `(operational_unit_id, is_active)`

## Invariantes por Modo

### Legado

Condicao:

- `allocation_mode IS NULL`
- `operational_group_id IS NULL`
- `location_group_id IS NULL`
- zero vinculos ativos em `job_units`

Esse modo representa vagas atuais e nao deve exigir backfill.

### `single_unit`

Regras:

- Deve haver exatamente um `job_units.is_active = true`.
- `operational_group_id` deve corresponder ao `group_id` da unidade.
- `location_group_id` deve corresponder ao `location_group_id` da unidade.
- `jobs.location` continua livre e pode ser diferente do nome da localidade, mas a UI deve sugerir consistencia.

### `multi_unit`

Regras:

- Deve haver uma ou mais unidades ativas.
- Todas as unidades devem pertencer ao mesmo `operational_group_id`.
- `location_group_id` pode ser null se as unidades cruzarem localidades.
- Se `location_group_id` for informado, as unidades devem pertencer a essa localidade.

### `location_pool`

Regras:

- `location_group_id` deve ser informado.
- `operational_group_id` deve ser informado quando as unidades forem do cadastro operacional.
- Unidades ativas sao recomendadas, mas podem ser opcionais se a empresa quiser abrir uma vaga por localidade antes de definir filiais.
- Quando unidades forem informadas, elas devem pertencer a `location_group_id`.

### `corporate`

Regras:

- Pode ter `operational_group_id` do escritorio.
- Pode ter zero ou uma unidade ativa.
- Nao deve exigir unidade para preservar vagas corporativas antigas.

## Sincronizacao e Denormalizacao

Os campos `operational_group_id` e `location_group_id` em `jobs` sao denormalizados de proposito:

- Permitem filtros simples e baratos na listagem de vagas.
- Dao contexto principal da vaga sem sempre carregar `job_units`.
- Facilitam relatorios por grupo e localidade.

O service de vagas deve validar consistencia com `job_units` em toda criacao/atualizacao. A validacao deve acontecer em transacao unica para evitar estado parcial.

## Compatibilidade com `jobs.location`

`jobs.location` permanece:

- Campo de exibicao legado.
- Campo de busca textual existente.
- Campo retornado em APIs publicas e internas.
- Campo aceito em create/update/bulk import.

Os novos campos nao substituem `jobs.location` na OP-2. A camada de resposta pode adicionar um objeto operacional opcional, mas nao deve remover nem mudar o significado de `location`.

## Preparacao para `CandidateApplication`

Nao implementar nesta fase, mas o modelo deve permitir evolucao futura:

- Candidato pode aplicar para uma vaga-pool sem escolher filial imediatamente.
- Futuramente, a candidatura pode registrar `preferred_location_group_id`.
- Futuramente, a candidatura pode registrar `selected_operational_unit_id` ou `assigned_operational_unit_id`.
- Essas futuras colunas devem pertencer a candidatura/aplicacao, nao a `jobs`, porque a escolha da filial pode variar por candidato.

## Alternativas Rejeitadas

### Criar uma vaga por posto

Rejeitada porque duplica pipeline, candidatos, ranking, comunicacao e relatorios. Tambem torna vagas-pool por localidade mais dificeis.

### Remover `jobs.location`

Rejeitada por quebrar contratos existentes e fluxos publicos.

### Backfill automatico por texto

Rejeitado na OP-2 porque `jobs.location` e texto livre, possivelmente ambiguo e historicamente inconsistente. O caminho seguro e relatorio assistido com revisao humana em fase posterior.

### Tornar grupo/localidade/filial obrigatorios

Rejeitada porque quebraria vagas antigas, bulk import e casos corporativos sem estrutura operacional cadastrada.
