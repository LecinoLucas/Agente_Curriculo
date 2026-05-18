# `src/legacy/` — Código congelado

Este diretório guarda código mantido por compatibilidade. **Não é receptor de novos imports.**

## Regras

1. **Não importe daqui** em nenhum arquivo fora de `src/legacy/`.
2. **Não adicione features novas** aqui — mesmo que pareça "encaixar" em algum
   componente existente.
3. **Correções de bug** são permitidas, mas só com objetivo de manter o
   comportamento atual estável até a migração concluir.
4. **Remoção total** acontece quando o último consumidor externo desaparecer.
   Não há cronograma definido — adicione-se ao plano explicitamente antes.

## Por que isto existe

A pasta contém componentes anteriores à reorganização em `features/`. Misturar
código novo aqui:

- impede a remoção planejada,
- mantém duas versões da mesma regra de negócio (a daqui e a do `features/`),
- expande a superfície que outra IA precisa entender antes de mexer em
  qualquer coisa.

## Enforcement

O teste `frontend/src/test/legacy-import-guard.test.ts` falha o CI se algum
arquivo fora de `src/legacy/` importar de `legacy/`. Se você acha que precisa
quebrar essa regra, abra um PR mudando o teste e justifique no commit message
— **não silencie o teste sem justificativa**.

## Conteúdo atual

- `candidate-drawer/` — drawer antigo de candidato. Substituto vive em
  `features/candidates/` e `pages/CandidateProfilePage.tsx`.
