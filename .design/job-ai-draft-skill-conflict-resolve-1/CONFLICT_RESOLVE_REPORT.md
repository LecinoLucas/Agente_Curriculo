# CONFLICT_RESOLVE_REPORT

## Problema

`suggested_skills` com `catalog_status = conflict` mostravam apenas aviso de revisão manual, sem permitir que o RH escolhesse qual skill real do catálogo deveria ser usada.

## Solução

Cada conflito agora exibe opções reais do catálogo derivadas de `catalog_conflicts[]`. O usuário pode selecionar manualmente uma opção válida e só então esse conflito passa a ser elegível para aplicação estruturada.

## Comportamento de conflict sem escolha

- Não entra como skill estruturada.
- Continua com aviso de que exige revisão manual.
- A modal resume esse item em `conflitos ainda exigem revisão`.

## Comportamento de conflict resolvido

- Após a escolha manual, o conflito vira `ApplicableSkill`.
- A aplicação usa a skill escolhida do catálogo, não o nome sugerido pela IA.
- `essential` vira `priority`.
- `differential` vira `complementary`.
- `competency` segue o fallback seguro já existente para `priority`.

## Deduplicação

- Deduplicação por `catalog_skill_id`.
- Fallback por nome normalizado.
- Se a skill escolhida já estiver na vaga ou já tiver sido selecionada por `existing`, ela não é duplicada.

## Confirmação de que não resolve automaticamente

- O sistema não escolhe a primeira opção.
- O sistema não resolve conflito sozinho.
- O sistema só aplica o conflito após escolha explícita do usuário.

## Confirmação de que backend/API/payload não mudaram

- Backend não foi alterado.
- API não foi alterada.
- Payload final da vaga não foi alterado.
- `suggested_skills` não é enviado como novo campo no payload.

## Testes executados

- `cd frontend && npm run test -- --run JobAiDraftPanel`
- `cd frontend && npm run test -- --run JobFormPage`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

## Pendências futuras

- Hoje o conflito depende de encontrar correspondência real no catálogo via busca frontend.
- Se o backend futuramente devolver `catalog_conflicts` com `id` e `name`, a resolução poderá ficar mais direta e sem lookup adicional.
