# AUDIT REPORT — Resume → Analysis Flow

**Fase:** RESUME-ANALYSIS-FLOW-AUDIT-1
**Data:** 2026-06-14
**Escopo:** auditoria de leitura. Nenhuma correção de produto aplicada, nenhuma migration criada, nenhum commit/push.
**Branch:** `save/behavioral-ai-and-wips`

---

## 0. Método

Investigação somente-leitura (grep + leitura de arquivos). Nenhum teste foi executado nesta
passagem para não acionar IA/quota nem depender do banco Docker. Os pontos de teste estão
listados na seção 6 como recomendação.

Arquivos analisados:

**Backend — workers**
- `backend/src/interface/workers/analysis_tasks.py` (task `process_analysis`)
- `backend/src/interface/workers/resume_extraction_tasks.py` (task `process_resume_extraction`)
- `backend/src/interface/workers/analysis_dispatcher.py` (`enqueue_analysis`)
- `backend/src/interface/workers/resume_extraction_dispatcher.py` (`enqueue_resume_extraction` + fallback inline)
- `backend/src/interface/workers/stale_analysis_cleanup_tasks.py`
- `backend/src/infrastructure/queue/celery_app.py` (rotas, annotations, beat_schedule)

**Backend — API**
- `backend/src/interface/api/routers/resumes.py` (upload → extração)
- `backend/src/interface/api/routers/analyses.py` (retry, bulk-retry, force-fail, status)
- `backend/src/interface/api/routers/jobs.py` (ranking, ranking/{candidate}, score-explanation, recalculate, smart-refresh)
- `backend/src/interface/api/routers/pipeline.py` / `candidaturas.py` (auto-dispatch callers)

**Backend — use cases / services**
- `backend/src/application/use_cases/analyses/request_analysis.py`
- `backend/src/application/services/analysis_dispatch_service.py`
- `backend/src/application/use_cases/smart_refresh_use_case.py`
- `backend/src/infrastructure/repositories/sqlalchemy_analysis_repository.py`

**Bootstrap**
- `backend/scripts/bootstrap_dev.py`, `bootstrap_dev_db.py`, `seed_ai_models.py`, `seed_dev_admin.py`, `reset_dev_db.sh`

**Frontend**
- `frontend/src/pages/CandidateProfilePage.tsx` (polling manual)
- `frontend/src/features/analyses/hooks/useAnalysesPage.ts` (polling lista)
- `frontend/src/features/candidates/drawer/hooks/useCandidateData.ts` (ranking 409)
- `frontend/src/services/jobsService.ts`, `scoreExplanationService.ts`

---

## 1. Mapa do fluxo atual

### 1.1 Upload do currículo
`POST /resumes/{resume_id}/upload` (`resumes.py:156`)
1. `ResumeService.upload_pdf` persiste a `ResumeVersion` com `extraction_status="pending"`, `extracted_text=NULL`.
2. `db.commit()`.
3. `enqueue_resume_extraction(version.id)` → fila **`extraction`**.
4. Resposta retorna `analysis_auto_requested=False`. **O upload NÃO dispara análise IA.**

### 1.2 Extração de texto
`process_resume_extraction` (`resume_extraction_tasks.py:36`), `max_retries=0`, fila `extraction`.
1. Claim atômico: `extraction_status pending|failed → processing` (`_claim_resume_version_for_processing`).
2. Lê o arquivo, valida PDF, `extract_pdf_text`.
3. **Sucesso:** grava `extracted_text`, `extraction_status="completed"`, aplica prefill no candidato.
   Depois seleciona análises pendentes com:
   `status IN (waiting_extraction, pending) AND job_id IS NOT NULL AND task_id IS NULL`
   → marca cada uma `status="pending"`, `task_id="analysis:{id}"`, e chama `enqueue_analysis(id)`
   (`resume_extraction_tasks.py:263-305`). **É AQUI que a análise é enfileirada — não no upload.**
4. **Falha:** `_mark_resume_version_failed` → `extraction_status="failed"` e marca análises
   `status IN (waiting_extraction, pending) AND task_id IS NULL` como `status="failed"`
   (`resume_extraction_tasks.py:87-104`).

### 1.3 Criação da análise
Dois gatilhos:

- **Auto (pipeline/candidatura):** `CandidateJobAnalysisDispatcher.request_auto_analysis`
  (`analysis_dispatch_service.py:211`) chamado de `pipeline.py:300/427/456/485` e `candidaturas.py:121`.
  Usa `AnalysisRequestPolicy.decide` + `RequestAnalysisUseCase`.
- **Manual (perfil ativo):** via `analysisService` no frontend → endpoints de `analyses.py`.

`RequestAnalysisUseCase.execute` (`request_analysis.py:165`):
- Calcula `extraction_ready` por `_resume_analysis_readiness` (formato suportado + `extraction_status=="completed"` + texto útil).
- Cria `AnalysisModel` com `status = "pending" if extraction_ready else "waiting_extraction"` (`:357`).
- Se `extraction_ready` → `enqueue_required=True`.
- Se **não** pronto e `allow_pending_resume_extraction=True` → `enqueue_required=False`, retorna
  `status="waiting_extraction"` **sem enfileirar** (`:418-426`). A análise fica dormindo até a extração acordá-la (1.2.3).

### 1.4 Processamento IA
`process_analysis` (`analysis_tasks.py:288`), `max_retries=MAX_ANALYSIS_RETRIES`, fila `analysis`, rate_limit `10/m`.
1. Claim atômico (`_claim_analysis_for_processing`). Se já terminal → retorna sem fazer nada.
2. Join Analysis × ResumeVersion × PromptTemplate × AIModel.
3. **GUARD DE TEXTO** (`analysis_tasks.py:503-526`): se `extracted_text` vazio / só espaço / placeholder →
   volta `status="waiting_extraction"`, limpa claim, audita `analysis_waiting_for_extraction`, **retorna ANTES de
   qualquer chamada ao provider e ANTES do audit `ai_analysis_started`.** Nenhum custo, nenhum incremento de
   tentativa, nenhum provider_health.
4. Só com texto válido emite `ai_analysis_started` e chama o provider.
5. Em erro **temporário** (ex.: rate-limit/quota classificada como temporária): `self.retry` com countdown,
   até `MAX_ANALYSIS_RETRIES`; estado `retry_scheduled`. Esgotado → `failed`.
6. Em erro **definitivo**: `failed` imediato.

### 1.5 Retry manual
`POST /analyses/{id}/retry` (`analyses.py:634`):
- Aceita `status IN {failed, cancelled, waiting_extraction}` (`:656`).
- Guard `_is_rate_limited_analysis_blocked` (só bloqueia `retry_scheduled` + `rate_limited` + `next_retry_at` futuro).
- Reseta `status="pending"`, **`retry_count=0`, `attempts=0`**, `provider_error_type=None`, etc. (`:670-679`) e `enqueue_analysis`.
- **NÃO seta `task_id` na linha do banco.**

### 1.6 Bulk retry
`POST /analyses/bulk-retry` (`analyses.py:573`):
- Aceita `status IN {failed, waiting_extraction}` (`:593`). Mesmo reset (`retry_count=0`, `attempts=0`) + `enqueue_analysis`.

### 1.7 Smart refresh
`SmartRefreshUseCase` (`smart_refresh_use_case.py`):
- `_classify`: `waiting_extraction` ∈ `_PROCESSING_STATUSES` → categoria `skipped_already_processing` (**não reprocessa**).
- `failed`/`cancelled` → `ai_analysis` (`failed_analysis_retry`) → `request_auto_analysis(trigger_source="smart_refresh")`,
  que cria **nova** análise e chama IA. `provider_calls_now=0` no momento, mas enfileira chamadas reais.

### 1.8 Ranking / Score
- `GET /jobs/{job}/ranking` e `/ranking/{candidate}`: usam dados persistidos, **nunca chamam IA**.
- `/ranking/{candidate}` lança **409** `candidate_score_not_ready` (estruturado) quando o candidato
  ainda não tem score (`jobs.py:1549-1557`).
- `/recalculate-ranking` e `recompute_job_matches_task`: recomputam sobre dados persistidos, **0 tokens**.
- `GET /score-explanation`: leitura.

---

## 2. Estados envolvidos (AnalysisModel.status)

| Estado | Origem | Avança para |
|---|---|---|
| `waiting_extraction` | criação sem texto pronto; ou guard do worker (1.4.3) | `pending` (extração concluída); `failed` (extração falhou, se `task_id IS NULL`); `pending` (retry manual/bulk) |
| `pending` | criação com texto pronto; extração concluída; retry/bulk; stale-requeue | `processing` (claim) |
| `processing` | claim do worker | `completed` / `failed` / `retry_scheduled`; ou `waiting_extraction` (guard) |
| `retry_scheduled` | erro temporário no provider | `processing` (retry); `failed` (esgotou) |
| `completed` | sucesso | terminal (reanálise só com `force_reanalyze`) |
| `failed` | erro definitivo, retries esgotados, falha de extração, force-fail, enqueue falho | terminal até retry manual/bulk/smart_refresh |
| `cancelled` | cancelamento | retryável |
| `discarded` | descarte | terminal |

`_PROCESSING_STATUSES` (smart_refresh) = `{pending, processing, retry_scheduled, waiting_extraction}`.
`find_active_for_version` (idempotência) inclui `waiting_extraction` (repo `:150/:196`).

---

## 3. Tabela de riscos

| # | Ponto do código | Risco | Evidência | Consequência | Correção recomendada |
|---|---|---|---|---|---|
| R1 | `analyses.py:656` (retry) e `:593` (bulk-retry) aceitam `waiting_extraction` e fazem `→pending` + `enqueue_analysis` | Retry de "análise IA" usado para um estado que é de **extração**. Coloca a análise na fila de IA enquanto a extração ainda pode estar rodando | Ambos resetam e chamam `enqueue_analysis` direto | Churn: worker reclama, cai no guard e devolve para `waiting_extraction`. Não chama IA (graças ao guard), mas gera fila/log/claims redundantes e **mascara** que o que precisa de retry é a *extração*, não a IA | Separar retry de extração × retry de IA. Para `waiting_extraction`, reenfileirar **extração** (`enqueue_resume_extraction`) em vez de `process_analysis`; ou rejeitar com mensagem "aguarde a extração" |
| R2 | `analyses.py:670-679` / `:600-609` resetam `retry_count=0` e `attempts=0` | Cada retry manual/bulk zera o orçamento de tentativas | Campos reset explicitamente | Em falha por **quota/rate-limit já marcada `failed`**, novo retry recomeça do zero e **chama IA de novo** → reabre 3 novas tentativas no provider | Não permitir reset de quota: tratar `failed` por `rate_limited` como bloqueado por janela (estender `_is_rate_limited_analysis_blocked` para cobrir `failed` recente com `provider_error_type=rate_limited`) |
| R3 | `_is_rate_limited_analysis_blocked` (`analyses.py`) só cobre `status=="retry_scheduled"` | Guard de rate-limit **não cobre `failed`** | `if analysis.status != "retry_scheduled": return False` | Retry/bulk de uma análise `failed` por quota não é bloqueado → re-queima quota | Incluir `failed` com `provider_error_type=="rate_limited"` e `next_retry_at`/janela ainda ativa |
| R4 | `smart_refresh_use_case.py:112` classifica `failed`/`cancelled` como `ai_analysis` sem checar motivo | Smart refresh reenfileira **todas** as falhas, inclusive as por quota | `_FAILED_STATUSES` → `ai_analysis` | Acionar smart refresh repetidamente num job com falhas por quota re-dispara IA em lote → estoura limite de novo | Excluir/segregar falhas `rate_limited` recentes do grupo de re-dispatch, ou respeitar janela de cooldown |
| R5 | `resume_extraction_tasks.py:263-285` re-enfileira só análises com `task_id IS NULL` | Se uma análise `waiting_extraction` ganhar `task_id` antes da extração concluir, a extração **não a acorda** | Filtro `AnalysisModel.task_id.is_(None)` | Análise pode ficar presa em `waiting_extraction` para sempre (ninguém a reenfileira). Hoje o retry manual **não** seta `task_id` (mitiga), mas `dispatch_service._enqueue_analysis:531` e a própria extração setam `task_id` — qualquer fluxo futuro que sete `task_id` em `waiting_extraction` cria o presilho | Reenfileirar por `status`, não por `task_id`; ou garantir limpeza de `task_id` ao voltar para `waiting_extraction` (o guard do worker em `:507-511` já limpa `worker_claim_id` mas **não** `task_id`) |
| R6 | `analysis_tasks.py:507-511` (guard) limpa `worker_claim_id/claimed_at/stale_at` mas **não** `task_id` | Inconsistência com R5 | Não há `analysis.task_id = None` no bloco | Reforça R5: análise volta a `waiting_extraction` mantendo `task_id` preenchido (quando veio de fluxo que setou) | Limpar `task_id` ao devolver para `waiting_extraction` |
| R7 | `bootstrap_dev_db.py` (legacy) só roda `seed_ai_models` | Falta seed do prompt `full_analysis` | `seed_minimal_dev_data` chama só `seed_ai_models` | Em DB Docker limpo bootstrapeado pelo script **legacy**, `find_preferred_prompt_template("full_analysis")` lança `ValidationException("Nenhum template ativo para tipo 'full_analysis'")` → criação de análise falha | Usar sempre `bootstrap_dev.py` (que roda `seed_dev_admin`, o que de fato insere o prompt). Ver seção 7 |
| R8 | `analyses.py` retry não reusa `RequestAnalysisUseCase` / `dispatch_service` | Dois caminhos de "reprocessar" com regras diferentes (um valida prontidão de extração, o outro não) | Retry manipula `AnalysisModel` direto | Inconsistência de regras de readiness entre auto-dispatch e retry manual | Centralizar a decisão de readiness (extração vs IA) num único serviço |

---

## 4. Causa raiz provável

**A IA NÃO está sendo chamada sem texto.** O worker tem um guard explícito
(`analysis_tasks.py:503-526`) que devolve a análise para `waiting_extraction` **antes** de qualquer
chamada ao provider e antes mesmo do audit `ai_analysis_started`. O `RuntimeError("Resume text
vazio…")` antigo foi substituído por esse guard. Confirmado: nenhum caminho chama o provider com
`extracted_text` vazio.

**A causa do "loop até bater limite/quota" é amplificação por re-dispatch, não loop automático:**

1. Uma análise falha por **quota/rate-limit**. Após `MAX_ANALYSIS_RETRIES` no Celery, vira `failed`.
2. O guard `_is_rate_limited_analysis_blocked` **só** protege `retry_scheduled`, não `failed` (R3).
3. Qualquer re-disparo — **retry manual** (R1/R2), **bulk-retry** (R2), ou **smart refresh** (R4) —
   reseta `retry_count=0`/`attempts=0` e chama IA de novo, reabrindo mais 3 tentativas no provider.
4. Repetir essa ação (ou o operador insistindo no botão / smart refresh em lote) **re-queima a quota**.
   Não há cooldown que sobreviva à transição para `failed`.

**Sobre `waiting_extraction` virando "retry de IA" (R1):** retry/bulk aceitam `waiting_extraction` e o
empurram para a fila de **IA**. O guard impede a chamada do provider, então isso é **churn**, não
queima de quota — mas é semanticamente errado: o que precisava de retry era a **extração**. Isso
explica a sensação de "ficou chamando IA/reprocessamento": a análise oscila `waiting_extraction →
pending → (worker) → waiting_extraction` sem progredir, gerando logs de reprocessamento.

**Não há loop automático no backend:** o `beat_schedule` (`celery_app.py:123`) só tem
`behavioral-ai-stuck-detection`. Não existe celery beat reprocessando análises. `stale_analysis_cleanup_tasks`
opera sobre `DocumentAIAnalysisModel` (OCR), **não** sobre `AnalysisModel`. O frontend **não** re-tenta
automaticamente (ver seção 7). Logo, toda re-queima de quota é disparada por ação do usuário (botão
retry/bulk/smart refresh) sem cooldown que sobreviva ao estado `failed`.

---

## 5. Plano de correção proposto (máx. 2 fases)

### Fase A — Backend: guard/retry seguro
1. **Separar retry de extração × retry de IA (R1):** no endpoint de retry/bulk, se `status ==
   waiting_extraction`, reenfileirar **extração** (`enqueue_resume_extraction` da versão correspondente)
   em vez de `process_analysis`; ou retornar 409 "aguarde a extração". Nunca mandar `waiting_extraction`
   para a fila de IA.
2. **Cooldown que sobrevive a `failed` (R2/R3/R4):** estender `_is_rate_limited_analysis_blocked` (ou
   criar um helper único) para bloquear retry/bulk/smart-refresh quando a última falha foi
   `rate_limited` dentro da janela de cooldown, independente de ser `retry_scheduled` ou `failed`.
   Aplicar o mesmo guard no `request_auto_analysis`/smart refresh.
3. **Higiene de `task_id`/reenfileiramento (R5/R6):** o worker, ao devolver para `waiting_extraction`,
   deve limpar `task_id`; e/ou a extração deve reenfileirar por `status` em vez de `task_id IS NULL`.
4. (Opcional) Centralizar readiness num serviço único reutilizado por auto-dispatch e retry (R8).

### Fase B — Frontend / ranking pending state
1. Garantir que a tela de perfil/standalone (`CandidateProfileScoreTab`/`CandidateProfilePage`) trate
   o **409 `candidate_score_not_ready`** como estado esperado "aguardando", igual ao drawer já faz
   (`useCandidateData.ts:160`). Verificar se a página de perfil "cheia" usa o mesmo path tolerante.
2. Diferenciar visualmente `waiting_extraction` ("aguardando extração") de retry de IA, para o operador
   não apertar "retry IA" quando o que falta é extração.
3. Garantir backoff/cooldown visível quando a falha for por quota (não oferecer botão de retry imediato
   que apenas re-queima quota).

---

## 6. Testes a criar

1. **Worker não chama IA sem texto:** `_process_analysis_with_session` com `extracted_text` vazio →
   retorna `waiting_extraction`, **sem** audit `ai_analysis_started` e sem chamada ao provider (mock do provider asserir 0 chamadas).
2. **Retry manual em `waiting_extraction` não chama IA:** após retry, garantir que não há chamada ao
   provider; idealmente que reenfileira **extração**, não `process_analysis`.
3. **Bulk-retry não chama IA em `waiting_extraction`:** análogo, em lote.
4. **Extração concluída libera análise uma única vez:** `process_resume_extraction` move
   `waiting_extraction→pending` e enfileira exatamente 1 vez; reexecução não duplica (claim dedup).
5. **Cooldown de quota sobrevive a `failed`:** análise `failed` com `provider_error_type=rate_limited`
   dentro da janela → retry/bulk/smart-refresh **bloqueados** (sem nova chamada ao provider).
6. **Ranking pendente não quebra perfil:** 409 `candidate_score_not_ready` → UI mostra estado
   "aguardando", sem erro; cobrir tanto drawer quanto página de perfil standalone.
7. **Fluxo Docker limpo, novo candidato, não entra em loop:** upload → extração → 1 análise → 1 chamada
   IA; sem re-dispatch automático.
8. **Bootstrap limpo seeda prompt `full_analysis`:** garantir que o caminho de bootstrap oficial deixa
   um `prompt_templates` ativo `template_type=full_analysis` (senão criação de análise falha).

---

## 7. Confirmações explícitas

1. **`waiting_extraction` é hoje tratado como retry de IA?**
   **PARCIALMENTE SIM (bug semântico).** `POST /analyses/{id}/retry` (`analyses.py:656`) e
   `POST /analyses/bulk-retry` (`:593`) aceitam `waiting_extraction` e enfileiram `process_analysis`
   (fila de IA). O guard do worker impede a chamada real do provider, então é churn, não queima de
   quota. `smart_refresh` **não** reprocessa `waiting_extraction` (classifica como
   `skipped_already_processing`).

2. **Existe retry automático em celery beat / smart refresh?**
   **NÃO automático.** `beat_schedule` só tem `behavioral-ai-stuck-detection` (`celery_app.py:123-128`).
   `stale_analysis_cleanup_tasks` atua em `DocumentAIAnalysisModel` (OCR), não em `AnalysisModel`.
   `smart_refresh` é **acionado por usuário** (preview + modal); quando acionado, **re-dispara IA**
   para `failed`/`cancelled` sem cooldown de quota (R4).

3. **O provider IA pode ser chamado sem texto?**
   **NÃO.** Guard em `analysis_tasks.py:503-526` devolve `waiting_extraction` antes de qualquer chamada
   e antes do audit `ai_analysis_started`. Sem custo, sem incremento de tentativa, sem provider_health.

4. **O frontend dispara retry ou só consulta status?**
   **Só consulta status.** `CandidateProfilePage` (`:441`) faz polling de `analysisService.status` a cada
   5s (máx. 12 tentativas) e recarrega o workspace; **não** chama retry. `useAnalysesPage` (`:283`) faz
   polling da **lista** a cada 4s; não dispara retry. Retry/bulk/smart-refresh são sempre ações
   explícitas do operador.

5. **O 409 de ranking é esperado ou bug?**
   **Esperado (by design).** `/ranking/{candidate}` retorna 409 estruturado `candidate_score_not_ready`
   (`jobs.py:1549-1557`) quando o score ainda não existe. O drawer trata isso como estado "aguardando"
   sem erro (`useCandidateData.ts:160-163`). **Recomendação:** confirmar que a página de perfil
   standalone (`CandidateProfileScoreTab`) usa o mesmo tratamento tolerante (não auditado em
   profundidade nesta fase).

---

## Resumo executivo

- **Arquivos analisados:** ~25 (workers, routers, use cases, services, bootstrap, frontend) — listados na seção 0.
- **Achados principais:** o worker **não** chama IA sem texto (guard OK). O problema real é
  **amplificação por re-dispatch**: o cooldown de rate-limit só cobre `retry_scheduled`, não `failed`
  (R3); retry/bulk zeram `retry_count`/`attempts` (R2); smart refresh reenfileira todas as falhas (R4).
  Some-se a isso o **bug semântico** de `waiting_extraction` ser aceito pela fila de IA em vez da fila
  de extração (R1), gerando churn e a impressão de "reprocessamento sem fim".
- **Causa raiz:** ausência de cooldown que sobreviva ao estado `failed` por quota + confusão entre
  "retry de extração" e "retry de IA". Nenhum loop automático no backend; toda re-queima é disparada
  por ação do operador.
- **Proposta:** Fase A (backend) — separar retry de extração × IA, cooldown de quota que cobre `failed`,
  higiene de `task_id`. Fase B (frontend) — tratar 409 ranking como estado esperado em todas as telas e
  não oferecer retry que apenas re-queima quota.
- **Próximo passo:** aprovar Fase A/B antes de qualquer alteração. Nenhuma mudança aplicada nesta fase.
