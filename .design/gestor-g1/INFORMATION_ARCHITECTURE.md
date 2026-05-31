# Information Architecture: Gestor G1

## Site Map

- Revisão do gestor `/manager`
  - Aba Solicitações
  - Aba Candidatos
  - Resumo seguro do candidato
  - Scorecard do gestor

## Navigation Model

- **Primary navigation**: rota existente `/manager` para usuários `manager` e `admin`.
- **Secondary navigation**: abas internas `Solicitações` e `Candidatos`.
- **Utility navigation**: navegação global já existente do app.
- **Mobile navigation**: manter padrão atual, sem novas rotas.

## Content Hierarchy

### Revisão do gestor

1. Header com propósito da tela.
2. Erros globais de carregamento.
3. Abas `Solicitações` e `Candidatos`.
4. Lista de solicitações ou vagas atribuídas.
5. Detalhe seguro do candidato.
6. Scorecard e feedback do gestor.

## User Flows

### Ver solicitações

1. Gestor abre `/manager`.
2. API retorna solicitações visíveis.
3. Se não houver solicitações, UI mostra estado vazio.
4. Gestor seleciona uma solicitação.
5. UI carrega resumo seguro e scorecard.
6. Falhas de resumo/scorecard aparecem no painel.

### Ver candidatos atribuídos

1. Gestor abre aba `Candidatos`.
2. API retorna vagas com contadores de candidatos visíveis.
3. Gestor seleciona vaga.
4. API retorna `200 []` se não há candidatos visíveis ativos.
5. API retorna `403` se o gestor não tem acesso real à vaga.

## Naming Conventions

| Concept | Label in UI | Notes |
| --- | --- | --- |
| Visible assigned candidates | Candidatos atribuídos | Não significa total da vaga. |
| Empty job list | Nenhuma vaga atribuída | Estado válido. |
| Empty candidate list | Nenhum candidato atribuído nesta vaga | Estado válido. |
| Access denied | Sem acesso a esta vaga ou candidato | Erro real. |

## Component Reuse Map

| Component | Used on | Behavior differences |
| --- | --- | --- |
| Inline error banner | ManagerReviewPage | Mensagens globais e localizadas. |
| Dashed empty state | ManagerReviewPage | Estados vazios de solicitações, vagas e candidatos. |
| Existing scorecard form | ManagerReviewPage | Sem mudança de decisão final. |

## URL Strategy

- Manter `/manager`.
- Manter endpoints `/api/v1/manager/*`.
- Não criar novas rotas.
