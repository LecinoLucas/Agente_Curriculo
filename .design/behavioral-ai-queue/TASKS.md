# Build Tasks: IA Comportamental

Generated from: `.design/behavioral-ai-queue/DESIGN_BRIEF.md`
Architecture source: `.design/behavioral-ai-operations/INFORMATION_ARCHITECTURE.md`

## BA-4 Backend Audit

### BA-4.1 - Auditar endpoints existentes de IA comportamental

- **Objetivo:** Confirmar exatamente quais endpoints ja existem, quais parametros aceitam e quais campos retornam para listagem, metricas, retry e detalhe.
- **Arquivos provaveis:** `backend/src/interface/api/routers/admin_behavioral_ai.py`, `backend/src/interface/api/routers/jobs.py`, `backend/src/application/services/behavioral_ai_evaluation_service.py`, `backend/src/infrastructure/repositories/sqlalchemy_behavioral_assignment_ai_repository.py`, `frontend/src/services/behavioralAIEvaluationService.ts`.
- **Escopo permitido:** Leitura de codigo, mapeamento de contratos, levantamento de lacunas, consulta a testes existentes.
- **Fora de escopo:** Alterar endpoints, schema, permissoes, migrations ou frontend.
- **Criterio de aceite:** Documento/nota de auditoria identifica endpoints, parametros, response shape, filtros suportados, paginacao, retry, metricas e autorizacao atual.
- **Validacao:** Comparar codigo com testes existentes e, se necessario, chamadas locais autenticadas em ambiente dev.
- **Dependencias:** Nenhuma. Esta e a primeira tarefa implementavel.
- **Risco:** Comecar pelo frontend sem confirmar contrato pode gerar inferencias inseguras e retrabalho.

### BA-4.2 - Auditar seguranca dos campos retornados

- **Objetivo:** Garantir que os endpoints administrativos nao retornem `api_key`, `encrypted_api_key`, prompt bruto, resposta bruta, stack trace, headers ou payload sensivel.
- **Arquivos provaveis:** `backend/src/application/services/behavioral_ai_evaluation_service.py`, `backend/src/interface/api/routers/admin_behavioral_ai.py`, `backend/tests/integration/test_behavioral_ai_evaluation.py`, `backend/tests/unit/test_analysis_safe_logging.py`.
- **Escopo permitido:** Leitura de serializacao, logs, DTOs/responses e testes.
- **Fora de escopo:** Implementar sanitizacao nova nesta tarefa.
- **Criterio de aceite:** Lista objetiva de campos seguros, campos proibidos e gaps encontrados.
- **Validacao:** Busca por strings sensiveis em responses/logs e revisao dos objetos retornados pelo endpoint.
- **Dependencias:** BA-4.1.
- **Risco:** Um campo tecnico aparentemente util pode expor segredo ou conteudo sensivel.

### BA-4.3 - Auditar regras de retry e estados operacionais

- **Objetivo:** Confirmar quando uma avaliacao pode ser reprocessada e como `pending`, `processing`, `completed`, `failed`, `retry_scheduled`, rate limit e credencial invalida sao representados.
- **Arquivos provaveis:** `backend/src/application/services/behavioral_ai_evaluation_service.py`, `backend/src/interface/workers/behavioral_ai_tasks.py`, `backend/src/interface/api/routers/admin_behavioral_ai.py`.
- **Escopo permitido:** Leitura de regras de idempotencia, stale, retry e status.
- **Fora de escopo:** Mudar regra de negocio ou status persistido.
- **Criterio de aceite:** Matriz estado -> label UI -> acao permitida -> risco.
- **Validacao:** Conferir com testes de retry/stale/rate limit ja existentes.
- **Dependencias:** BA-4.1.
- **Risco:** Habilitar retry indevido pode duplicar task ou mascarar avaliacao completed.

## BA-5 Backend API

### BA-5.1 - Definir contrato final da listagem administrativa

- **Objetivo:** Especificar response contract para `GET /api/v1/admin/behavioral-ai/evaluations` com todos os campos que a UI precisa.
- **Arquivos provaveis:** `backend/src/interface/api/routers/admin_behavioral_ai.py`, `backend/src/application/services/behavioral_ai_evaluation_service.py`, `frontend/src/types/domain.ts`, `frontend/src/services/behavioralAIEvaluationService.ts`.
- **Escopo permitido:** Especificacao de contrato e, na fase de implementacao futura, ajuste de response sem expor dados sensiveis.
- **Fora de escopo:** Criar migration, mudar pipeline, score, ranking, matching, `current_analysis_id` ou `active_job_id`.
- **Criterio de aceite:** Contrato inclui `id`, `candidate_id`, `candidate_name`, `job_id`, `job_title`, `status`, `provider`, `model`, `retry_count`, `created_at`, `queued_at`, `started_at`, `completed_at`, `failed_at`, `next_retry_at`, `provider_error_type`, `provider_status_code`, `error_message`, `can_retry`, `retry_reason`, `stuck` quando aplicavel.
- **Validacao:** Teste backend de shape da resposta e ausencia de campos proibidos.
- **Dependencias:** BA-4.1, BA-4.2, BA-4.3.
- **Risco:** Sem `can_retry`, o frontend tende a inferir regra de retry por timestamp/status.

### BA-5.2 - Planejar filtros e paginacao no backend

- **Objetivo:** Confirmar ou planejar suporte backend para filtros por status, erro, provider, modelo, periodo e busca por candidato/vaga.
- **Arquivos provaveis:** `backend/src/interface/api/routers/admin_behavioral_ai.py`, `backend/src/application/services/behavioral_ai_evaluation_service.py`, `backend/src/infrastructure/repositories/sqlalchemy_behavioral_assignment_ai_repository.py`.
- **Escopo permitido:** Contrato de query params e comportamento esperado.
- **Fora de escopo:** Implementar UI.
- **Criterio de aceite:** Query params definidos: `page`, `page_size`, `status`, `error_type`, `provider`, `model`, `search`, `date_from`, `date_to`.
- **Validacao:** Testes backend para combinacoes principais e paginacao.
- **Dependencias:** BA-5.1.
- **Risco:** Filtragem client-side em pagina parcial pode gerar KPIs/lista inconsistentes.

### BA-5.3 - Definir contrato de KPIs operacionais

- **Objetivo:** Especificar como a UI obtera contagens de pendentes, processando, concluidas hoje, falhas, rate limited, credencial invalida, proximos retries e fila `behavioral_ai`.
- **Arquivos provaveis:** `backend/src/interface/api/routers/admin_behavioral_ai.py`, `backend/src/application/services/behavioral_ai_evaluation_service.py`, `backend/src/infrastructure/queue/celery_app.py`, `backend/src/application/services/system_health_service.py`.
- **Escopo permitido:** Definicao/ajuste de endpoint seguro de metricas, sem expor payloads de fila.
- **Fora de escopo:** Ler mensagens brutas do Redis no frontend ou exibir payloads de task.
- **Criterio de aceite:** UI consegue renderizar KPIs sem calcular metricas globais a partir da pagina atual.
- **Validacao:** Testes backend de metricas e valores zerados.
- **Dependencias:** BA-4.1.
- **Risco:** Tamanho de fila pode exigir endpoint separado; consultar Redis diretamente pode expor payload ou quebrar isolamento.

### BA-5.4 - Testes backend do contrato operacional

- **Objetivo:** Cobrir listagem, filtros, paginacao, metricas, retry permitido/negado e sanitizacao.
- **Arquivos provaveis:** `backend/tests/integration/test_behavioral_ai_evaluation.py`, novo `backend/tests/integration/test_behavioral_ai_operations.py`.
- **Escopo permitido:** Testes de API e service para IA comportamental.
- **Fora de escopo:** Testes de resume/matching, pipeline, score ou ranking.
- **Criterio de aceite:** Testes falham se response expuser campo proibido ou se retry aparecer indevidamente.
- **Validacao:** `.venv/bin/pytest tests/integration/test_behavioral_ai* -q`.
- **Dependencias:** BA-5.1, BA-5.2, BA-5.3.
- **Risco:** Cobertura insuficiente pode permitir regressao de seguranca.

## BA-6 Frontend Foundation

### BA-6.1 - Criar contrato TypeScript e service da fila comportamental

- **Objetivo:** Modelar tipos e funcoes de API para listagem, metricas e retry da IA comportamental.
- **Arquivos provaveis:** `frontend/src/types/domain.ts`, `frontend/src/services/behavioralAIEvaluationService.ts`, possivel `frontend/src/features/behavioral-ai-queue/types.ts`.
- **Escopo permitido:** Tipos, normalizadores seguros, montagem de query string e tratamento de valores nulos.
- **Fora de escopo:** Criar pagina visual completa.
- **Criterio de aceite:** Service expõe funcoes previsiveis para `list`, `metrics` e `retry`, preservando `provider_error_type` e mensagens seguras.
- **Validacao:** Testes unitarios de service/normalizer quando houver mock de `httpRequest`.
- **Dependencias:** BA-5.1, BA-5.2, BA-5.3.
- **Risco:** Normalizador pode transformar status desconhecido em label enganosa.

### BA-6.2 - Criar utilitarios de status, erro e datas

- **Objetivo:** Centralizar labels, tons, ordenacao, erro seguro e formatacao de timestamps para a tela.
- **Arquivos provaveis:** `frontend/src/features/analyses/utils/analysisFormatters.ts`, novo `frontend/src/features/behavioral-ai-queue/utils.ts`.
- **Escopo permitido:** Mapas de status/erro, sanitizacao visual defensiva, formatacao local.
- **Fora de escopo:** Alterar semantica backend ou inventar status nao persistido.
- **Criterio de aceite:** `pending`, `processing`, `completed`, `failed`, `retry_scheduled`, `ai_rate_limited`, `ai_credential_invalid` tem label/tone seguros.
- **Validacao:** Testes unitarios dos formatters, incluindo strings sensiveis.
- **Dependencias:** BA-6.1.
- **Risco:** Duplicar formatadores com `AnalisesIaPage` pode causar divergencia de labels.

### BA-6.3 - Registrar rota e item de menu

- **Objetivo:** Planejar a inclusao de `/analises-ia/comportamental` no router e no menu `IA & Automacao`.
- **Arquivos provaveis:** `frontend/src/app/AppRouter.tsx`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/__tests__/AppShell.nav.test.tsx`.
- **Escopo permitido:** Rota protegida para `admin` e `recruiter`, item de menu e icone.
- **Fora de escopo:** Alterar permissoes reais alem do padrao ja aprovado; remover rota `/analises-ia`.
- **Criterio de aceite:** Menu exibe `Curriculos e matching`, `IA Comportamental`, `Importacao de curriculos`, `Importacao por formulario`; rota nova carrega pagina dedicada.
- **Validacao:** Teste de navegacao/menu por role.
- **Dependencias:** BA-6.1.
- **Risco:** `isItemActive` com `/analises-ia` pode marcar ambos os itens se nao tratar subrota corretamente.

## BA-7 UI Implementation

### BA-7.1 - Criar shell da pagina IA Comportamental

- **Objetivo:** Implementar estrutura visual inicial com header, subtitulo dinamico, botao atualizar e area de conteudo.
- **Arquivos provaveis:** novo `frontend/src/pages/BehavioralAiQueuePage.tsx`, possivel `frontend/src/features/behavioral-ai-queue/hooks/useBehavioralAiQueuePage.ts`.
- **Escopo permitido:** Layout, carregamento inicial, refresh e erro basico usando tokens existentes.
- **Fora de escopo:** Tabela completa, detalhe e retry.
- **Criterio de aceite:** Pagina abre em `/analises-ia/comportamental`, carrega dados e mostra estado loading/erro sem quebrar.
- **Validacao:** Teste frontend renderizando a pagina com mocks.
- **Dependencias:** BA-6.1, BA-6.3.
- **Risco:** Criar visual desconectado do restante do app.

### BA-7.2 - Implementar KPIs operacionais

- **Objetivo:** Mostrar cards compactos para pendentes, processando, concluidas hoje, falhas, rate limited, credencial invalida, proximos retries e fila quando disponivel.
- **Arquivos provaveis:** `frontend/src/pages/BehavioralAiQueuePage.tsx`, novo `frontend/src/features/behavioral-ai-queue/components/BehavioralAiKpiGrid.tsx`.
- **Escopo permitido:** Cards responsivos usando tokens, valores ausentes como `-`.
- **Fora de escopo:** Calcular KPI global no frontend a partir de pagina parcial.
- **Criterio de aceite:** KPIs refletem endpoint de metricas e mantem layout estavel durante loading.
- **Validacao:** Testes com metricas preenchidas, vazias e ausentes.
- **Dependencias:** BA-5.3, BA-7.1.
- **Risco:** Exibir numeros da pagina atual como se fossem globais.

### BA-7.3 - Implementar filtros e query params

- **Objetivo:** Criar barra de filtros com busca, status, erro, provider, modelo, periodo e limpar filtros.
- **Arquivos provaveis:** novo `frontend/src/features/behavioral-ai-queue/components/BehavioralAiFilters.tsx`, hook da pagina.
- **Escopo permitido:** Estado de filtros, URL query params, reset, debounce/submissao conforme padrao existente.
- **Fora de escopo:** Filtros nao suportados pelo backend.
- **Criterio de aceite:** Alterar filtro refaz fetch, atualiza URL e pagina volta para 1.
- **Validacao:** Testes frontend para filtros principais e limpar filtros.
- **Dependencias:** BA-5.2, BA-7.1.
- **Risco:** Filtros locais podem divergir da paginacao backend.

### BA-7.4 - Implementar tabela operacional

- **Objetivo:** Listar avaliacoes com candidato, vaga, status, provider, modelo, tentativas, timestamps, proxima tentativa, erro seguro e acoes.
- **Arquivos provaveis:** novo `frontend/src/features/behavioral-ai-queue/components/BehavioralAiTable.tsx`, `BehavioralAiRow.tsx`, `frontend/src/components/common/DataTable.tsx` como reuso.
- **Escopo permitido:** Tabela responsiva, badges, truncamento de erro seguro, paginacao.
- **Fora de escopo:** Exibir prompt, resposta bruta, respostas completas ou stack trace.
- **Criterio de aceite:** Nenhum valor aparece como `undefined`; status e erro sao escaneaveis; paginacao funciona.
- **Validacao:** Testes frontend com todos os status e campos nulos.
- **Dependencias:** BA-6.2, BA-7.3.
- **Risco:** Tabela larga demais em telas menores; precisa overflow horizontal controlado.

### BA-7.5 - Implementar painel de detalhes seguros

- **Objetivo:** Permitir `Ver detalhes` com metadados e timeline operacional sem dados sensiveis.
- **Arquivos provaveis:** novo `frontend/src/features/behavioral-ai-queue/components/BehavioralAiDetailPanel.tsx` ou modal usando `frontend/src/components/common/Modal.tsx`.
- **Escopo permitido:** Detalhes seguros, timeline, status, provider/modelo, timestamps, erro sanitizado.
- **Fora de escopo:** Resultado bruto da IA, prompt, respostas comportamentais completas ou edicao.
- **Criterio de aceite:** Painel abre/fecha via teclado e nao renderiza dados proibidos.
- **Validacao:** Testes de acessibilidade basica e ausencia de strings proibidas.
- **Dependencias:** BA-7.4.
- **Risco:** Usuarios podem esperar ver resposta completa; o texto deve deixar claro que detalhes sao operacionais.

### BA-7.6 - Implementar acoes contextuais

- **Objetivo:** Adicionar abrir candidato, abrir vaga e reprocessar quando permitido pelo backend.
- **Arquivos provaveis:** `BehavioralAiRow.tsx`, hook da pagina, `frontend/src/services/behavioralAIEvaluationService.ts`.
- **Escopo permitido:** Navegacao, retry com loading por linha, refetch de lista e KPIs.
- **Fora de escopo:** Acao destrutiva, force fail, discard, alterar pipeline, score ou matching.
- **Criterio de aceite:** Retry aparece apenas com `can_retry`; duplo clique nao duplica request; sucesso muda estado para fila/processando conforme retorno.
- **Validacao:** Testes frontend para retry permitido/negado e refetch.
- **Dependencias:** BA-5.1, BA-7.4.
- **Risco:** Reusar acoes da tela de curriculos pode trazer opcoes indevidas como discard/force fail.

### BA-7.7 - Implementar estados vazios, erro, sem permissao e loading

- **Objetivo:** Cobrir todos os estados previstos no brief com mensagens seguras.
- **Arquivos provaveis:** `BehavioralAiQueuePage.tsx`, `BehavioralAiTable.tsx`, `EmptyState`, `Skeleton`.
- **Escopo permitido:** Skeletons, empty sem filtros, empty com filtros, erro API, sem permissao.
- **Fora de escopo:** Logar erro bruto ou mostrar payload de erro.
- **Criterio de aceite:** Cada estado tem copy clara e acao segura quando aplicavel.
- **Validacao:** Testes frontend para cada estado.
- **Dependencias:** BA-7.1, BA-7.3, BA-7.4.
- **Risco:** Mensagem generica pode esconder causa operacional segura.

## BA-8 Tests

### BA-8.1 - Testes backend da API operacional

- **Objetivo:** Validar contrato backend final de listagem, filtros, metricas, retry e seguranca.
- **Arquivos provaveis:** `backend/tests/integration/test_behavioral_ai_operations.py`, `backend/tests/integration/test_behavioral_ai_evaluation.py`.
- **Escopo permitido:** Testes de endpoints e services de IA comportamental.
- **Fora de escopo:** Testes de curriculo/matching.
- **Criterio de aceite:** Cobrir status, filtros, `can_retry`, metricas e ausencia de campos proibidos.
- **Validacao:** `.venv/bin/pytest tests/integration/test_behavioral_ai* -q`.
- **Dependencias:** BA-5.4.
- **Risco:** Se os testes usarem mocks fracos, podem nao detectar vazamento de campos.

### BA-8.2 - Testes frontend de service e formatters

- **Objetivo:** Garantir que normalizadores, filtros e labels nao exponham dados sensiveis e tratem nulos/status.
- **Arquivos provaveis:** `frontend/src/services/__tests__/behavioralAIEvaluationService.test.ts`, `frontend/src/features/behavioral-ai-queue/__tests__/formatters.test.ts`.
- **Escopo permitido:** Unit tests de mapeamento e sanitizacao.
- **Fora de escopo:** Render completo da pagina.
- **Criterio de aceite:** Strings com `api_key`, `encrypted_api_key`, `Authorization`, `Bearer`, prompt/resposta bruta e stack trace sao ocultadas.
- **Validacao:** `npm --prefix frontend test -- --run`.
- **Dependencias:** BA-6.1, BA-6.2.
- **Risco:** Sanitizacao somente visual nao substitui backend; teste deve deixar isso explicito.

### BA-8.3 - Testes frontend da pagina IA Comportamental

- **Objetivo:** Cobrir renderizacao da rota, menu, KPIs, filtros, tabela, estados, detalhe e retry.
- **Arquivos provaveis:** `frontend/src/pages/__tests__/BehavioralAiQueuePage.test.tsx`, `frontend/src/components/layout/__tests__/AppShell.nav.test.tsx`.
- **Escopo permitido:** Testes com mocks de API.
- **Fora de escopo:** E2E real com provider IA.
- **Criterio de aceite:** Testes cobrem todos os status pedidos e garantem que dados proibidos nao aparecem.
- **Validacao:** `npm --prefix frontend test -- --run`.
- **Dependencias:** BA-7.1 a BA-7.7.
- **Risco:** Mockar service em excesso pode nao validar query params.

### BA-8.4 - Build e regressao automatizada

- **Objetivo:** Confirmar que a nova tela nao quebra build nem suites existentes.
- **Arquivos provaveis:** Nenhum arquivo novo alem dos testes.
- **Escopo permitido:** Execucao de comandos e ajuste de testes se necessario.
- **Fora de escopo:** Refactors fora da feature.
- **Criterio de aceite:** Backend e frontend passam nas suites definidas.
- **Validacao:** `.venv/bin/pytest tests/integration/test_behavioral_ai* -q`, `.venv/bin/pytest tests/integration/test_admin_ai_provider_credentials.py -q`, `.venv/bin/pytest tests/unit/test_analysis_safe_logging.py -q`, `npm --prefix frontend run build`, `npm --prefix frontend test -- --run`.
- **Dependencias:** BA-8.1, BA-8.2, BA-8.3.
- **Risco:** Alteracoes em menu/router podem quebrar testes de navegacao existentes.

## BA-9 Smoke / Design Review

### BA-9.1 - Smoke test manual do caminho feliz

- **Objetivo:** Validar em ambiente local que a tela mostra avaliacao comportamental real ate `completed`.
- **Arquivos provaveis:** Nenhum.
- **Escopo permitido:** `npm run dev:full`, UI local, consulta segura ao banco/Redis.
- **Fora de escopo:** Alterar dados de pipeline, score, ranking ou matching.
- **Criterio de aceite:** Item aparece em `/analises-ia/comportamental`, status evolui, provider/modelo aparecem e fila `behavioral_ai` nao fica travada.
- **Validacao:** Health OK, worker ouvindo `behavioral_ai`, Redis sem loop agressivo, banco com timestamps coerentes.
- **Dependencias:** BA-8.4.
- **Risco:** Credencial IA local invalida pode impedir completed; nesse caso registrar resultado como falha controlada.

### BA-9.2 - Smoke test manual de erro seguro

- **Objetivo:** Validar visualmente um erro controlado, como credencial invalida, sem vazamento de dados.
- **Arquivos provaveis:** Nenhum.
- **Escopo permitido:** Simular erro controlado e restaurar configuracao local.
- **Fora de escopo:** Deixar credencial desabilitada ou alterar permissao permanentemente.
- **Criterio de aceite:** UI mostra codigo/mensagem segura, status `failed`, retry quando permitido e nenhum dado proibido.
- **Validacao:** Conferir tela, logs seguros e banco com `provider_error_type`.
- **Dependencias:** BA-9.1.
- **Risco:** Teste manual pode deixar dado de validacao no banco; registrar ids criados e restaurar credenciais.

### BA-9.3 - Design review operacional

- **Objetivo:** Revisar a tela contra o design brief para clareza, densidade, responsividade, acessibilidade e seguranca visual.
- **Arquivos provaveis:** `.design/behavioral-ai-queue/DESIGN_BRIEF.md`, pagina implementada, screenshots.
- **Escopo permitido:** Ajustes de UI/polimento dentro da tela.
- **Fora de escopo:** Redesenhar o sistema inteiro ou mudar a arquitetura aprovada.
- **Criterio de aceite:** Review confirma que a tela e operacional, segura, responsiva e nao parece tabela tecnica crua.
- **Validacao:** Rodar `/design-review` e corrigir achados relevantes.
- **Dependencias:** BA-9.1, BA-9.2.
- **Risco:** Sem review, a tela pode cumprir contrato tecnico mas falhar em scanabilidade operacional.
