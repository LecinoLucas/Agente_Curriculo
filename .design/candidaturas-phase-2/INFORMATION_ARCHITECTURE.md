# Information Architecture: Candidaturas Fase 2

## Site Map

- RH `/rh`
- Candidaturas `/candidaturas`
  - Lista operacional em tabela `/candidaturas`
  - Perfil do candidato `/candidatos/:id`
  - Pipeline contextual `/pipeline/:jobId?candidateId=:candidateId`

## Navigation Model

- **Primary navigation**: Mantida pelo shell existente; sem mudanças.
- **Secondary navigation**: A própria página opera como fila principal com busca, filtro por vaga e ações rápidas por linha.
- **Utility navigation**: Atualizar lista, abrir pipeline e adicionar candidato permanecem na barra de controle.
- **Mobile navigation**: Sem nova navegação; a tabela continua a entrada principal e o drawer continua como camada de detalhe.

## Content Hierarchy

### Candidaturas
1. Resumo operacional -- Entrega leitura imediata do que exige ação.
2. Nome do candidato + vaga -- Identificação primária da linha.
3. Prioridade + próxima ação -- Explica por que a linha importa agora.
4. Score IA + status + entrevista -- Contexto operacional para decidir.
5. Ações rápidas -- Execução imediata sem sair da lista.
6. Contato detalhado -- Útil, mas secundário em mobile.

## User Flows

### Priorizar lista diária
1. Usuário abre `/candidaturas`
2. Vê o resumo operacional no topo
3. Identifica candidatos com `Alta aderência`, `Entrevista não marcada` ou `Decisão pendente`
4. Toma ação rápida pela linha ou abre drawer/perfil

### Filtrar por vaga
1. Usuário busca ou escolhe uma vaga
2. A lista visível muda
3. O resumo operacional acompanha apenas os itens visíveis
4. Usuário prioriza aquela vaga específica

### Executar ação operacional
1. Usuário encontra uma linha prioritária
2. Aciona `Abrir candidato`, `Abrir pipeline`, `Marcar entrevista` ou menu complementar
3. Se precisar de mais contexto, abre o drawer
4. Conclui a ação sem mudança de fluxo estrutural

## Naming Conventions

| Concept | Label in UI | Notes |
| --- | --- | --- |
| Match score | Score IA | Já consolidado na tela |
| Next step | Próxima ação | Manter consistente |
| Operational urgency | Prioridade | Novo rótulo discreto |
| Decision step | Decisão pendente | Linguagem curta e operacional |
| Missing interview | Entrevista não marcada | Mais claro do que “não marcada” isolado |

## Component Reuse Map

| Component | Used on | Behavior differences |
| --- | --- | --- |
| `Button` | Barra de controle, paginação, drawer, ações rápidas | Reuso sem alterar API |
| `Badge`/badges locais | Score, status, prioridade, próxima ação | Ajustes apenas de densidade e semântica |
| Drawer de candidatura | Linha selecionada | Continua sendo detalhe e fallback mobile |
| Modais de entrevista/reprovação | Ações rápidas | Sem mudança de fluxo |

## Content Growth Plan

A lista pode crescer em volume, mas a IA desta fase não cria novas áreas. O resumo operacional e a prioridade por linha ajudam a absorver crescimento sem exigir novos filtros nem novas páginas.

## URL Strategy

- Pattern: manter URLs existentes
- Dynamic segments: `/candidatos/:id`, `/pipeline/:jobId`
- Query parameters: `candidateId` continua sendo usado na navegação para Pipeline
