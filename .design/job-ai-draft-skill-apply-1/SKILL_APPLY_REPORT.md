# SKILL_APPLY_REPORT

## Problema

As `suggested_skills` do Job AI Draft tinham seleção visual, mas essa seleção não influenciava a aplicação do rascunho ao formulário.

## Regra de aplicação

- Apenas `suggested_skills` com `catalog_status = existing` podem virar skills estruturadas.
- A aplicação acontece só após confirmação do usuário.
- O fluxo base do draft continua igual para campos de formulário e listas textuais.

## Comportamento de existing

- `existing` selecionada com `catalog_skill_id` e `catalog_skill_name` vira skill estruturada.
- `importance = essential` ou ambígua entra como skill essencial.
- `importance = differential` entra como skill diferencial.
- `existing` desmarcada não é aplicada.

## Comportamento de new

- `new` nunca cria skill automaticamente.
- `new` nunca entra como skill estruturada nesta fase.
- A UI mostra aviso de que a criação no catálogo exige etapa futura.

## Comportamento de conflict

- `conflict` nunca é resolvida automaticamente.
- `conflict` nunca entra como skill estruturada nesta fase.
- A UI mostra aviso de que a escolha correta precisa ser manual.

## Deduplicação

- Deduplicação por `catalog_skill_id`.
- Fallback por nome normalizado.
- Se a skill já estiver vinculada à vaga, ela não é duplicada nem movida automaticamente entre essenciais e diferenciais.

## Fallback sem suggested_skills

Se o draft não trouxer `suggested_skills`, o comportamento anterior continua:

- `mandatory_skills` e `nice_to_have_skills` seguem alimentando os campos antigos.
- o painel aplica o rascunho sem skills estruturadas extras.

## Confirmação de que backend/API/payload não mudaram

- Backend não foi alterado.
- API não foi alterada.
- Payload final da vaga não foi alterado.
- `suggested_skills` não é enviado como novo campo da vaga.

## Testes executados

- `cd frontend && npm run test -- --run JobAiDraftPanel`
- `cd frontend && npm run test -- --run JobFormPage`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

## Pendências futuras

- Se a equipe quiser aplicar também `new` via fluxo guiado, isso precisa de etapa própria de criação/revisão de catálogo.
- Se for necessário inferir prioridade a partir de origem semântica mais rica, vale adicionar metadado explícito no draft em fase futura.
