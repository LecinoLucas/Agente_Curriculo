# AI-USAGE-CENTER-FOUNDATION-1

## Problema

O projeto já tinha múltiplas superfícies administrativas para observar uso e custo de IA, mas cada uma cobria um recorte diferente. Isso fragmentava a operação, espalhava a lógica de leitura e dificultava responder de forma objetiva quanto está sendo gasto por fluxo, modelo e status.

## Telas antigas identificadas

- `SystemHealthPage` com a aba `IA / Tokens`
- `AiUsagePanel`
- `AiGovernancePanel`
- `AiSettingsPage`
- `AdminBiPage`

## Endpoint único criado/reaproveitado

- Novo endpoint único: `GET /api/v1/admin/health/ai-usage-center`
- Fonte principal: `ai_usage_logs`
- Serviço: `SystemHealthService.get_ai_usage_center(...)`
- Permissão: `AdminOnly`

## Contrato

O endpoint novo centraliza:

- `period`
- `summary`
- `by_operation`
- `by_model`
- `recent_events`
- `pricing`
- `gaps`

O contrato prioriza observabilidade operacional e não expõe payloads sensíveis. Eventos recentes retornam apenas campos seguros de auditoria, com `error_message` sanitizado.

## Nova rota

- Frontend: `/admin/ia/uso`
- Página: `AIUsageCenterPage`

## Seções da tela

- Header com título, subtítulo e filtros
- Cards de resumo geral
- Tabela por fluxo/operação
- Tabela por provider/model
- Eventos recentes
- Lacunas de observabilidade

## Dados sensíveis protegidos

- Prompt completo não é retornado
- Currículo não é retornado
- Resposta bruta da IA não é retornada
- Eventos recentes são limitados
- `error_message` passa por sanitização antes da resposta

## Lacunas ainda existentes

- Nem todos os fluxos distinguem explicitamente `retry_count`
- `rate_limited` e `blocked` dependem da qualidade do status persistido em `ai_usage_logs`
- Parte do legado ainda continua disponível em telas antigas
- Alguns fluxos podem continuar chegando como `unknown` quando o `operation` não é preenchido
- O warning sobre `ai_assistant` sem operação dedicada continua sendo sinalizado quando aparecerem logs genéricos

## O que ficou legado

- `SystemHealthPage` continua existindo
- `AiUsagePanel` e `AiGovernancePanel` continuam existindo
- `AdminBiPage` continua existindo
- `AiSettingsPage` continua existindo

Nesta fase a navegação principal foi ajustada para favorecer a nova central, mas o legado não foi removido.

## Plano de remoção

Próxima fase sugerida: `AI-USAGE-LEGACY-REMOVAL-1`

Escopo esperado da próxima fase:

- remover duplicidade visual e de navegação
- manter apenas a nova central como entrada principal de uso/custo de IA
- decidir quais partes de BI e health continuam como suporte operacional e quais viram legado removível
- revisar se painéis antigos ainda são necessários para depuração pontual
