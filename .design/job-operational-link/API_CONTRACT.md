# OP-2 - API Contract

Data: 2026-06-01

## Principio de Contrato

A OP-2 deve estender os endpoints de vagas sem quebrar payloads atuais. Campos novos sao opcionais. `location` continua existindo em requests e responses.

Endpoints do Cadastro Mestre Operacional ja existem e devem ser usados pela UI para carregar grupos, localidades e unidades:

- `GET /api/v1/operational-groups`
- `GET /api/v1/location-groups`
- `GET /api/v1/operational-units`

## Job Response Interno

Adicionar campos opcionais ao response interno de vaga.

```json
{
  "id": "uuid",
  "title": "Frentista - Peritoro",
  "location": "Peritoro",
  "operational_group_id": "uuid | null",
  "location_group_id": "uuid | null",
  "allocation_mode": "single_unit | multi_unit | location_pool | corporate | null",
  "operational_group": {
    "id": "uuid",
    "code": "02",
    "name": "Postos"
  },
  "location_group": {
    "id": "uuid",
    "name": "Peritoro",
    "state": "MA",
    "city": "Peritoro",
    "type": "city"
  },
  "operational_units": [
    {
      "id": "uuid",
      "operational_unit_id": "uuid",
      "code": "4301",
      "name": "Posto Exemplo",
      "public_name": "Posto Peritoro",
      "reference_point": "Proximo a ...",
      "group_id": "uuid",
      "location_group_id": "uuid",
      "openings_count": 2,
      "priority": 1,
      "is_active": true
    }
  ]
}
```

Para manter compatibilidade, esses campos devem poder ser omitidos em responses publicos ate que o portal do candidato seja redesenhado. Se adicionados ao portal publico, devem ser opcionais e nao substituir `location`.

## Create Job

Endpoint existente:

- `POST /api/v1/jobs`

Campos novos opcionais no request:

```json
{
  "location": "Peritoro",
  "operational_group_id": "uuid | null",
  "location_group_id": "uuid | null",
  "allocation_mode": "single_unit | multi_unit | location_pool | corporate | null",
  "operational_units": [
    {
      "operational_unit_id": "uuid",
      "openings_count": 2,
      "priority": 1,
      "is_active": true
    }
  ]
}
```

Regras:

- Se nenhum campo operacional for enviado, o comportamento deve ser identico ao atual.
- IDs informados devem existir e estar ativos, salvo decisao explicita futura para permitir historico inativo.
- Duplicidade de `operational_unit_id` no mesmo payload deve falhar.
- `operational_units` deve ser processado em transacao junto da vaga.

## Patch Job

Endpoint existente:

- `PATCH /api/v1/jobs/{job_id}`

Semantica recomendada:

- Campo omitido: nao altera.
- Campo opcional enviado como `null`: limpa o valor.
- `operational_units` omitido: nao altera vinculos de unidades.
- `operational_units: []`: substitui o conjunto ativo por vazio.
- `operational_units: [...]`: substitui transacionalmente o conjunto de vinculos daquela vaga.

Exemplo para limpar vinculo operacional:

```json
{
  "operational_group_id": null,
  "location_group_id": null,
  "allocation_mode": null,
  "operational_units": []
}
```

Exemplo para transformar em vaga-pool:

```json
{
  "location": "Peritoro",
  "operational_group_id": "uuid-grupo-02",
  "location_group_id": "uuid-peritoro",
  "allocation_mode": "location_pool",
  "operational_units": [
    {
      "operational_unit_id": "uuid-filial-4301",
      "openings_count": 1,
      "priority": 1
    },
    {
      "operational_unit_id": "uuid-filial-4601",
      "openings_count": 1,
      "priority": 2
    }
  ]
}
```

## List Jobs

Endpoint existente:

- `GET /api/v1/jobs`

Filtros novos recomendados:

| Query param | Tipo | Comportamento |
| --- | --- | --- |
| `operational_group_id` | UUID | Filtra vagas cujo grupo principal seja o informado ou que tenham unidade ativa desse grupo. |
| `location_group_id` | UUID | Filtra vagas cuja localidade principal seja a informada ou que tenham unidade ativa nessa localidade. |
| `operational_unit_id` | UUID | Filtra vagas vinculadas a uma unidade ativa especifica. |
| `allocation_mode` | string | Filtra por modo de alocacao. |

Os filtros atuais de `search`, `status`, `job_area` e `work_model` devem continuar funcionando. `search` deve continuar buscando em `jobs.location`; busca por nome/codigo operacional pode ser adicionada depois, mas nao deve substituir o comportamento atual.

## Validacoes

Erros recomendados:

- ID de grupo/localidade/unidade inexistente: `404` quando resolvido como recurso, ou `422` quando tratado como payload invalido. A implementacao deve seguir o padrao local de services de vagas.
- Unidade duplicada no payload: `409`.
- Unidade nao pertence ao grupo informado: `422`.
- Unidade nao pertence a localidade informada: `422`.
- `single_unit` sem exatamente uma unidade ativa: `422`.
- `multi_unit` sem unidade ativa: `422`.
- `location_pool` sem `location_group_id`: `422`.
- Campos obrigatorios atuais de vaga continuam com as mesmas validacoes.

## Permissoes

Usar as permissoes atuais de vagas:

- Criar/editar: mesmos perfis que ja criam/editam vagas, hoje `RecruiterOrAdmin`.
- Listar/visualizar: mesmos perfis que ja listam/visualizam vagas.
- Viewer nao deve ganhar permissao de escrita por causa dos campos operacionais.

## Bulk Import e Bulk Update

Recomendacao para OP-2:

- Bulk import continua aceitando payload atual sem campos operacionais.
- Campos operacionais em bulk podem ser adiados para OP-2.x se aumentarem o risco.
- Se forem aceitos, devem exigir IDs, nao matching textual por nome/codigo, para evitar vinculacao errada.

## Public/Candidate APIs

Na OP-2, manter resposta publica compativel:

- `location` continua como campo principal.
- Dados de grupo e codigo de filial nao devem ser expostos como informacao principal ao candidato.
- Se expor contexto operacional no futuro, preferir `location_group.name`, `operational_unit.public_name` e `reference_point`.

## Pipeline APIs

Filtro futuro no pipeline deve seguir a mesma semantica dos filtros de vagas:

- `operational_group_id`
- `location_group_id`
- `operational_unit_id`

Nao alterar pipeline na primeira implementacao da OP-2 sem testes de regressao especificos.
