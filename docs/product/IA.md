# Information Architecture: Portal RH Marajó

## Site Map

- Dashboard `/`
  - Métricas Rápidas
  - Atividades Recentes
- Vagas `/vagas`
  - Criação de Vaga `/vagas/nova`
  - Detalhes da Vaga `/vagas/[id]`
    - Funil (Kanban) `/vagas/[id]/funil`
    - Configurações da Vaga `/vagas/[id]/config`
- Banco de Talentos `/candidatos`
  - Perfil do Candidato `/candidatos/[id]`
    - Currículo
    - Histórico de Entrevistas
- Entrevistas & Agenda `/agenda`
- Configurações `/configuracoes`
  - Equipe `/configuracoes/equipe`
  - Templates de Email `/configuracoes/templates`

## Navigation Model

- **Primary navigation**: Sidebar lateral fixa. Contém (Dashboard, Vagas, Banco de Talentos, Agenda).
- **Secondary navigation**: Tabs horizontais dentro da visualização de uma Vaga (ex: Funil, Candidatos, Detalhes, Configurações).
- **Utility navigation**: No canto inferior da sidebar lateral (Perfil do Usuário, Configurações, Ajuda).
- **Mobile navigation**: Menu hambúrguer superior (embora o foco principal seja Desktop).

## Content Hierarchy

### Dashboard `/`
1. **Métricas de Atenção (Alertas)** -- O que o RH precisa ver hoje (entrevistas marcadas, vagas atrasadas).
2. **Visão Geral de Vagas** -- Quantidade de vagas abertas e totais de candidatos nelas.
3. **Atividades Recentes** -- Log do que a equipe fez recentemente.

### Perfil do Candidato `/candidatos/[id]`
1. **Resumo (Cabeçalho)** -- Nome, vaga atual, status, contato rápido.
2. **Avaliação/Score** -- Notas das entrevistas e fit cultural.
3. **Timeline/Histórico** -- Todas as interações em ordem cronológica.
4. **Anexos (Currículo)** -- Visualizador embutido do PDF.

## User Flows

### Transição de Status de Candidato
1. RH acessa a página da Vaga (visão Kanban).
2. Visualiza o card do candidato na coluna "Triagem".
3. Arrastar o card para a coluna "Entrevista RH".
4. Sistema abre modal para "Agendar Entrevista e Notificar Candidato".
5. RH confirma horário e sistema dispara e-mail integrado.

### Abertura de Nova Vaga
1. RH clica em "Nova Vaga" na navegação principal.
2. Preenche o formulário básico (Título, Departamento, Descrição).
3. Define as etapas do funil personalizadas (se diferente do padrão).
4. Publica a vaga, gerando link público para o Portal do Candidato.

## Naming Conventions

| Concept | Label in UI | Notes |
|---------|-------------|-------|
| Job | Vaga | Termo padrão no mercado brasileiro |
| Applicant | Candidato | Em vez de "usuário" para distinguir do time de RH |
| Pipeline | Funil | Mais intuitivo que "Pipeline" para times locais |
| Stage | Etapa | Fase dentro do funil (ex: Triagem) |

## Component Reuse Map

| Component | Used on | Behavior differences |
|-----------|---------|---------------------|
| Data Table | Banco de Talentos, Lista de Vagas | Varia apenas nas colunas e filtros |
| Kanban Board | Funil da Vaga | O número de colunas varia por vaga |
| Page Header | Em todas as páginas | Exibe breadcrumbs ou ações primárias (botões) |

## Content Growth Plan

O Banco de Talentos crescerá continuamente. A tabela de candidatos usará paginação assíncrona (server-side) e filtros robustos indexados (busca por skill, localidade, status) para manter a performance.

## URL Strategy

- Pattern: `/secao/entidade-id/subsecao`
- Dynamic segments: `[id]` para vagas e candidatos.
- Query parameters: `?status=open&search=termo` para filtros em listas, garantindo que o RH possa favoritar/compartilhar URLs de buscas específicas.
