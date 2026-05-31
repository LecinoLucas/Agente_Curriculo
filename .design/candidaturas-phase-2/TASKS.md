# Build Tasks: Candidaturas Fase 2

Generated from: .design/candidaturas-phase-2/DESIGN_BRIEF.md
Date: 2026-05-30

## Foundation

- [ ] **Formalizar semântica operacional da lista**: Derivar resumo do topo, prioridade por linha e rótulos curtos de próxima ação apenas com os dados já presentes na listagem. _Reuses: `CandidateListSummary`, `deriveScoreSemantics`, `STAGE_LABEL`._

## Core UI

- [ ] **Adicionar resumo operacional compacto**: Inserir uma faixa enxuta acima da tabela com leituras rápidas de aderência, entrevista e decisão, sem virar card grid. _Modifies: `CandidaturasPage`._
- [ ] **Refinar a linha da tabela para priorização**: Incluir prioridade discreta, score comparável e próxima ação mais clara mantendo a tabela como estrutura principal. _Modifies: `CandidaturasPage`._
- [ ] **Reorganizar ações rápidas existentes**: Dar mais clareza para abrir candidato, abrir pipeline e marcar entrevista, preservando menu complementar e regras atuais. _Modifies: `CandidaturasPage`._

## Interactions & States

- [ ] **Compactar mobile sem perder ação**: Reduzir bloco de contato, priorizar nome/vaga/próxima ação e manter acesso ao drawer e às ações rápidas. _Breakpoints: 375px, 768px._
- [ ] **Garantir truncamento acessível**: Aplicar `title` e rótulos curtos onde `Próxima ação` ou prioridade puderem quebrar. _Covers: desktop e mobile._

## Responsive & Polish

- [ ] **Ajustar densidade e larguras da tabela**: Revisar distribuição de colunas e altura das linhas com foco em `Próxima ação` e metadados do candidato. _Depends on: Refino da linha._
- [ ] **Atualizar cobertura de testes**: Validar resumo operacional, prioridade discreta, permanência das ações principais e não regressão em filtros e RH Dashboard. _Reuses: testes existentes._

## Review

- [ ] **Design review**: Rodar revisão visual contra o brief após testes e build.
