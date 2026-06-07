# Auditoria da Tela de Configurações — CONFIG-UI-AUDIT-1

## 1. Localização e Roteamento

A plataforma não possui uma única tela de "Configurações" global, mas sim um conjunto de páginas administrativas agrupadas sob o prefixo `/admin` e uma página de perfil em `/perfil`.

### Principais Páginas Administrativas:
- **Painel de Administração**: `/admin` (`AdminPage.tsx`)
- **Laboratório IA**: `/admin/ia` (`AiSettingsPage.tsx`)
- **Health do Sistema**: `/admin/health` (`SystemHealthPage.tsx`)
- **Credenciais IA**: `/admin/ai-provider-credentials` (`AdminAiProviderCredentialsPage.tsx`)
- **Usuários**: `/admin/usuarios` (`UsersPage.tsx`)
- **Cadastros**: `/admin/cadastros` (`CadastrosPage.tsx`)
- **Auditoria**: `/admin/auditoria` (`AuditLogsPage.tsx`)

### Layout e Navegação:
- Todas as páginas usam o `AppShell.tsx` como layout pai.
- O menu lateral (Sidebar) possui um item "Administração" (dropdown) que lista estas páginas.
- A `AdminPage.tsx` funciona como um hub, contendo cards de ações rápidas que levam às sub-páginas.

## 2. Abas e Seções Existentes

### `AdminPage.tsx` (Abas Internas):
1. **Painel Geral e Ações (`overview`)**: Cards de KPI e links para gerenciar usuários, cadastros, auditoria, health, credenciais IA, BI e templates comportamentais.
2. **Matriz de Permissões (`permissions`)**: Visualização de permissões por role.
3. **Diagnóstico Operacional (`diagnostics`)**: Investigação de inconsistências em candidatos e vagas.
4. **Health do Sistema (`health`)**: Embed da `SystemHealthPage.tsx`.

### `SystemHealthPage.tsx` (Abas Internas):
1. **Visão Geral**: Status de Backend, Banco e Redis.
2. **IA / Tokens**: Métricas de consumo de tokens, custos estimados e limites de IA.
3. **Filas**: Status do Redis/Celery.
4. **Banco**: Latência e contadores de tabelas.
5. **Erros**: Falhas recentes e logs.

### `AiSettingsPage.tsx` (Seções):
- **Status Geral**: Provider e modelo padrão.
- **Provider (Gemini)**: Configuração de chave e embedding.
- **RAG**: Status de síntese e storage vetorial.
- **Assistente**: Flags de habilitação e modo.
- **Protheus**: Flags de bloqueio de envio real.
- **Warnings**: Alertas de configuração.
- **Testes Rápidos**: Execução de intents RAG estruturadas.

## 3. Componentes Utilizados

- **Estrutura**: `PageHeader`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`.
- **Feedback**: `Badge`, `Button`, `Alert`, `AlertTitle`, `AlertDescription`.
- **Visualização**: `SimpleBarChart`, `SimpleDonutChart`, `Table`.
- **Inputs**: `Input`, `Label`, `select`, `Dialog`.
- **Ícones**: `lucide-react` (Activity, ShieldCheck, HeartPulse, Sparkles, BrainCircuit, etc.).

## 4. Permissões e Segurança

- As rotas administrativas são protegidas por `ADMIN_ONLY_ROLES` (atualmente apenas `admin`).
- A proteção é feita no `AppRouter.tsx` via `protectedPage`.
- As credenciais de IA (`AdminAiProviderCredentialsPage`) nunca exibem as chaves reais após salvamento.
- Informações sensíveis (como `embedding`, `vector_json`) são filtradas no frontend via `filterSensitive` antes da exibição.

## 5. Padrão Visual

- Estilo moderno e "limpo" (Shadcn UI).
- Uso consistente de cards para agrupar informações relacionadas.
- Cores semânticas (success, warning, danger, info) em badges e ícones.
- Tabelas para listagem de dados estruturados (usuários, auditoria, credenciais).
- Navegação interna via barras de abas (Tabs) estilizadas como botões dentro de um container arredondado.

## 6. Plano para a futura aba "IA" (AI-USAGE-1)

Para adicionar uma aba "IA" centralizada sem quebrar a UX:

### Estratégia:
1. **Unificação**: Mover o conteúdo de `AiSettingsPage.tsx` (Laboratório IA) e a aba "IA / Tokens" de `SystemHealthPage.tsx` para um novo componente de abas IA.
2. **Nova Aba em Admin**: Adicionar a aba `ia` em `AdminPage.tsx`.
3. **Seções da Aba IA**:
   - **Métricas**: Consumo de tokens e custos (vindo da SystemHealth).
   - **Configurações/Status**: Status de RAG, Assistente e Providers (vindo da AiSettings).
   - **Credenciais**: Link ou atalho para gerenciar chaves.
   - **Laboratório**: Testes rápidos de RAG.

### Benefícios:
- Evita que o usuário precise navegar entre 3 páginas diferentes para gerenciar IA.
- Mantém o padrão visual de abas da `AdminPage`.
- Consolida a governança de IA em um único lugar.
