# SKILL-CATALOG-SUGGESTION-APPROVAL-1

## Problema

As sugestões de skill com `catalog_status = new` já apareciam no Job AI Draft, mas não existia um fluxo seguro para aprovar a criação de uma nova skill no catálogo. Isso permitia revisão visual, mas não permitia criação controlada com validação obrigatória de colisões entre canonical e aliases.

## Fluxo criado

1. O usuário com permissão de gestão visualiza uma suggestion `new` no Job AI Draft.
2. A ação `Aprovar no catálogo` abre um modal de revisão.
3. O frontend chama a validação de guardrail antes da aprovação final.
4. Se houver conflitos bloqueantes, a criação é barrada.
5. Se houver warnings, a UI exige confirmação explícita.
6. Só depois da confirmação o backend executa a criação da skill.
7. Após sucesso, a skill criada pode ser aplicada ao formulário apenas em uma segunda confirmação separada.

## Endpoints

### `POST /api/v1/skills/validate-suggestion`

Payload:

- `name`
- `aliases`
- `category`
- `description`
- `source`

Resposta:

- `allowed`
- `conflicts`
- `warnings`
- `normalized_canonical`
- `normalized_aliases`
- `source`

### `POST /api/v1/skills/approve-suggestion`

Payload:

- `name`
- `aliases`
- `category`
- `description`
- `source`
- `confirm_warnings`

Comportamento:

- roda `SkillCatalogAliasGuardrailService`
- retorna bloqueio estruturado se houver conflitos
- retorna erro de confirmação obrigatória se houver warnings sem `confirm_warnings = true`
- cria a skill somente quando a validação permite

## Guardrails usados

O fluxo depende obrigatoriamente de `SkillCatalogAliasGuardrailService`. Nenhuma criação de skill sugerida pela IA acontece sem passar pela validação.

Conflitos tratados:

- `canonical_already_exists`
- `canonical_matches_existing_alias`
- `alias_matches_existing_canonical`
- `alias_already_exists`
- `empty_or_invalid_name`

Warnings tratados:

- `alias_duplicated_in_request`
- `alias_same_as_canonical`
- `ambiguous_macro_skill`

## Allowed, blocked e warnings

### Allowed

Quando `allowed = true` e não há warnings, a skill pode ser criada imediatamente após a ação explícita do usuário.

### Blocked

Quando `allowed = false`, o backend retorna erro estruturado com:

- `code`
- `message`
- `conflicts`
- `warnings`

Nenhuma escrita ocorre no banco nesse cenário.

### Warnings

Quando existem warnings sem conflitos, a criação continua bloqueada até que o usuário marque a confirmação explícita no modal.

## Permissões

Os endpoints exigem `RecruiterOrAdmin`.

No frontend, a ação de aprovação fica disponível apenas para usuários com permissão de gestão de vagas. Usuários sem permissão não disparam a chamada de aprovação.

## Seed legado

O seed legado não foi alterado nesta fase porque o objetivo aqui foi criar o fluxo seguro de aprovação e reutilizar os guardrails já existentes. Limpar ou reestruturar o catálogo legado continua sendo assunto de fase separada.

## Testes executados

Backend:

- `cd backend && .venv/bin/python -m pytest tests/unit/test_skill_catalog_alias_guardrail_service.py -v`
- `cd backend && .venv/bin/python -m pytest tests/integration/test_skill_catalog_api.py -v`
- `cd backend && .venv/bin/python -m pytest tests/unit/test_job_ai_draft_service.py tests/integration/test_job_ai_draft_generate.py -v`

Frontend:

- `cd frontend && npm run test -- --run JobAiDraftPanel`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

## Pendências futuras

- reaproveitar o mesmo fluxo em uma área administrativa dedicada do catálogo, se essa tela for criada
- decidir se warnings específicos devem ter cópia mais orientada para RH
- avaliar histórico/auditoria visual de aprovações no frontend admin
