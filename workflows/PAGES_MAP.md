# Mapa de Páginas e Rotas

Este documento detalha as rotas disponíveis no frontend e suas respectivas permissões de acesso.

---

## 1. Grupos de Acesso (Roles)

- **`STAFF_ROLES`**: `admin`, `recruiter`, `viewer`
- **`ADMIN_ROLES`**: `admin`
- **`ALL_AUTH_ROLES`**: `admin`, `recruiter`, `candidate`, `viewer`

---

## 2. Tabela de Rotas

| Rota | Descrição | Permissão | Lazy Load |
| :--- | :--- | :--- | :--- |
| `/login` | Tela de autenticação | Livre | Sim |
| `/dashboard` | Resumo de métricas e indicadores | `STAFF_ROLES` | Sim |
| `/pipeline` | Quadro Kanban de recrutamento | `STAFF_ROLES` | Sim |
| `/pipeline/:jobId` | Pipeline filtrado por vaga | `STAFF_ROLES` | Sim |
| `/candidatos` | Lista geral de candidatos | `STAFF_ROLES` | Sim |
| `/vagas` | Gestão de vagas abertas | `STAFF_ROLES` | Sim |
| `/vagas/nova` | Formulário de nova vaga | `STAFF_ROLES` | Sim |
| `/vagas/:id/editar` | Edição de vaga existente | `STAFF_ROLES` | Sim |
| `/importar` | Importação em lote de currículos | `admin`, `recruiter` | Sim |
| `/analises-ia` | Auditoria de análises de IA | `admin`, `recruiter` | Sim |
| `/perfil` | Dados do usuário logado | `ALL_AUTH_ROLES` | Sim |
| `/trocar-senha` | Alteração de senha obrigatória/manual | `ALL_AUTH_ROLES` | Sim |
| `/admin` | Painel administrativo principal | `ADMIN_ROLES` | Sim |
| `/admin/usuarios` | Gestão de usuários do sistema | `ADMIN_ROLES` | Sim |
| `/admin/skills` | Gestão de equivalência de skills | `ADMIN_ROLES` | Sim |

---

## 3. Componentes de Estrutura

- **`AppShell`**: Layout principal contendo Sidebar, Header e Breadcrumbs.
- **`ProtectedRoute`**: HOC que valida a role do usuário vinda do contexto de autenticação antes de renderizar a página.
- **`PipelineProvider`**: Contexto compartilhado para as telas que precisam gerenciar o estado do pipeline ativo.
