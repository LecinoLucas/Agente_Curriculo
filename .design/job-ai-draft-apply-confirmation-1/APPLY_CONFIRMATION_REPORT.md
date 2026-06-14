# APPLY_CONFIRMATION_REPORT

## Problema

O botão `Aplicar ao formulário` aplicava o rascunho de IA imediatamente no formulário, executando `applyApiDraftToForm(draft)`, `extractSkillSuggestions(draft)` e `onApply(updates, skills)` sem uma revisão explícita do que seria preenchido ou sobrescrito.

## Solução

Foi criada uma modal de confirmação única antes da aplicação do rascunho. A modal resume os principais grupos de campos afetados e exige confirmação explícita do usuário antes de disparar o fluxo atual de aplicação.

## Campos exibidos na confirmação

- Informações principais: título, área, senioridade, modalidade, localização/unidade e jornada.
- Descrição e requisitos: descrição, responsabilidades, requisitos, escolaridade e experiência mínima.
- Salário e benefícios: salário/faixa salarial em modo informativo e benefícios com destaque visual quando presentes no rascunho.
- Skills e perguntas: `mandatory_skills`, `nice_to_have_skills`, `screening_questions` e aviso informativo para `suggested_skills`.
- Campos operacionais: flags relevantes como revisão do gestor e avaliação comportamental.

## Regra de cancelamento

Ao clicar em `Cancelar`, a modal é fechada e `onApply` não é chamado.

## Regra de confirmação

Ao clicar em `Aplicar rascunho`, a modal executa exatamente o fluxo existente:

- `applyApiDraftToForm(draft)`
- `extractSkillSuggestions(draft)`
- `onApply(updates, skills)`

## Confirmação de que não salva/publica

A modal informa explicitamente que o rascunho da IA não salva nem publica a vaga automaticamente.

## Confirmação de que backend/API/payload não mudaram

- Backend não foi alterado.
- API não foi alterada.
- O payload final da vaga não foi alterado.
- A regra de aplicação permanece a mesma após a confirmação.

## Testes executados

- `cd frontend && npm run test -- --run JobAiDraftPanel`
- `cd frontend && npm run test -- --run JobFormPage`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

## Pendências futuras

- Se houver necessidade de comparar visualmente valor atual x valor do rascunho para mais campos além de salário, convém expandir o snapshot do formulário com cuidado, sem alterar a regra de aplicação.
