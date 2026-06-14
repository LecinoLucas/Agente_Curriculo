# AI-USAGE-DASHBOARD-AUDIT-1

## Objetivo

Auditar as telas, services frontend, endpoints backend e fontes de dados já existentes para responder se o sistema já acompanha uso de IA, tokens e custo estimado antes de qualquer nova fase de controle.

## Estado da árvore

- `git status --short` estava vazio antes da auditoria.
- Esta fase permaneceu audit-only.
- O único artefato novo criado foi este relatório.

## Telas encontradas

- `frontend/src/pages/SystemHealthPage.tsx`
  - Aba `IA / Tokens`.
  - Painel operacional mais completo de uso/custo.
  - Filtros: `date_from`, `date_to`, `provider`, `model`.
  - Métricas: chamadas, tokens entrada/saída/total, custo estimado, falhas, latência média, uso por provider, uso por modelo, uso diário, top análises mais caras.
- `frontend/src/features/ai-settings/components/AiGovernancePanel.tsx`
  - Visão executiva dentro da área de IA.
  - Usa resumo leve por período e embute `AiUsagePanel`.
- `frontend/src/features/ai-settings/pages/AiSettingsPage.tsx`
  - Página de laboratório/admin de IA.
  - Não é o painel principal de custo, mas é uma superfície relacionada e admin-only.
- `frontend/src/pages/AdminBiPage.tsx`
  - Mostra consumo agregado de IA dentro do BI de recrutamento.
  - Filtros: período, vaga, área, provider.
  - Métricas: tokens IA usados, chamadas IA, custo estimado, uso diário e top análises mais caras.

## Componentes frontend auditados

- `frontend/src/features/ai-settings/components/AiUsagePanel.tsx`
- `frontend/src/features/ai-settings/components/AiGovernancePanel.tsx`
- `frontend/src/pages/SystemHealthPage.tsx`
- `frontend/src/pages/AdminBiPage.tsx`
- `frontend/src/features/ai-settings/pages/AiSettingsPage.tsx`
- `frontend/src/app/AppRouter.tsx`
- `frontend/src/pages/__tests__/SystemHealthPage.test.tsx`
- `frontend/src/pages/__tests__/AdminBiPage.test.tsx`
- `frontend/src/features/ai-settings/__tests__/AiSettingsPage.test.tsx`

## Services/hooks frontend auditados

- `frontend/src/services/systemHealthService.ts`
  - `GET /api/v1/admin/health/ai-usage`
  - `GET /api/v1/admin/health/ai-usage/pricing`
  - `POST /api/v1/admin/health/ai-usage/backfill-costs`
- `frontend/src/features/ai-settings/services/aiSettingsService.ts`
  - `GET /api/v1/ai/status`
  - `GET /api/v1/ai/usage/summary`
- `frontend/src/services/adminBiService.ts`
  - `GET /api/v1/admin/bi/overview`
- `frontend/src/hooks/useAsyncState.ts`

## Endpoints backend encontrados

- `backend/src/interface/api/routers/admin_system_health.py`
  - `GET /api/v1/admin/health/ai-usage`
  - `GET /api/v1/admin/health/ai-usage/pricing`
  - `POST /api/v1/admin/health/ai-usage/backfill-costs`
- `backend/src/interface/api/routers/ai_assistant.py`
  - `GET /api/v1/ai/usage/summary`
  - `GET /api/v1/ai/status`
- `backend/src/interface/api/routers/admin_bi.py`
  - `GET /api/v1/admin/bi/overview`

## Fonte dos dados

- Fonte principal: tabela `ai_usage_logs` via `backend/src/infrastructure/database/models/ai_usage_log_model.py`.
- Campos persistidos:
  - `provider`, `model`, `operation`, `analysis_id`, `candidate_id`, `job_id`
  - `input_tokens`, `output_tokens`, `total_tokens`
  - `estimated_cost_usd`, `latency_ms`, `status`, `error_message`, `created_at`
- Serviços consumidores:
  - `backend/src/application/services/system_health_service.py`
  - `backend/src/application/services/ai_usage_log_service.py`
  - `backend/src/application/services/admin_bi_service.py`
- Pricing:
  - `backend/src/core/ai_pricing.py`
  - tabela centralizada em código, com aliases de provider e preço por `input_tokens` e `output_tokens`

## Fluxos de IA cobertos

- `job_ai_draft`
  - registrado no backend
  - aparece no endpoint leve `/ai/usage/summary` por `operation`
  - contribui para `/admin/health/ai-usage` e `/admin/bi/overview` apenas de forma agregada
- `resume_analysis`
  - registrado no backend
  - entra nos agregados operacionais e no resumo por feature
- `rag_synthesis`
  - registrado no backend quando há chamada ao provider
  - entra nos agregados e no resumo por feature
- `behavioral_analysis`
  - registrado no backend
  - entra nos agregados e no resumo por feature
- `job_profile`
  - registrado no backend
  - entra nos agregados e no resumo por feature

## Fluxos de IA ausentes

- `resume_extraction`
  - o fluxo auditado é OCR/local extraction; não há persistência em `ai_usage_logs`
  - não aparece em endpoint nem em tela de custo/tokens
- `ai_assistant`
  - não foi encontrado fluxo de uso/token/custo equivalente na auditoria atual
  - o endpoint `/ai/usage/summary` é um consumidor dos logs, não um produtor
- `image_to_draft`
  - não foi encontrado fluxo separado
  - se houver OCR fornecido ao `job_ai_draft`, o custo aparece apenas como `job_ai_draft`
- `blocked/invalid payload` sem chamada a provider
  - em geral não aparecem como custo
  - não há classificação explícita na tela
- `unknown/sem flow`
  - não há agrupamento específico para operações desconhecidas além do valor bruto de `operation`

## Como o custo é calculado hoje

- O custo é estimado em `backend/src/core/ai_pricing.py`.
- A fórmula usa `input_tokens` e `output_tokens`.
- Não há pesquisa de preço externa em runtime.
- Se o modelo/provider não tiver preço configurado, `estimated_cost_usd` fica `NULL`.
- Há backfill admin-only para recalcular custos antigos quando pricing passa a existir.
- O painel operacional e o BI exibem custo estimado interno e deixam explícito que billing oficial deve ser consultado fora do sistema.

## Como tokens são registrados hoje

- O registro central é feito por `persist_ai_usage_log` / `safe_persist_ai_usage_log`.
- `total_tokens` é derivado de `input_tokens + output_tokens`.
- O resumo leve `/ai/usage/summary` expõe:
  - `totals`
  - `by_feature` agrupado por `operation`
  - `recent` com `provider`, `model`, `status`, `total_tokens`, `created_at`
- O painel operacional `/admin/health/ai-usage` expõe:
  - totais agregados
  - cortes por provider e model
  - série diária
  - top análises mais caras
- O BI reaproveita a mesma base, mas sem corte por model nem por `operation`.

## Failures/retries/rate limits

- Failures:
  - entram no log quando o fluxo persiste uma linha com `status != success`
  - `SystemHealthService` agrega tudo que não é `success` como falha
- Retries:
  - não existe campo `retry_count` em `ai_usage_logs`
  - quando um fluxo reexecuta, as tentativas não ficam explicitamente ligadas na tela
- Rate limits:
  - não há corte específico no dashboard
  - podem aparecer apenas dentro de `error_message`/status agregado
- Falhas com custo real:
  - existem casos como `job_ai_draft` parse error em que tokens foram consumidos e a linha fica com erro
- Falhas sem custo:
  - existem casos com `usage_unavailable` ou erro local antes de tokens, que geram erro com custo zero ou nulo
- Bloqueios locais:
  - ex. `rag_synthesis` com feature desligada ou sem chunks não gera chamada ao provider e não entra no log de custo

## Permissões

- Frontend:
  - rotas `/admin/health`, `/admin/ia` e `/admin/bi` usam `ADMIN_ONLY_ROLES`
- Backend:
  - `/admin/health/*`, `/admin/bi/overview`, `/ai/status` e `/ai/usage/summary` exigem `AdminOnly`
- Conclusão:
  - a proteção não depende só do frontend; o backend bloqueia de fato usuários não admin

## Privacidade

Seguro:

- `ai_usage_logs` não persiste prompt completo, resposta bruta, texto de currículo, OCR bruto ou embeddings.
- Testes de `AIUsageService` validam que o resumo não expõe `prompt`, `payload_json`, `vector_json`, `content_hash` ou `embeddings`.
- `AiSettingsPage` tem testes garantindo que chaves sensíveis e blobs técnicos não são exibidos.

Suspeito / atenção:

- `error_message` é persistido e exibido em superfícies admin.
- Existe sanitização em `backend/src/core/log_sanitizer.py` para API keys, bearer tokens e segredos em query/assignment.
- Mesmo com sanitização, ainda há risco residual de mensagens do provider conterem texto sensível não coberto por regex, principalmente se uma exceção carregar trechos de payload ou contexto de negócio.

Conclusão:

- Não foi encontrada exposição explícita de prompt completo, currículo completo ou resposta bruta da IA nas telas/endpoints auditados.
- O principal ponto de atenção de privacidade é `error_message` sanitizado, não os campos de uso/tokens em si.

## Lacunas encontradas

- Há três superfícies para o mesmo tema, com granularidades diferentes e sem visão única.
- O painel operacional não agrupa por fluxo `operation`.
- O resumo por feature `/ai/usage/summary` mostra tokens e erros, mas não mostra custo.
- O BI mostra custo/tokens agregados, mas não mostra `operation`, `model` nem detalhe de falhas de uso.
- `top_expensive_analyses` depende de `analysis_id`, então fluxos caros sem `analysis_id` podem ficar invisíveis nessa lista.
- Não existe `retry_count`.
- Não existe classificação explícita de timeout, rate limit, blocked local, invalid payload ou provider error type no dashboard principal.
- `resume_extraction`/OCR local fica fora do painel de custo de IA.

## Riscos

- Leitura equivocada do custo por fluxo, porque o painel mais completo agrega tudo sem quebrar por `operation`.
- Subcontagem interpretativa de retries, já que tentativas não são vinculadas.
- Mistura entre falha com custo real e falha local sem custo.
- Falsa sensação de cobertura total, porque alguns fluxos não entram no log ou entram sem detalhe suficiente.
- Exposição residual de dados sensíveis via `error_message`, embora mitigada por sanitização e acesso admin-only.

## Recomendações

- Consolidar a próxima fase em cima das superfícies existentes, sem criar painel paralelo.
- Priorizar uma visão por fluxo `operation` sobre `ai_usage_logs`, em vez de nova fonte.
- Separar no dashboard:
  - sucesso
  - falha com consumo
  - falha sem consumo
  - bloqueio local sem chamada ao provider
- Tratar `error_message` como dado sensível de baixo volume e revisar se a sanitização atual é suficiente para mensagens de provider.
- Decidir explicitamente se OCR/local extraction deve ou não compor o dashboard de custo de IA.

## Próxima fase sugerida

- `AI-USAGE-DASHBOARD-FIX-1`
  - Motivo: a tela já existe, mas está fragmentada e incompleta para responder custo por fluxo, retries e falha com ou sem consumo.

## Testes executados

- `cd backend && .venv/bin/python -m pytest tests -k "ai_usage or usage or cost or observability or health" -v`
  - coleta interrompida por erro conhecido fora de escopo: `ImportError: cannot import name '_remove_sensitive_resume_data'`
- `cd backend && .venv/bin/python -m pytest tests/unit/test_ai_usage_endpoint.py tests/unit/test_ai_usage_service.py tests/unit/test_ai_usage_hardening.py tests/integration/test_ai_usage_cost.py tests/integration/test_admin_system_health_api.py tests/integration/test_admin_bi_api.py -v`
  - `52 passed`
- `cd frontend && npm run test -- --run AiUsage`
  - nenhum arquivo de teste encontrado com esse filtro nominal
- `cd frontend && npx tsc --noEmit`
  - `TypeScript: No errors found`

## Confirmações

- Nenhuma tela nova foi criada.
- Nenhum endpoint novo foi criado.
- Nenhum cálculo de custo foi alterado.
- Nenhum provider/model foi alterado.
- Nenhuma migration foi criada.
- Nenhum catálogo de skills foi alterado.
- Nenhum seed foi alterado.
- Nenhum fluxo de Job AI Draft, Resume Analysis, AI Assistant/RAG, Candidate Portal ou Protheus foi modificado.

## Matriz obrigatória

| Fluxo | Registrado no backend | Aparece no endpoint | Aparece na tela | Tokens | Custo | Status | Lacuna |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `job_ai_draft` | sim | sim | sim, só agregado | sim | sim se pricing existir | `success`/`error` | sem `retry_count`, sem visão dedicada por fluxo |
| `resume_analysis` | sim | sim | sim, só agregado | sim | sim se pricing existir | `success`/`failed` | sem distinção entre timeout e outras falhas |
| `resume_extraction` | não em `ai_usage_logs` | não | não | não | não | fora do dashboard | OCR/local extraction não entra como custo de IA |
| `ai_assistant` | não confirmado como fluxo de custo | n/a | não como custo | não na auditoria atual | não na auditoria atual | n/a | existe endpoint de resumo, não log próprio de consumo auditado |
| `rag_synthesis` | sim quando chama provider | sim | sim, só agregado | sim | sim se pricing existir | `success`/`error` | bloqueios locais sem provider não entram no dashboard |
| `image_to_draft` | não encontrado como fluxo separado | não | não | não separado | não separado | n/a | se houver OCR entregue ao draft, custo fica absorvido em `job_ai_draft` |
| `behavioral_analysis` | sim | sim | sim, só agregado | sim | sim se pricing existir | `success`/`error` | retries não são distinguíveis |
| `job_profile` | sim | sim | sim, só agregado | sim | sim se pricing existir | depende do log persistido | não aparece como categoria própria na UI |
| retries | parcialmente | não explicitamente | não explicitamente | pode haver | pode haver | agregado | não há `retry_count` nem vínculo entre tentativas |
| failures | sim | sim | sim | às vezes | às vezes | agregado | não separa falha com consumo vs sem consumo |
| rate limits | parcialmente | não explicitamente | não explicitamente | depende | depende | agregado em erro | sem classificação dedicada |
| blocked/invalid payload local | parcialmente | não explicitamente | não explicitamente | às vezes zero | zero/nulo | agregado ou ausente | bloqueios sem chamada podem sumir do painel |
