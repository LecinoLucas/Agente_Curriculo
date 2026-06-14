# AI-USAGE-LEGACY-REMOVAL-1

## O que foi removido

- `AiUsagePanel` foi removido do frontend
- `SystemHealthPage` deixou de renderizar a visão operacional duplicada de tokens/custos
- `AiGovernancePanel` deixou de renderizar resumo de uso, tabelas por feature e recentes duplicados
- `AdminBiPage` deixou de renderizar gráfico operacional diário de IA
- `AdminBiPage` deixou de renderizar tabela de análises mais caras baseada em logs internos
- `systemHealthService.getAIUsage(...)` foi removido do frontend
- `aiSettingsService.getUsageSummary(...)` foi removido do frontend

## O que foi mantido

- `SystemHealthPage` continua para health, limites e pricing
- `AiGovernancePanel` continua para status, flags e governança
- `AiSettingsPage` continua como laboratório/configuração
- `AdminBiPage` continua com indicadores agregados executivos
- endpoint backend `GET /api/v1/admin/health/ai-usage` foi mantido por compatibilidade
- endpoint backend `GET /api/v1/ai/usage/summary` foi mantido por compatibilidade

## O que virou link para a central

- `SystemHealthPage` agora aponta para `/admin/ia/uso` na aba `IA / Limites`
- `AiGovernancePanel` agora aponta para `/admin/ia/uso`
- `AdminBiPage` agora aponta para `/admin/ia/uso`
- `AdminPage` já favorecia a central e foi mantido assim

## Endpoints mantidos/deprecados/removidos

- mantido: `GET /api/v1/admin/health/ai-usage-center`
- mantido: `GET /api/v1/admin/health/ai-usage/pricing`
- mantido: `POST /api/v1/admin/health/ai-usage/backfill-costs`
- mantido por compatibilidade: `GET /api/v1/admin/health/ai-usage`
- mantido por compatibilidade: `GET /api/v1/ai/usage/summary`
- removido: nenhum endpoint backend nesta fase

## Services removidos

- frontend `AiUsagePanel`
- frontend `systemHealthService.getAIUsage(...)`
- frontend `aiSettingsService.getUsageSummary(...)`

## Testes executados

- `cd frontend && npm run test -- --run AIUsageCenter`
- `cd frontend && npm run test -- --run SystemHealthPage`
- `cd frontend && npm run test -- --run AdminPage`
- `cd frontend && npm run test -- --run AdminBiPage`
- `cd frontend && npm run test -- --run AppShell.nav`
- `cd frontend && npm run test -- --run AiSettingsPage`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

## Riscos

- endpoints backend legados continuam existindo e podem ser reusados acidentalmente em futuras telas
- `AdminBiPage` ainda mostra métricas agregadas de IA, então mudanças futuras precisam preservar o limite entre executivo e operacional
- `SystemHealthPage` ainda expõe pricing e backfill, o que é correto, mas a copy precisa continuar clara para não virar um segundo painel de observabilidade

## Pendências

- fase seguinte opcional para deprecar ou remover endpoints backend antigos quando não houver consumidores
- revisar se `AdminBiPage` ainda precisa manter todos os cards agregados de IA no longo prazo
- monitorar se alguma documentação interna ainda referencia `IA / Tokens`
