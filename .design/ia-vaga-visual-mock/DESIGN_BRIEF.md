# Design Brief: IA Vaga Visual Mock

## Problem

O cadastro real de vaga ainda depende de preenchimento manual completo. A demo simplificada já prova o valor de "criar com IA", mas esse momento não existe no fluxo real de cadastro.

## Goal

Adicionar uma experiência visual e simulada de "Criar com IA" dentro de `JobFormPage`, sem backend, sem endpoint e sem alterar a regra real de salvamento/publicação.

## User Outcome

O usuário pode:

1. alternar entre `Cadastro manual` e `Criar com IA`;
2. escrever uma descrição simples ou usar um exemplo;
3. gerar um rascunho mockado;
4. aplicar o rascunho ao formulário real;
5. revisar manualmente antes de salvar.

## Constraints

- Não mexer em backend.
- Não criar service/API nova.
- Não chamar endpoint.
- Não chamar IA real.
- Não alterar regra de publicação.
- Não quebrar o cadastro manual existente.
- Não tocar na Demo RH.

## Experience Principles

1. Simulação honesta: a UI deve deixar claro que o rascunho é mockado.
2. Aplicação reversível mentalmente: o usuário entende que está preenchendo o formulário, não salvando a vaga.
3. Continuidade do fluxo real: depois do apply, o cadastro continua manual e revisável.

## Implementation Shape

- Reusar `JobFormPage` como ponto de entrada.
- Manter `JobAiDraftPanel` como contrato oficial do painel.
- Centralizar mock em util local com:
  - `JobAiDraft`
  - `generateMockJobDraft(description)`
  - `applyDraftToForm(draft)`

## Out of Scope

- OCR
- upload de imagem
- persistência automática
- publicação automática
- mudança de RBAC
- integração real com IA
