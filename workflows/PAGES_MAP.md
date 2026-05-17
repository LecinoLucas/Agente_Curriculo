# Mapa de Páginas e Rotas

Este documento detalha as rotas disponíveis no frontend e suas respectivas permissões de acesso.

---

## 1. Grupos de Acesso (Roles)

- **`STAFF_ROLES`**: `admin`, `recruiter`, `viewer`, `manager`, `hr`
- **`ADMIN_ROLES`**: `admin`
- **`MANAGER_ROLES`**: `admin`, `manager`
- **`ALL_AUTH_ROLES`**: `admin`, `recruiter`, `candidate`, `viewer`, `manager`, `hr`

---

## 2. Tabela de Rotas

### 2.1 Rotas Públicas e Candidato
| Rota | Descrição | Permissão | Lazy Load |
| :--- | :--- | :--- | :--- |
| `/login` | Tela de autenticação Staff | Livre | Sim |
| `/candidato` | Entrada do Portal do Candidato | Livre | Sim |
| `/candidato/cadastro` | Formulário de Inscrição Pública | Livre | Sim |
| `/candidato/login` | Login do Candidato | Livre | Sim |
| `/candidato/portal` | Dashboard do Candidato | Livre (Auth Candidato) | Sim |

### 2.2 Rotas de Recrutamento (Staff)
| Rota | Descrição | Permissão | Lazy Load |
| :--- | :--- | :--- | :--- |
| `/dashboard` | Resumo de métricas e indicadores | `STAFF_ROLES` | Sim |
| `/agenda` | Agenda de entrevistas | `STAFF_ROLES` | Sim |
| `/pipeline` | Quadro Kanban de recrutamento | `STAFF_ROLES` | Sim |
| `/pipeline/:jobId` | Pipeline filtrado por vaga | `STAFF_ROLES` | Sim |
| `/candidatos` | Lista geral de candidatos | `STAFF_ROLES` | Sim |
| `/vagas` | Gestão de vagas abertas | `STAFF_ROLES` | Sim |
| `/vagas/nova` | Formulário de nova vaga | `STAFF_ROLES` | Sim |
| `/vagas/:id/editar` | Edição de vaga existente | `STAFF_ROLES` | Sim |
| `/importar` | Importação em lote de currículos | `admin`, `recruiter` | Sim |
| `/importar-formulario` | Importação via Google Forms | `admin`, `recruiter` | Sim |
| `/analises-ia` | Auditoria de análises de IA | `admin`, `recruiter` | Sim |
| `/manager` | Revisão de gestores | `MANAGER_ROLES` | Sim |
| `/perfil` | Dados do usuário logado | `ALL_AUTH_ROLES` | Sim |
| `/trocar-senha` | Alteração de senha | `ALL_AUTH_ROLES` | Sim |

### 2.3 Rotas Administrativas
| Rota | Descrição | Permissão | Lazy Load |
| :--- | :--- | :--- | :--- |
| `/admin` | Painel administrativo principal | `ADMIN_ROLES` | Sim |
| `/admin/usuarios` | Gestão de usuários do sistema | `ADMIN_ROLES` | Sim |
| `/admin/cadastros` | Gestão de Skills e Cadastros Base | `ADMIN_ROLES` | Sim |
| `/admin/auditoria` | Logs de auditoria do sistema | `ADMIN_ROLES` | Sim |
| `/admin/health` | Status de saúde do sistema | `ADMIN_ROLES` | Sim |
| `/admin/bi` | Dashboard de Business Intelligence | `ADMIN_ROLES` | Sim |
| `/admin/behavioral-templates`| Gestão de templates comportamentais | `admin`, `recruiter` | Sim |

---

## 3. Componentes de Estrutura

- **`AppShell`**: Layout principal contendo Sidebar, Header e Breadcrumbs.
- **`ProtectedRoute`**: HOC que valida a role do usuário vinda do contexto de autenticação antes de renderizar a página.
- **`PipelineProvider`**: Contexto compartilhado para as telas que precisam gerenciar o estado do pipeline ativo.

