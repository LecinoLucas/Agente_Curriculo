# Relatório de Mudança na Navegação Administrativa — ADMIN-NAV-1

## 1. Objetivo
Simplificar a barra lateral (sidebar) administrativa para reduzir a fragmentação e tornar a experiência de governança mais centrada no hub `/admin`.

## 2. Mudanças na Sidebar (Grupo Administração)

### Itens Mantidos:
- **Painel Admin** (`/admin`): Ponto central de governança.
- **Estrutura operacional** (`/admin/estrutura-operacional`): Mantido por ser de uso frequente no RH.
- **Cadastros** (`/admin/cadastros`): Mantido por ser de uso frequente (Skills/Áreas).
- **BI** (`/admin/bi`): Mantido (Analytics).
- **Importação** (`/importar`): Mantido (Carga de candidatos).

### Itens Removidos da Sidebar (Acessíveis via Hub `/admin`):
- **Usuários** (`/admin/usuarios`): Disponível no hub.
- **Credenciais IA** (`/admin/ai-provider-credentials`): Disponível no hub.
- **Laboratório IA** (`/admin/ia`): Disponível no hub e na aba IA.
- **Auditoria** (`/admin/auditoria`): Disponível no hub.
- **Saúde do sistema** (`/admin/health`): Disponível no hub.
- **Importação por formulário** (`/importar-formulario`): Disponível no hub.

## 3. Melhorias no Hub `/admin`
- Adicionado atalho direto para o **Laboratório IA** na aba de visão geral.
- Adicionado atalho direto para **Importação por formulário** na aba de visão geral.
- Preservada a **Aba IA** (AI-USAGE-1) com métricas de tokens e status operacional.

## 4. Preservação de Funcionalidades
- Todas as rotas originais no `AppRouter.tsx` permanecem inalteradas.
- O acesso direto via URL continua funcionando para todas as páginas.
- Nenhuma alteração foi feita no backend ou nos serviços de IA.
