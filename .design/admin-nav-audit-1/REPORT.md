# Auditoria de Navegação Administrativa — ADMIN-NAV-AUDIT-1

## 1. Mapeamento Atual

### 1.1. Rotas Administrativas (`AppRouter.tsx`)
| Rota | Componente | Role |
| :--- | :--- | :--- |
| `/perfil` | `ProfilePage` | `ALL_AUTH_ROLES` |
| `/admin` | `AdminPage` | `ADMIN_ONLY_ROLES` |
| `/admin/estrutura-operacional` | `EstruturaOperacionalPage` | `OPERATIONAL_MASTER_ROLES` |
| `/admin/usuarios` | `UsersPage` | `ADMIN_ONLY_ROLES` |
| `/admin/cadastros` | `CadastrosPage` | `ADMIN_ONLY_ROLES` |
| `/admin/auditoria` | `AuditLogsPage` | `ADMIN_ONLY_ROLES` |
| `/admin/health` | `SystemHealthPage` | `ADMIN_ONLY_ROLES` |
| `/admin/ai-provider-credentials` | `AdminAiProviderCredentialsPage` | `ADMIN_ONLY_ROLES` |
| `/admin/ia` | `AiSettingsPage` | `ADMIN_ONLY_ROLES` |
| `/admin/bi` | `AdminBiPage` | `ADMIN_ONLY_ROLES` |
| `/admin/behavioral-templates` | `BehavioralTemplatesPage` | `JOB_MANAGEMENT_ROLES` |
| `/admin/assistente-candidato` | `AssistantAdminPage` | `INTERNAL_STAFF_ROLES` |

### 1.2. Itens do Menu Lateral (`AppShell.tsx`)
Grupo: **Administração**
1. Estrutura operacional (`/admin/estrutura-operacional`)
2. Usuários (`/admin/usuarios`)
3. Cadastros (`/admin/cadastros`)
4. Credenciais IA (`/admin/ai-provider-credentials`)
5. Laboratório IA (`/admin/ia`)
6. BI (`/admin/bi`)
7. Auditoria (`/admin/auditoria`)
8. Saúde do sistema (`/admin/health`)
9. Importação de CVs (`/importar`)
10. Importação por form (`/importar-formulario`)

### 1.3. Abas Internas e Hubs
- **`AdminPage` (`/admin`)**:
  - `overview` (KPIs + Atalhos)
  - `permissions` (Matriz de Permissões)
  - `diagnostics` (Diagnóstico Operacional)
  - `health` (Embed da `SystemHealthPage`)
- **`SystemHealthPage` (`/admin/health`)**:
  - `overview` (Geral)
  - `ai` (IA / Tokens)
  - `queues` (Filas)
  - `database` (Banco)
  - `errors` (Erros)

## 2. Identificação de Fragmentação e Duplicidade

1. **Sobreposição de IA**:
   - `/admin/ai-provider-credentials`: Gestão de chaves.
   - `/admin/ia`: Status do RAG e Testes Rápidos.
   - `/admin/health` (Aba IA): Métricas de tokens e custos.
   *Problema: O administrador precisa navegar em 3 lugares diferentes para ter a visão completa da IA.*

2. **Duplicidade de Saúde do Sistema**:
   - Existe como item de menu lateral direto.
   - Existe como aba dentro de `/admin`.
   *Problema: Navegação redundante e confusa.*

3. **Inconsistência de "Usuários" e "Permissões"**:
   - `/admin/usuarios`: Gestão de contas.
   - `/admin` (Aba Permissions): Matriz de o que cada role faz.
   *Problema: Estão separados quando são temas correlatos de controle de acesso.*

4. **Excesso de Itens na Sidebar**:
   - O grupo "Administração" possui 10 itens, tornando a lista longa e difícil de escanear.

## 3. Proposta de Consolidação

A ideia é transformar a `/admin` no **Hub Único de Governança**, movendo páginas isoladas para dentro de abas ou sub-grupos.

### 3.1. Nova Estrutura de Abas em `/admin`
| Aba | Conteúdo | Origem |
| :--- | :--- | :--- |
| **Painel** (`overview`) | KPIs e visão geral (limpo). | `AdminPage` |
| **Equipe** (`users`) | Lista de usuários + Matriz de Permissões. | `UsersPage` + `PermissionsMatrix` |
| **IA** (`ai`) | Status RAG + Testes + Métricas Tokens + Credenciais (links). | `AiSettingsPage` + `SystemHealth (Aba IA)` |
| **Infra** (`health`) | Saúde do Sistema (Backend, DB, Filas, Erros). | `SystemHealthPage` |
| **Auditoria** (`audit`) | Logs de eventos administrativos. | `AuditLogsPage` |
| **Diagnóstico** (`diagnostics`) | Investigação de inconsistências. | `AdminPage` |

### 3.2. Menu Lateral Simplificado (Grupo Administração)
1. **Painel Admin** (`/admin`) -> Leva para o hub de abas.
2. **Estrutura Operacional** (`/admin/estrutura-operacional`) -> Mantém separado por ser operacional.
3. **Cadastros** (`/admin/cadastros`) -> Mantém separado (Skills/Áreas).
4. **BI** (`/admin/bi`) -> Mantém separado (Analytics).
5. **Importação** (`/importar`) -> Mantém separado (Operação).

*Redução de 10 para 5 itens principais no grupo.*

## 4. Próximos Passos (AI-USAGE-1)
1. Criar o componente `AiGovernanceContainer` que unifica Status, Testes e Métricas.
2. Atualizar `AdminPage.tsx` para incluir a aba `ai` e remover a duplicidade da aba `health` se ela for acessada via menu.
3. Decidir se `AdminAiProviderCredentialsPage` deve ser uma aba ou continuar separada devido à sensibilidade (preferência: manter separada ou aba protegida).
