# Build Tasks: IA Vaga Visual Mock

Generated from: .design/ia-vaga-visual-mock/DESIGN_BRIEF.md
Date: 2026-05-30

## Foundation
- [x] Definir escopo mock-only dentro do cadastro real de vaga.
- [x] Reusar o ponto oficial `JobAiDraftPanel` em vez de abrir um fluxo paralelo.

## Core Flow
- [x] Criar tipo local `JobAiDraft`.
- [x] Criar `generateMockJobDraft(description)`.
- [x] Criar `applyDraftToForm(draft)`.
- [x] Exibir alternância `Cadastro manual` / `Criar com IA`.
- [x] Exibir rascunho estruturado mockado com apply manual.

## Safeguards
- [x] Manter salvamento e publicação no fluxo real existente.
- [x] Não tocar em backend, API ou Demo RH.

## Verification
- [x] Atualizar cobertura de `JobFormPage`.
- [x] Rodar testes e build.
- [x] Executar revisão visual final e registrar resultado.
