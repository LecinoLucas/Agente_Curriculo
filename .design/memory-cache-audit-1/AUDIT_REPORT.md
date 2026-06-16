# AUDIT REPORT — Memória, Cache e Crescimento Infinito

**Fase:** MEMORY-CACHE-AUDIT-1
**Data:** 2026-06-16
**Escopo:** Auditoria read-only. Nenhuma correção aplicada, nenhuma migration criada, nenhum commit/push.
**Branch:** `save/behavioral-ai-and-wips`

---

## 0. Método

Investigação somente-leitura: grep + leitura direta de arquivos. Nenhum teste executado.
Nenhum dado alterado. Nenhum cache inspecionado em produção.

Arquivos principais analisados:

**Backend**
- `backend/src/infrastructure/queue/celery_app.py`
- `backend/src/interface/workers/analysis_tasks.py`
- `backend/src/interface/workers/resume_extraction_tasks.py`
- `backend/src/interface/workers/stale_analysis_cleanup_tasks.py`
- `backend/src/interface/api/routers/document_ai.py`
- `backend/src/interface/api/routers/public.py`
- `backend/src/interface/api/routers/pipeline.py`
- `backend/src/interface/api/routers/rh_dashboard.py`
- `backend/src/application/services/ai_usage_log_service.py`
- `backend/src/application/services/candidate_ranking_service.py`
- `backend/src/application/services/skill_equivalence_service.py`
- `backend/src/application/services/pipeline_service.py`
- `backend/src/application/services/system_health_service.py`
- `backend/src/infrastructure/cache/redis_client.py`
- `backend/src/interface/workers/matching_dispatcher.py`
- `backend/src/application/use_cases/auth/login.py`
- `backend/src/application/services/google_calendar_connection_service.py`

**Frontend**
- `frontend/src/features/pipeline/PipelineContext.tsx`
- `frontend/src/pages/PipelinePage.tsx`
- `frontend/src/features/candidates/drawer/components/BehavioralAIEvaluationPanel.tsx`
- `frontend/src/features/candidates/profile/components/CandidateProfileBehavioralAssessmentsTab.tsx`
- `frontend/src/shared/hooks/useExtractionPolling.ts`
- `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx`
- `frontend/src/features/candidates/drawer/hooks/useCandidateData.ts`

---

## 1. Resumo Executivo

A stack está em forma razoável: Redis usa TTLs, Celery tem `max_tasks_per_child=50`,
paginação está presente na maioria dos endpoints e o polling de frontend tem cleanup na maior
parte dos casos. Não foram encontrados vazamentos ativos óbvios de produção.

Os riscos identificados são de **crescimento latente**: alguns queries/serviços funcionam
perfeitamente com volume pequeno e tornam-se arriscados em escala (>500 análises, >100 vagas
publicadas, sessões longas de pipeline). As correções são pontuais e de baixo risco.

---

## 2. Achados Reais — Backend

### [CRITICAL] B-01 — `ai_usage_log_service._list_rows` sem limit

**Arquivo:** `backend/src/application/services/ai_usage_log_service.py:182-189`

```python
async def _list_rows(self, period: Period) -> list[AIUsageLogModel]:
    start = _period_start(period)
    result = await self._session.execute(
        sa.select(AIUsageLogModel)
        .where(AIUsageLogModel.created_at >= start)
        .order_by(AIUsageLogModel.created_at.desc())
    )
    return list(result.scalars().all())
```

`period` pode ser `"7d"` ou `"30d"`. Em produção com alto volume de análises IA, essa query
carrega **todos** os logs de IA dos últimos 30 dias em memória Python de uma vez. Não há
`.limit()`, cursor ou paginação. A resposta inteira sobe para a sessão SQLAlchemy → dict
Python → JSON. Endpoint chamado via `/admin/ai-usage`.

**Severidade:** CRITICAL
**Evidência:** Linha 188 — `sa.select(AIUsageLogModel).where(...).order_by(...)` sem `.limit()`.
**Hipótese de volume:** Com 50 análises/dia × 30 dias = 1.500 rows. Com 200/dia = 6.000 rows.
Cada row contém `raw_llm_response` redactado + metadados. Cresce linearmente.

---

### [HIGH] B-02 — `mark_stuck_analyses_as_failed` sem limit

**Arquivo:** `backend/src/interface/workers/analysis_tasks.py:1278-1341`

```python
processing_stuck = await session.execute(
    sa.select(AnalysisModel).where(...)
)
for analysis in processing_stuck.scalars().all():   # ← sem limit
    ...

pending_stuck = await session.execute(
    sa.select(AnalysisModel).where(...)
)
for analysis in pending_stuck.scalars().all():   # ← sem limit
    ...
```

Função chamada por `stale_analysis_cleanup_tasks` (beat schedule). Em produção com
backlog grande de análises presas, carrega todos em memória de uma só vez. Sem `.limit()`.

**Severidade:** HIGH
**Evidência:** Linhas 1290 e 1324 — `.scalars().all()` sem limit.
**Hipótese:** Durante pane do worker, centenas de análises ficam em `processing`. Na próxima
execução do beat task, todas entram em memória ao mesmo tempo.

---

### [HIGH] B-03 — `stale_analysis_cleanup_tasks` sem limit

**Arquivo:** `backend/src/interface/workers/stale_analysis_cleanup_tasks.py:46-53`

```python
result = await session.execute(
    sa.select(DocumentAIAnalysisModel).where(
        DocumentAIAnalysisModel.status == "processing",
        DocumentAIAnalysisModel.created_at < cutoff_time,
    )
)
stale_analyses = result.scalars().all()   # ← sem limit
```

Mesma classe de problema do B-02, mas para `DocumentAIAnalysisModel` (análise OCR/documentos
da pré-admissão).

**Severidade:** HIGH
**Evidência:** Linha 53.

---

### [HIGH] B-04 — `GET /document-ai/{document_id}/history` sem paginação

**Arquivo:** `backend/src/interface/api/routers/document_ai.py:105-118`

```python
rows = await db.execute(
    sa.select(DocumentAIAnalysisModel)
    .where(DocumentAIAnalysisModel.document_id == document_id)
    .order_by(DocumentAIAnalysisModel.created_at.desc())
)
analyses = rows.scalars().all()   # ← sem limit, retorna tudo
return [_to_response(item) for item in analyses]
```

Endpoint que retorna todo o histórico de análises de um documento. Para documentos com muitos
retries ou re-análises, retorna N registros sem paginação ou corte.

**Severidade:** HIGH
**Evidência:** Linha 117 — `.all()` sem `.limit()`.

---

### [MEDIUM] B-05 — `public.list_published_jobs` sem limit

**Arquivo:** `backend/src/interface/api/routers/public.py:60-78` e
`backend/src/infrastructure/repositories/sqlalchemy_job_repository.py:410-420`

```python
async def list_published(self) -> list[JobModel]:
    result = await self._session.execute(
        sa.select(JobModel)
        .where(JobModel.status == "published", JobModel.deleted_at.is_(None))
        .order_by(JobModel.title.asc())
    )
    return list(result.scalars().all())   # ← sem limit
```

Endpoint público (`GET /public/jobs`), sem autenticação, retorna todas as vagas publicadas
em um único array JSON. A resposta inclui o modelo completo `JobModel`. Com muitas vagas
publicadas simultaneamente, o array cresce sem limite.

**Severidade:** MEDIUM
**Evidência:** `sqlalchemy_job_repository.py:420` — `list_published` sem `.limit()`.
**Risco adicional:** Endpoint público sem paginação — qualquer crawler pode causar carga.

---

### [MEDIUM] B-06 — `SkillEquivalenceService` — estado de classe compartilhado

**Arquivo:** `backend/src/application/services/skill_equivalence_service.py:60-68`

```python
class SkillEquivalenceService:
    _db_cache_ttl_seconds = 300
    _db_cache_entry: tuple[float, dict, tuple] | None = None   # ← class-level
    _source_usage_totals: dict[str, int] = { ... }             # ← class-level
    _fallback_total = 0                                         # ← class-level
    _counter_lock = threading.Lock()                           # ← class-level
```

Variáveis de classe (não de instância) são compartilhadas entre **todas as instâncias** no
mesmo processo. Em FastAPI (single process async), isso significa que estado muda entre
requests diferentes. O `_db_cache_entry` armazena o catálogo inteiro de skills do banco com
TTL de 5 minutos. O `_counter_lock` é um `threading.Lock` em ambiente async — uso correto
para a seção crítica mas pode bloquear o event loop se a seção crescer.

**Severidade:** MEDIUM
**Evidência:** Linhas 60-68 — atributos de classe mutáveis.
**É FATO:** As variáveis são class-level. O catálogo inteiro de skills fica em memória por
5 minutos, crescendo com o catalog. **Hipótese:** Não deve causar problema hoje, mas em
catálogos com milhares de skills + relations o cache pode consumir dezenas de MB.

---

### [MEDIUM] B-07 — Celery: `worker_max_memory_per_child` não configurado

**Arquivo:** `backend/src/infrastructure/queue/celery_app.py:57`

```python
worker_max_tasks_per_child=50,  # ← configurado
# worker_max_memory_per_child  ← NÃO configurado
```

`worker_max_tasks_per_child=50` garante que o worker processo recicla após 50 tasks.
Isso limita crescimento de memória por volume de tasks. Porém, se **uma única task** vazar
memória (PDF grande, resposta IA grande retida, objeto não liberado), o worker pode estourar
**antes** de completar 50 tasks. `worker_max_memory_per_child` adicionaria um hard limit em
KB que reciclaria o processo independente de quantas tasks foram executadas.

**Severidade:** MEDIUM
**Evidência:** Ausência do parâmetro no `celery_app.conf.update`.

---

### [MEDIUM] B-08 — `ai_usage_log_service._list_ai_usage_rows` — potencial unbounded em 7d/30d

**Arquivo:** `backend/src/application/services/system_health_service.py:291-293`

```python
ai_rows = await self._list_ai_usage_rows(AIUsageQuery(date_from=since.date()))
provider_failures: dict[str, int] = defaultdict(int)
for row in ai_rows:   # iteração sobre lista completa sem limit
```

A query de health (`get_errors`) usa `date_from` = 24h atrás, mas carrega todos os rows
desse período em memória antes de filtrar. Bounded a 24h, mas ainda sem `.limit()`.

**Severidade:** LOW-MEDIUM (bounded a 24h de janela, mas sem limit explícito)

---

## 3. Achados Reais — Redis/Cache

### [LOW] R-01 — Celery result backend sem `result_expires` explícito

**Arquivo:** `backend/src/infrastructure/queue/celery_app.py`

`result_expires` não está configurado. O padrão do Celery com Redis backend é **24 horas**.
Os resultados das tasks são pequenos (`{"analysis_id": ..., "status": "completed"}`), mas o
acúmulo de resultados sem cleanup pode crescer com volume alto de tasks. Não é urgente com
o volume atual.

**Severidade:** LOW
**Evidência:** Ausência de `result_expires` no `celery_app.conf.update`.

---

### [LOW] R-02 — Rate limiter com fallback MemoryStorage em multi-worker

**Arquivo:** `backend/src/interface/api/rate_limiting.py:26-46`

```python
try:
    return RedisStorage(uri, implementation="redispy")
except Exception:
    logger.warning("rate_limit.redis_unavailable_falling_back_to_memory", ...)
    return MemoryStorage()
```

Se Redis estiver indisponível, o rate limiter cai para `MemoryStorage` (in-process). Em
deployment com múltiplos workers FastAPI (Gunicorn + N workers), cada processo teria seu
próprio contador. O rate limit seria efetivo por N× o configurado (N workers × limit).
**Hipótese:** Em produção single-worker ou Redis sempre disponível, isso não é problema.

**Severidade:** LOW

---

### [ACHADO POSITIVO] R-P1 — Todas as chaves Redis têm TTL

Todas as operações Redis encontradas usam TTL:
- `google_calendar_connection_service.py:93` → `ex=600`
- `matching_dispatcher.py:116-121` → `nx=True, ex=60`
- `login.py`, `refresh_token.py`, `staff_google_auth_service.py` → `setex` com TTL
- `candidate_portal_auth_service.py:355` → `setex` com TTL

**Nenhuma chave Redis sem TTL foi encontrada.** Risco de crescimento infinito de chaves não
confirmado.

---

## 4. Achados Reais — Frontend

### [HIGH] F-01 — `PipelineContext.tsx` — `matchingAttemptRef` sem evicção

**Arquivo:** `frontend/src/features/pipeline/PipelineContext.tsx:262`

```typescript
const matchingAttemptRef = useRef<Map<string, {
  status: "in_flight" | "completed" | "failed";
  error?: string
}>>(new Map());
```

Esse `Map` acumula uma entrada por tentativa de matching IA (`ensureAnalysisMatch`). Entradas
são `set()` com status `in_flight`, `completed` ou `failed`, mas **nunca são deletadas ou
limpas**. Em uma sessão longa com muitos candidatos analisados, o Map cresce indefinidamente
no processo do browser para o ciclo de vida do PipelineContext.

**Severidade:** HIGH
**Evidência:** Grep de `matchingAttemptRef` — nenhum `.delete()` ou `.clear()` encontrado.
**Hipótese de volume:** 50 candidatos por vaga × 10 vagas numa sessão = 500 entradas.

---

### [MEDIUM] F-02 — `PipelineContext.tsx` — `candidateCacheRef` sem limite de tamanho

**Arquivo:** `frontend/src/features/pipeline/PipelineContext.tsx:247`

```typescript
const candidateCacheRef = useRef<Map<string, CandidateOverview>>(new Map());
```

Cache de overviews de candidatos. Cada `CandidateOverview` contém análise completa, histórico
de pipeline, dados do candidato. O Map cresce conforme candidatos são abertos no drawer.
Há evicção pontual por `delete(candidateId)` durante movimentações de stage, mas sem limite
de tamanho (sem LRU, sem max entries). Em sessões longas navegando por muitos candidatos, o
objeto em memória cresce.

**Severidade:** MEDIUM
**Evidência:** `PipelineContext.tsx:247` — `useRef<Map<string, CandidateOverview>>`.
Sem `.clear()` total ou política LRU.

---

### [MEDIUM] F-03 — `BehavioralAIEvaluationPanel.tsx` — `window.setTimeout` não cancelado no unmount

**Arquivo:** `frontend/src/features/candidates/drawer/components/BehavioralAIEvaluationPanel.tsx:99-105`

```typescript
// Hard stop after 5 minutes — show informational message if still in-progress
window.setTimeout(() => {
  if (pollIntervalRef.current !== null) {
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;
    if (isMountedRef.current) setPollingTimedOut(true);
  }
}, 300_000);
```

O retorno de `window.setTimeout` não é armazenado em ref e portanto **não é cancelado**
quando o componente desmonta (cleanup effect nas linhas 31-39 limpa apenas o `pollIntervalRef`).
O timer de 5 minutos continua no event queue do browser. Quando dispara após unmount:
- `clearInterval(null)` → no-op
- `isMountedRef.current === false` → set state não é chamado

Funcionalmente seguro pós-unmount graças às guards, mas o timer em si **vaza** (permanece
ativo 5 minutos após o usuário fechar o drawer).

**Severidade:** MEDIUM (leak de timer, não de dado — sem consequência funcional confirmada)
**Evidência:** Linha 99 — `window.setTimeout` sem store em variável/ref.

---

### [LOW] F-04 — Múltiplos `useEffect` sem `AbortController`

Vários componentes do drawer carregam dados via `useEffect` sem cancel signal:
- `CandidateNotesTab.tsx:47`
- `CollaborationTab.tsx:48,52`
- `CandidateHiringDecisionPanel.tsx:130`
- `BehavioralAIEvaluationPanel.tsx:43-54`
- `AdmissionPackagePanel.tsx:60`

Se o drawer fechar enquanto a requisição está em voo, o componente desmonta mas a promise
continua e tenta chamar `setState` no objeto desmontado. No React 18, setState em componente
desmontado é **silenciamente ignorado** (sem crash, sem warning), mas a requisição de rede
não é abortada → continua consumindo conexão e memória até resolver.

**Comparação:** `useCandidateData.ts:84,146` **usa** AbortController corretamente.

**Severidade:** LOW (React 18 protege, mas requisições de rede não são abortadas)

---

### [LOW] F-05 — `PipelineContext.tsx` — `boardCacheRef` sem limite de tamanho

**Arquivo:** `frontend/src/features/pipeline/PipelineContext.tsx:242`

```typescript
const boardCacheRef = useRef<Map<string, JobPipelineBoard>>(new Map());
```

Cache de boards de pipeline. Chave = `jobId + filtros`. Cresce com N vagas × M combinações
de filtro. Há invalidação por `rankingSyncTick` mas não há max size. Cada board contém a
lista completa de candidatos (até 500 por `PIPELINE_BOARD_MAX_ROWS`).

**Severidade:** LOW (invalidação existe, mas sem teto de tamanho)

---

### [LOW] F-06 — `CandidateProfileBehavioralAssessmentsTab.tsx` — setTimeout imediato não cancelado

**Arquivo:** `frontend/src/features/candidates/profile/components/CandidateProfileBehavioralAssessmentsTab.tsx:130-138`

```typescript
window.setTimeout(() => {
  aiActionRef.current?.scrollIntoView(...);
  aiActionRef.current?.focus(...);
}, 0);   // ← não armazenado, não cancelado

setHighlightingAI(true);
const clearId = window.setTimeout(() => setHighlightingAI(false), 3000);
return () => window.clearTimeout(clearId);   // ← limpa o clearId mas não o timeout do scroll
```

O `setTimeout(..., 0)` para scroll não é cancelado no cleanup. É de delay 0ms, então na
prática já disparou antes do unmount em quase todos os casos. Risco mínimo.

**Severidade:** LOW

---

## 5. Hipóteses de Risco (não confirmadas por evidência direta)

| # | Hipótese | Base | Risco |
|---|----------|------|-------|
| H-01 | `SkillEquivalenceService._load_catalog` (lru_cache maxsize=1) pode manter catálogo JSON grande indefinidamente por processo FastAPI | Cache carregado ao primeiro request, nunca expirado | LOW-MEDIUM |
| H-02 | Celery workers processando PDFs grandes (>10MB) podem acumular memória residual antes de reciclar em 50 tasks | Leitura de `file.read_bytes()` sem streaming em `resume_extraction_tasks.py:246` | MEDIUM |
| H-03 | `matchingAttemptRef` em sessões longas com ranking de centenas de candidatos pode contribuir para latência perceptível de GC no browser | Mapa nunca limpo, grows linearly | MEDIUM |
| H-04 | `boardCacheRef` guardando 500 candidatos × N vagas × M filtros pode ultrapassar 50MB de heap JS em navegadores mais lentos | Sem max size | LOW |

---

## 6. O que NÃO foi alterado

- Nenhuma regra de negócio modificada
- Nenhuma tela alterada
- Nenhuma migration criada
- Nenhum cache removido
- Nenhum dado apagado
- Nenhuma query modificada
- Nenhum comportamento funcional modificado
- Nenhum teste executado durante esta auditoria
- Nenhum push/commit realizado

---

## 7. Inventário completo de severidades

| ID | Arquivo | Linha | Problema | Severidade |
|----|---------|-------|----------|------------|
| B-01 | `ai_usage_log_service.py` | 182-189 | `_list_rows` sem limit | **CRITICAL** |
| B-02 | `analysis_tasks.py` | 1278-1341 | `mark_stuck` sem limit | **HIGH** |
| B-03 | `stale_analysis_cleanup_tasks.py` | 46-53 | cleanup sem limit | **HIGH** |
| B-04 | `document_ai.py` | 105-118 | history endpoint sem paginação | **HIGH** |
| B-05 | `public.py` + `sqlalchemy_job_repository.py` | 60-78 / 410-420 | list_published sem limit | **MEDIUM** |
| B-06 | `skill_equivalence_service.py` | 60-68 | class-level mutable state | **MEDIUM** |
| B-07 | `celery_app.py` | — | `worker_max_memory_per_child` ausente | **MEDIUM** |
| B-08 | `system_health_service.py` | 291-293 | ai_rows sem limit | **LOW-MEDIUM** |
| R-01 | `celery_app.py` | — | `result_expires` ausente | **LOW** |
| R-02 | `rate_limiting.py` | 26-46 | MemoryStorage fallback | **LOW** |
| F-01 | `PipelineContext.tsx` | 262 | `matchingAttemptRef` sem evicção | **HIGH** |
| F-02 | `PipelineContext.tsx` | 247 | `candidateCacheRef` sem max size | **MEDIUM** |
| F-03 | `BehavioralAIEvaluationPanel.tsx` | 99-105 | setTimeout 5min não cancelado | **MEDIUM** |
| F-04 | Múltiplos drawer components | vários | useEffect sem AbortController | **LOW** |
| F-05 | `PipelineContext.tsx` | 242 | `boardCacheRef` sem max size | **LOW** |
| F-06 | `CandidateProfileBehavioralAssessmentsTab.tsx` | 130 | setTimeout scroll sem cancel | **LOW** |

---

## 8. Recomendação Inicial

1. Corrigir **B-01** primeiro — tem maior risco de OOM observável em produção com volume crescente de análises IA.
2. Corrigir **B-02** e **B-03** em paralelo — queries de cleanup com `.limit(batch_size)` e lógica de iteração em batches.
3. Corrigir **F-01** — adicionar `matchingAttemptRef.current.clear()` ou evicção LRU.
4. Adicionar **B-07** (`worker_max_memory_per_child`) como linha única no celery_app.
5. Adicionar paginação em **B-04** e **B-05** quando volume justificar.
6. Resolver **F-03** storing o timeout em ref e cancelando no cleanup.
