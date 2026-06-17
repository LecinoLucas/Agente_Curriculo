# OPERATIONAL-STRUCTURE-UX-GUARDRAILS-1

## Resumo da implementação

Foram aplicados ajustes localizados na tela de Estrutura Operacional para reduzir ambiguidade entre grupo e unidade, deixar mais claro o que o candidato verá no portal e adicionar guardrails antes de inativar ou reativar registros. O backend não foi alterado.

## Arquivos alterados

- `frontend/src/pages/EstruturaOperacionalPage.tsx`
- `frontend/src/pages/__tests__/EstruturaOperacionalPage.test.tsx`

## Decisões de UX

- Padronização de linguagem para `Grupo operacional` e `Unidade operacional` na aba principal, botões, labels e colunas.
- Inclusão de contexto visual de hierarquia na aba de unidades: `Grupo operacional -> Unidade operacional`.
- Exibição explícita do preview do portal do candidato na listagem e no formulário da unidade.
- Confirmação obrigatória antes de inativar ou reativar grupo, localidade e unidade.
- Reaproveitamento do detalhe útil do backend nos toasts, evitando esconder mensagens como conflito, campo obrigatório ou registro em uso.

## Antes/depois textual

Antes:
- A tela tratava a área principal como `Filiais/Postos`.
- A listagem mostrava dados internos, mas não deixava claro o preview do candidato.
- Inativar e reativar executavam direto.
- Erros úteis do backend eram reduzidos a mensagens genéricas.

Depois:
- A tela diferencia `Grupo operacional` de `Unidade operacional`.
- A listagem mostra grupo associado, código interno, nome interno e `Como o candidato verá`.
- O formulário mostra preview dinâmico do portal e alerta quando o nome público está vazio.
- Inativar e reativar exigem confirmação com contexto operacional.
- Toasts exibem a mensagem útil retornada pelo backend quando houver detalhe seguro.

## Testes executados

- `npm --prefix frontend test -- --run src/pages/__tests__/EstruturaOperacionalPage.test.tsx src/services/__tests__/operationalMasterService.test.ts`
- `npm --prefix frontend run build`

## Resultado dos testes

- `EstruturaOperacionalPage.test.tsx`: passando
- `operationalMasterService.test.ts`: passando
- `tsc --noEmit` via build: passando
- `vite build`: passando

## Limitações restantes

- A tela ainda não mostra contadores de uso da unidade em vagas, candidaturas, pipeline ou pré-admissão.
- A confirmação de inativação explica impacto, mas depende do backend para bloquear casos realmente em uso.
- Viewer ainda não possui modo de visualização dedicado; a permissão efetiva continua a definida pelo backend.

## O que fica para preparação Protheus

- Não foram adicionados campos técnicos de ERP/Protheus.
- Não foi criada separação visual para `Filial Protheus`; isso continua fora desta fase.

## O que fica para bot

- Nenhum ajuste para bot de triagem, automação conversacional ou LangGraph foi incluído.
- O preview atual ajuda a evitar cadastro incorreto, mas ainda não expõe indicadores operacionais que um bot poderia consumir no futuro.
