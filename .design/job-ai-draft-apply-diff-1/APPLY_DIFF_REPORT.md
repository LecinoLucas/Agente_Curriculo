# APPLY_DIFF_REPORT

## Problema

A modal de confirmação já impedia a aplicação direta do rascunho da IA, mas ainda não mostrava de forma clara o que seria sobrescrito quando o formulário já tinha valores preenchidos.

## Solução

A modal passou a exibir comparação `Atual x IA` com status visual por campo prioritário, mantendo scroll interno e previews compactos para evitar crescimento excessivo.

## Campos comparados

- Salário/faixa salarial
- Benefícios
- Jornada
- Modalidade
- Localização/unidade
- Requisitos
- Escolaridade
- Experiência mínima

## Campos ainda não comparados

- Descrição completa
- Responsabilidades completas
- Área e senioridade em formato `Atual x IA`
- Flags operacionais em formato de diff detalhado

Esses campos continuam aparecendo em resumo simples na modal.

## Comportamento Atual x IA

- `Será preenchido`: campo atual vazio e IA com sugestão.
- `Será alterado`: campo atual preenchido e diferente da sugestão.
- `Sem alteração`: valor atual igual ao sugerido.
- `Sem sugestão da IA`: o draft não trouxe valor para comparação.

Para benefícios, quando possível, a modal também mostra `Adicionados` e `Removidos`.

## Confirmação de que backend/API/payload não mudaram

- Backend não foi alterado.
- API não foi alterada.
- Payload final não foi alterado.
- O fluxo de confirmação continua chamando:
  - `applyApiDraftToForm(draft)`
  - `extractSkillSuggestions(draft)`
  - `onApply(updates, skills)`

## Testes executados

- `cd frontend && npm run test -- --run JobAiDraftPanel`
- `cd frontend && npm run test -- --run JobFormPage`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

## Riscos restantes

- Alguns campos longos ainda usam preview truncado, então a comparação é intencionalmente resumida.
- Salário continua apenas informativo na modal e não é aplicado ao formulário nesta fase.
