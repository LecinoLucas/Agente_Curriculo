# Design Brief: Gestor G1

## Problem

O gestor precisa revisar somente candidatos atribuídos a ele, mas o fluxo atual mistura lista vazia com falta de permissão, conta candidatos da vaga inteira e oculta erros importantes. Isso reduz confiança e pode confundir o usuário sobre seu escopo real.

## Solution

Ajustar a semântica do fluxo atual sem criar novos conceitos organizacionais. O gestor continua acessando candidatos por atribuição explícita já existente: `review_request.target_manager_id`, scorecard como evaluator ou vínculos pontuais já autorizados.

## Experience Principles

1. Escopo explícito sobre inferência organizacional -- não usar departamento, unidade ou gestor responsável da vaga.
2. Vazio honesto sobre erro falso -- lista vazia retorna sucesso com estado vazio claro.
3. Segurança visível sobre conveniência -- 403 significa acesso negado real e não ausência de dados.

## Aesthetic Direction

- **Philosophy**: Dieter Rams funcionalista.
- **Tone**: operacional, claro, contido.
- **Reference points**: padrões atuais do painel de RH.
- **Anti-references**: redesign grande, dashboard novo, cards promocionais.

## Existing Patterns

- Backend usa FastAPI, serviços de aplicação e schemas Pydantic.
- Frontend usa React, Tailwind e componentes/estilos locais existentes.
- `ManagerReviewPage` já possui abas `Solicitações` e `Candidatos`.
- Mensagens de erro usam banners inline.

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| `ManagerViewService` | Modify | Separar acesso real de lista vazia e corrigir contadores. |
| `manager` router | Modify | Retornar `200 []` quando o gestor tem acesso mas não há candidatos visíveis. |
| `ManagerReviewPage` | Modify | Exibir erros de summary/scorecard e estados vazios em português. |
| Tests backend/frontend | Modify | Cobrir semântica 200/403, contadores e mensagens. |

## Key Interactions

- Gestor abre solicitações e vê apenas requests direcionados ou vinculados por scorecard.
- Gestor abre aba de candidatos e vê vagas/candidatos atribuídos explicitamente.
- Vaga atribuída sem candidatos visíveis ativos retorna lista vazia com mensagem clara.
- Tentativa de acessar candidato não atribuído retorna 403.
- Falha de summary ou scorecard aparece como erro localizado, não desaparece silenciosamente.

## Responsive Behavior

Sem redesign visual. Manter layout atual e apenas polir estados de vazio/erro para desktop e mobile.

## Accessibility Requirements

- Mensagens de erro devem ser texto visível em português.
- Estados vazios não devem depender apenas de ícone.
- Botões e abas existentes mantêm semântica e foco.

## Out of Scope

- Criar `department_id`.
- Criar `job.responsible_manager_id`.
- Escopo por unidade/departamento.
- Pré-admissão.
- Decisão final.
- Redesign amplo da tela do gestor.
