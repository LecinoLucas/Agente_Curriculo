# Skill Catalog Alias Guardrails 1

## Problema

O catálogo legado de skills tem colisões semânticas e estruturais entre `canonical` e `aliases`. Antes de existir fluxo de aprovação de skills sugeridas pela IA, o backend precisava de uma validação read-only capaz de barrar colisões óbvias sem reescrever o JSON legado nem alterar o matching atual.

## Regras implementadas

- `canonical` novo não pode repetir `normalized_name` de skill existente.
- `canonical` novo não pode colidir com `normalized_alias` já persistido.
- `alias` novo não pode colidir com `normalized_name` de outra skill.
- `alias` novo não pode colidir com `normalized_alias` de outra skill.
- aliases duplicados na mesma requisição geram warning e são ignorados.
- alias igual ao canonical normalizado gera warning e é ignorado.
- canonical vazio/inválido gera conflito bloqueante.
- alias vazio/inválido gera warning e é ignorado.
- edição da própria skill ignora colisões da própria linha via `current_skill_id`.

## Tipos de conflito

- `canonical_already_exists`
- `canonical_matches_existing_alias`
- `alias_matches_existing_canonical`
- `alias_already_exists`
- `empty_or_invalid_name`

## Warnings

- `alias_duplicated_in_request`
- `alias_same_as_canonical`
- `empty_or_invalid_name` para alias vazio
- `ambiguous_macro_skill`

## O que bloqueia

- qualquer conflito em `canonical`
- qualquer colisão de alias contra skill/alias persistido
- canonical inválido

## O que apenas avisa

- macro skill ampla demais como `Backend`, `Frontend`, `Cloud`, `BI`, `ERP`, `API`, `REST`, `JavaScript`, `Python`
- alias repetido na mesma entrada
- alias redundante em relação ao canonical
- alias vazio

## Seed legado

O seed legado não foi limpo nem alterado nesta fase. O objetivo aqui foi só introduzir guardrails reutilizáveis no backend para validação read-only. Isso preserva o bootstrap atual e evita mudar o comportamento do catálogo legado enquanto o fluxo de aprovação ainda não existe.

## Testes executados

- `cd backend && .venv/bin/python -m pytest tests -k "skill_catalog or alias or guardrail" -v`
- `cd backend && .venv/bin/python -m pytest tests/unit/test_job_ai_draft_service.py tests/integration/test_job_ai_draft_generate.py -v`

## Próximas fases

- conectar o guardrail ao fluxo administrativo/aprovação futura de skills sugeridas
- decidir política final para macro skills e possíveis relations semânticas
- expor resultado estruturado de conflitos para APIs/admin sem alterar o matching legado
