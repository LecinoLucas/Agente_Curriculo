# Build Tasks: Gestor G1

Generated from: .design/gestor-g1/DESIGN_BRIEF.md
Date: 2026-05-30

## Foundation
- [x] **Matriz de acesso atual**: Documentar a regra explícita do gestor. _Reuses: review_request, scorecard evaluator._
- [x] **Semântica 200/403**: Separar lista vazia autorizada de acesso negado real. _Modifies: manager service/router._

## Core Flow
- [x] **Contadores visíveis**: Corrigir `candidate_count` para candidatos visíveis/atribuídos ao gestor. _Modifies: ManagerViewService._
- [x] **Proteção de candidato não atribuído**: Garantir 403 para summary de candidato fora do escopo. _Reuses: access verifier._

## Interactions & States
- [x] **Mensagens em português**: Revisar mensagens de backend/frontend no fluxo do gestor. _Modifies: router/page._
- [x] **Erros localizados**: Não engolir erro de summary/scorecard no `ManagerReviewPage`. _Modifies: ManagerReviewPage._
- [x] **Estado vazio claro**: Melhorar cópia sem redesign amplo. _Modifies: ManagerReviewPage._

## Verification
- [x] **Backend tests**: Cobrir 200 vazio, 403 real, contadores e escopo.
- [x] **Frontend tests**: Cobrir mensagens, estado vazio e falhas de summary/scorecard.
- [x] **Build**: Rodar testes alvo e build.
- [x] **Design review**: Registrar revisão final.
