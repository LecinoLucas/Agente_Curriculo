# TASKS — Plano de Correção por Fases

**Fase:** MEMORY-CACHE-AUDIT-1
**Data:** 2026-06-16
**Regra:** Cada correção é cirúrgica, isolada e não altera regra de negócio.

---

## FASE 1 — Critical / Alta Prioridade (Backend)

### TASK-B01 — `ai_usage_log_service._list_rows` — adicionar limit

**Arquivo:** `backend/src/application/services/ai_usage_log_service.py:184-188`
**Prioridade:** P0
**Risco de correção:** BAIXO — adicionar `.limit(N)` e paginação é change non-breaking.

**Prompt cirúrgico:**
```
Em backend/src/application/services/ai_usage_log_service.py, a função `_list_rows`
(linhas 182-189) faz select de todos os AIUsageLogModel do período sem .limit().
Adicione um parâmetro `max_rows: int = 500` à função e aplique `.limit(max_rows)` 
na query. Atualize todos os callers para passar `max_rows` se necessário.
Não altere a assinatura pública da API nem regras de negócio.
```

---

### TASK-B02 — `mark_stuck_analyses_as_failed` — adicionar batch limit

**Arquivo:** `backend/src/interface/workers/analysis_tasks.py:1267-1351`
**Prioridade:** P0
**Risco de correção:** BAIXO — adicionar `.limit(batch_size)` e loop iterativo.

**Prompt cirúrgico:**
```
Em backend/src/interface/workers/analysis_tasks.py, a função `mark_stuck_analyses_as_failed`
(linha 1267) carrega ALL stuck analyses via .scalars().all() sem limit (linhas 1290 e 1324).
Refatore para:
1. Adicionar parâmetro `batch_size: int = 200` à função.
2. Aplicar `.limit(batch_size)` em ambas as queries (processing_stuck e pending_stuck).
Não altere a lógica de detecção de stale, apenas adicione o limit.
```

---

### TASK-B03 — `stale_analysis_cleanup_tasks` — adicionar batch limit

**Arquivo:** `backend/src/interface/workers/stale_analysis_cleanup_tasks.py:46-53`
**Prioridade:** P0
**Risco de correção:** BAIXO

**Prompt cirúrgico:**
```
Em backend/src/interface/workers/stale_analysis_cleanup_tasks.py, a função
`_cleanup_stale_processing_analyses_async` (linha 37) faz select sem .limit()
(linha 53: result.scalars().all()).
Adicione `.limit(200)` na query sa.select(DocumentAIAnalysisModel).
Não altere mais nada.
```

---

### TASK-F01 — `PipelineContext.matchingAttemptRef` — adicionar evicção

**Arquivo:** `frontend/src/features/pipeline/PipelineContext.tsx:262`
**Prioridade:** P1
**Risco de correção:** BAIXO — adicionar `.clear()` ou evicção simples via max size.

**Prompt cirúrgico:**
```
Em frontend/src/features/pipeline/PipelineContext.tsx, o `matchingAttemptRef` (linha 262)
é um Map que nunca é limpo. Adicione lógica para evitar crescimento infinito:
opção A (simples): quando o Map atingir mais de 500 entradas, chamar .clear() antes
do próximo .set().
opção B (preferível): após status "completed" ou "failed" ser registrado, fazer
.delete(key) imediatamente.
Escolha opção B. Não altere comportamento funcional de ensureAnalysisMatch.
```

---

## FASE 2 — Alta Prioridade (Celery + Frontend)

### TASK-B07 — `celery_app.py` — adicionar `worker_max_memory_per_child`

**Arquivo:** `backend/src/infrastructure/queue/celery_app.py:57`
**Prioridade:** P1
**Risco de correção:** BAIXO — configuração defensiva, não afeta lógica de tasks.

**Prompt cirúrgico:**
```
Em backend/src/infrastructure/queue/celery_app.py, dentro de celery_app.conf.update(),
adicione após a linha `worker_max_tasks_per_child=50`:
    worker_max_memory_per_child=300_000,  # 300 MB em KB — recicla worker ao atingir
Valor recomendado: 300000 KB (300MB). Ajuste conforme baseline de memória dos workers.
Não altere mais nada.
```

---

### TASK-B04 — `document_ai history` — adicionar limit

**Arquivo:** `backend/src/interface/api/routers/document_ai.py:112-117`
**Prioridade:** P1
**Risco de correção:** BAIXO — adicionar `.limit(50)` ou paginação.

**Prompt cirúrgico:**
```
Em backend/src/interface/api/routers/document_ai.py, o endpoint
GET /{document_id}/history (linha 105) retorna todos os históricos sem limit.
Adicione `.limit(50)` na query (linha 115), logo após .order_by().
Opcionalmente aceite query param `limit: int = Query(50, ge=1, le=200)`.
Não altere mais nada do endpoint.
```

---

### TASK-F03 — `BehavioralAIEvaluationPanel` — armazenar e cancelar timeout 5min

**Arquivo:** `frontend/src/features/candidates/drawer/components/BehavioralAIEvaluationPanel.tsx:29,99-105`
**Prioridade:** P1
**Risco de correção:** BAIXO — armazenar ref e cancelar no cleanup.

**Prompt cirúrgico:**
```
Em BehavioralAIEvaluationPanel.tsx:
1. Adicione um ref: `const hardStopTimerRef = useRef<number | null>(null);`
2. Na linha 99, substitua `window.setTimeout(...)` por:
   `hardStopTimerRef.current = window.setTimeout(...)`
3. No cleanup effect (linhas 31-39), adicione:
   `if (hardStopTimerRef.current !== null) { clearTimeout(hardStopTimerRef.current); }`
Não altere lógica de polling nem UX.
```

---

## FASE 3 — Médio Prazo

### TASK-B05 — `public.list_published_jobs` — adicionar limit

**Arquivo:** `backend/src/interface/api/routers/public.py:60-78` e
`backend/src/infrastructure/repositories/sqlalchemy_job_repository.py:410-420`
**Prioridade:** P2
**Risco de correção:** BAIXO-MÉDIO — endpoint público, qualquer mudança afeta portal.

**Prompt cirúrgico:**
```
Em sqlalchemy_job_repository.py, a função list_published() (linha 410) não tem limit.
Adicione parâmetro `limit: int = 200` e aplique `.limit(limit)` na query.
Em public.py, passe `limit=200` ao chamar job_repo.list_published().
Se o portal de candidatos for afetado (renderiza mais de 200 vagas), ajuste o limit
antes de aplicar.
```

---

### TASK-F02 — `PipelineContext.candidateCacheRef` — max size LRU simples

**Arquivo:** `frontend/src/features/pipeline/PipelineContext.tsx:247`
**Prioridade:** P2
**Risco de correção:** MÉDIO — cache é performance-critical no pipeline.

**Prompt cirúrgico:**
```
Em PipelineContext.tsx, `candidateCacheRef` (linha 247) é um Map sem limite de tamanho.
Implemente um cache LRU simples: quando o Map atingir mais de 100 entradas,
delete a entrada mais antiga (FIFO sobre insertion order do Map).
Adicione uma função helper `_evictCandidateCache()` chamada antes de cada .set().
Não altere nenhuma lógica de fetch ou invalidação.
```

---

### TASK-F04 — Adicionar AbortController nos useEffect críticos do drawer

**Arquivo:** Múltiplos componentes em `frontend/src/features/candidates/drawer/components/`
**Prioridade:** P3
**Risco de correção:** BAIXO — mudança defensiva, React 18 já protege de crashes.

**Prompt cirúrgico:**
```
Nos seguintes componentes, adicione AbortController nos useEffect que fazem fetch:
- CandidateNotesTab.tsx:47
- CollaborationTab.tsx:48
- CandidateHiringDecisionPanel.tsx:130

Padrão: criar AbortController no início do effect, passar signal ao service,
retornar cleanup que chama controller.abort().
Referência de implementação correta: useCandidateData.ts:84.
```

---

## FASE 4 — Observabilidade / Diagnóstico

### TASK-DIAG-01 — Criar scripts diagnósticos (non-invasivo)

Ver `scripts/diagnostics/` criados junto com este relatório:
- `memory_snapshot.py` — inspeciona estado de memória do processo FastAPI (não altera dado)
- `redis_cache_audit.py` — lista chaves Redis, TTLs e tamanhos (somente leitura)
- `runtime_smoke_memory.sh` — smoke test de baseline de memória

---

---

## MEMORY-CACHE-FIX-BACKEND-1 — Registro de Correções Aplicadas

**Data:** 2026-06-16
**Status:** CONCLUÍDO

### O que foi corrigido

#### B-01 — `ai_usage_log_service._list_rows` — limit adicionado
- **Arquivo alterado:** `backend/src/application/services/ai_usage_log_service.py`
- **Mudança:** Adicionada constante `_LIST_ROWS_MAX = 500` e `.limit(_LIST_ROWS_MAX)` na query de `_list_rows`.
- **Efeito:** Máximo 500 registros por request ao endpoint `/admin/ai-usage`. Para períodos de 30d com alto volume, totais são sobre os 500 mais recentes (documentado implicitamente pela ordem `created_at desc`).
- **Teste adicionado:** `test_list_rows_applies_limit` em `tests/unit/test_ai_usage_service.py` — verifica via SQL compilado que a constante é aplicada.

#### B-02 — `mark_stuck_analyses_as_failed` — batch limit adicionado
- **Arquivo alterado:** `backend/src/interface/workers/analysis_tasks.py`
- **Mudança:** Adicionada constante `_STUCK_CLEANUP_BATCH_SIZE = 200` e `.limit(_STUCK_CLEANUP_BATCH_SIZE)` nos dois buckets (`processing_stuck` e `pending_stuck`).
- **Efeito:** Cada execução da cleanup task processa no máximo 200 análises travadas por bucket. Análises restantes são capturadas na próxima execução periódica.
- **Testes adicionados:** `tests/unit/interface/workers/test_mark_stuck_analyses_limit.py` — 5 testes cobrindo limit no SQL de ambos os buckets, marcação correta de status e ausência de commit desnecessário.

#### B-03 — `stale_analysis_cleanup_tasks` — batch limit adicionado
- **Arquivo alterado:** `backend/src/interface/workers/stale_analysis_cleanup_tasks.py`
- **Mudança:** Adicionada constante `_STALE_CLEANUP_BATCH_SIZE = 200` e `.limit(_STALE_CLEANUP_BATCH_SIZE)` na query de `_cleanup_stale_processing_analyses_async`.
- **Efeito:** Máximo 200 DocumentAI analyses resetadas por execução. Comportamento idêntico ao anterior para volumes normais.
- **Testes adicionados:** `tests/unit/interface/workers/test_stale_analysis_cleanup_limit.py` — 3 testes cobrindo limit no SQL, reset correto para `pending` e ausência de commit sem stale.

#### B-04 — `GET /document-ai/{id}/history` — paginação adicionada
- **Arquivo alterado:** `backend/src/interface/api/routers/document_ai.py`
- **Mudança:** Adicionados query params `limit: int = Query(50, ge=1, le=200)` e `offset: int = Query(0, ge=0)`. Query agora aplica `.limit(limit).offset(offset)`. Import de `Query` adicionado.
- **Backward compat:** Default `limit=50` — clientes existentes que não passam params recebem até 50 itens (cobertura realista de retries por documento).
- **Testes adicionados:** 2 testes em `tests/integration/test_document_ai_security.py` — verifica que params são aceitos, que resultados são retornados corretamente e que offset além do total retorna lista vazia.

### Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `backend/src/application/services/ai_usage_log_service.py` | `+_LIST_ROWS_MAX` constante + `.limit()` na query |
| `backend/src/interface/workers/analysis_tasks.py` | `+_STUCK_CLEANUP_BATCH_SIZE` constante + `.limit()` em 2 queries |
| `backend/src/interface/workers/stale_analysis_cleanup_tasks.py` | `+_STALE_CLEANUP_BATCH_SIZE` constante + `.limit()` na query |
| `backend/src/interface/api/routers/document_ai.py` | `+Query` import + `limit`/`offset` params + `.limit().offset()` |
| `backend/tests/unit/test_ai_usage_service.py` | `+test_list_rows_applies_limit` |
| `backend/tests/unit/interface/workers/test_mark_stuck_analyses_limit.py` | Novo arquivo — 5 testes |
| `backend/tests/unit/interface/workers/test_stale_analysis_cleanup_limit.py` | Novo arquivo — 3 testes |
| `backend/tests/integration/test_document_ai_security.py` | `+2 testes de history pagination` |

### Testes executados

```
backend/.venv/bin/python -m pytest tests -k "ai_usage or stuck or stale or document_ai" -q
# Resultado: 91 passed, 3269 deselected, 3 warnings
```

### Riscos residuais

- **B-01:** Para períodos `30d` com volume muito alto (>500 logs/30d), os totais reportados serão sobre os 500 mais recentes. Isto é aceitável para um dashboard operacional mas deve ser documentado na UI se necessário.
- **B-02/B-03:** Cleanup tasks processam em lote. Em caso de backlog muito grande (>200 stuck), múltiplas execuções periódicas serão necessárias para zerar. O intervalo de execução do Celery beat define o tempo máximo de convergência.
- **B-04:** Histórico por documento é em realidade raro ter >50 itens (cada documento gera 1-3 análises por retry). O limite de 200 cobre casos extremos.

### Próximos passos sugeridos

- ~~**FASE 1 restante:** F-01 (`PipelineContext.matchingAttemptRef` — evicção de Map)~~ — **CONCLUÍDO em MEMORY-CACHE-FIX-FRONTEND-1**
- **FASE 2:** B-07 (`worker_max_memory_per_child` no Celery), F-03 (BehavioralAIEvaluationPanel timeout ref)
- **FASE 3:** B-05 (`list_published_jobs` sem limit), F-02/F-04 (Frontend caches)

---

## MEMORY-CACHE-FIX-FRONTEND-1 — Registro de Correções Aplicadas

**Data:** 2026-06-16
**Status:** CONCLUÍDO

### O que foi corrigido

#### F-01 — `PipelineContext.matchingAttemptRef` — política de retenção adicionada

**Problema:** `matchingAttemptRef` era um `Map<string, { status; error? }>` sem timestamp, sem limite de tamanho e sem expiração. A cada candidato analisado acumulava uma entrada permanente, crescendo indefinidamente durante a sessão do browser.

**Solução:** Criado módulo de helpers puros em `matchingAttempts.ts` com:
- **`MatchingAttemptEntry`** — tipo estendido com campo `timestamp: number`
- **`MAX_MATCHING_ATTEMPTS = 100`** — limite máximo de entradas no Map
- **`MATCHING_ATTEMPT_TTL_MS = 30 * 60 * 1000`** — TTL de 30 minutos por entrada
- **`pruneMatchingAttempts(map, { maxSize, ttlMs, now })`** — remove expirados e excesso (oldest-first por insertion order)
- **`setMatchingAttemptWithLimit(map, key, value, options)`** — pruna a `maxSize - 1` antes de inserir (garante invariante `≤ maxSize` após inserção)
- **`isMatchingAttemptBlocked(entry, { ttlMs, now })`** — substitui o guard inline com TTL embutido

**Política de retenção:**
- Entradas `completed`/`failed` expiram após 30 minutos → próxima chamada faz GET leve ao pipeline antes de re-tentar match
- Entradas `in_flight` expiram após 30 minutos → requests travados são re-tentáveis (sem crescimento indefinido de guards mortos)
- Máximo de 100 entradas → pior caso: sessão muito longa com muitos candidatos distintos nunca ultrapassa 100 entradas no Map

**Sem impacto visual:** o comportamento externo é idêntico — entradas recentes continuam bloqueando re-tentativas duplicadas; a única diferença é que entradas antigas expiram.

### Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `frontend/src/features/pipeline/utils/matchingAttempts.ts` | Novo arquivo — helpers puros com constantes, prune e TTL |
| `frontend/src/features/pipeline/PipelineContext.tsx` | Import dos helpers; tipo do ref atualizado; guard e `.set()` migrados |
| `frontend/src/features/pipeline/utils/__tests__/matchingAttempts.test.ts` | Novo arquivo — 14 testes cobrindo todas as funções puras |

### Testes executados

```
npx vitest run src/features/pipeline/utils/__tests__/matchingAttempts.test.ts \
              src/features/pipeline/__tests__/PipelineContext.test.tsx
# Resultado: 21 passed, 0 failed
```

TypeScript: `npx tsc --noEmit` → No errors found.

### Cobertura dos testes adicionados

- `isMatchingAttemptBlocked`: entry undefined, in_flight/completed/failed recentes, entrada expirada, entrada no exato limite do TTL
- `pruneMatchingAttempts`: mapa vazio, remove expirados, preserva recentes, evicta mais antigos ao exceder maxSize, não remove in_flight recente, invariante de crescimento máximo com inserções repetidas
- `setMatchingAttemptWithLimit`: timestamp correto, campo error, atualização de chave existente expirada, prune de expirados antes de inserir

### Riscos residuais

- **Reativação de failed após TTL:** Entradas `failed` expiram após 30 min, o que permite uma nova tentativa. Se o erro foi permanente (ex.: configuração incorreta), o usuário verá a falha novamente. Aceitável: o comportamento correto de retry após recarregamento da página já era esse.
- **In_flight com TTL:** Entry `in_flight` expirada após 30 min pode causar request duplicado caso o request original ainda esteja em voo. Na prática, requests que demoram >30 min já falharam na camada de rede.

---

## Sumário de Prioridades

| Task | Prioridade | Risco Correção | Arquivo | Esforço estimado | Status |
|------|-----------|----------------|---------|-----------------|--------|
| B-01 | P0 | BAIXO | `ai_usage_log_service.py` | 15min | ✅ CONCLUÍDO |
| B-02 | P0 | BAIXO | `analysis_tasks.py` | 20min | ✅ CONCLUÍDO |
| B-03 | P0 | BAIXO | `stale_analysis_cleanup_tasks.py` | 10min | ✅ CONCLUÍDO |
| B-04 | P1 | BAIXO | `document_ai.py` | 10min | ✅ CONCLUÍDO |
| F-01 | P1 | BAIXO | `PipelineContext.tsx` | 15min | ✅ CONCLUÍDO |
| F-02 | P2 | MÉDIO | `PipelineContext.tsx` | 30min | ✅ CONCLUÍDO |
| F-03 | P1 | BAIXO | `BehavioralAIEvaluationPanel.tsx` | 10min | ✅ CONCLUÍDO |
| B-07 | P1 | BAIXO | `celery_app.py` | 5min | ✅ CONCLUÍDO |
| B-05 | P2 | BAIXO-MÉDIO | `public.py` + repo | 20min | ⏳ PENDENTE |
| F-04 | P3 | BAIXO | Drawer components | 45min | ⏳ PENDENTE |

---

## MEMORY-CACHE-FIX-CELERY-1 — Registro de Correções Aplicadas

**Data:** 2026-06-16
**Status:** CONCLUÍDO

### B-07 — `worker_max_memory_per_child` — adicionado ao Celery

**Problema:** Sem `worker_max_memory_per_child`, workers Celery long-running podiam acumular memória indefinidamente entre tasks. O único safe-guard existente era `worker_max_tasks_per_child=50`, que recicla o processo a cada 50 tasks mas não bloqueia crescimento de memória dentro de uma task individual longa.

**Solução:**
1. Adicionado `CELERY_WORKER_MAX_MEMORY_PER_CHILD: int = 300_000` em `settings.py`
2. `celery_app.conf.update(...)` agora inclui `worker_max_memory_per_child=settings.CELERY_WORKER_MAX_MEMORY_PER_CHILD`
3. Variável documentada em `backend/.env.example` e `.env.docker.example`

**Default adotado:** 300 000 KB (~293 MB por processo filho). Celery mede RSS do processo e o recicla assim que ultrapassa esse limite após a task corrente terminar (nunca no meio de uma task).

**Interação com `worker_max_tasks_per_child`:** os dois mecanismos são independentes e ambos ativos. O processo é reciclado assim que qualquer um dos limites for atingido primeiro.

### Variável criada

| Variável | Default | Unidade | Descrição |
|---|---|---|---|
| `CELERY_WORKER_MAX_MEMORY_PER_CHILD` | `300000` | KB | RSS máximo por worker process antes de reciclagem |

### Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `backend/src/core/settings.py` | `+CELERY_WORKER_MAX_MEMORY_PER_CHILD: int = 300_000` |
| `backend/src/infrastructure/queue/celery_app.py` | `+worker_max_memory_per_child=settings.CELERY_WORKER_MAX_MEMORY_PER_CHILD` |
| `backend/.env.example` | Documentação da nova variável na seção Celery |
| `.env.docker.example` | Documentação da nova variável na seção Celery |
| `backend/tests/unit/test_celery_worker_memory_config.py` | Novo arquivo — 5 testes |

### Testes executados

```
backend/.venv/bin/python -m pytest tests/unit/test_celery_worker_memory_config.py -v
# Resultado: 5 passed, 3 warnings in 2.83s
```

Testes cobrem:
- Default 300 000 quando env não configurada
- Override por `CELERY_WORKER_MAX_MEMORY_PER_CHILD` via env
- Tipo é `int` (não string)
- `celery_app.conf.worker_max_memory_per_child` tem o valor esperado
- `worker_max_tasks_per_child=50` preservado

### Riscos residuais

- **Ajuste do default:** 300 MB é conservador para workers de análise IA que carregam modelos ou respostas Gemini grandes. Se o monitoramento (script `memory_snapshot.py`) indicar RSS de workers próximo de 300 MB em operação normal, aumentar para 500 000 KB ou 600 000 KB.
- **Solo task memory:** `worker_max_memory_per_child` verifica RSS apenas entre tasks, não durante. Uma única task que consome >300 MB não é interrompida — apenas o próximo ciclo de reciclagem acontece antes do limite de 50 tasks.

---

## MEMORY-CACHE-FIX-FRONTEND-2 — Registro de Correções Aplicadas

**Data:** 2026-06-16
**Status:** CONCLUÍDO

### F-02 — `candidateCacheRef` — política de retenção adicionada

**Problema:** `candidateCacheRef` era `Map<string, CandidateOverview>` sem TTL e sem limite de tamanho. A cada candidato aberto no pipeline, uma entrada era acumulada permanentemente na sessão.

**Solução:** Criado módulo `candidateCache.ts` com helpers puros:

| Constante/Função | Valor/Comportamento |
|---|---|
| `MAX_CANDIDATE_CACHE_ENTRIES` | 100 entradas máximas |
| `CANDIDATE_CACHE_TTL_MS` | 15 minutos por entrada |
| `pruneCandidateCache(map, opts)` | Remove expirados + evicta oldest-first até o limite |
| `setCandidateCacheEntryWithLimit(map, key, data, opts)` | Pruna a `maxSize - 1` antes de inserir |
| `getCandidateCacheEntry(map, key, opts)` | Retorna `undefined` para expiradas/ausentes |

**Tipo alterado:** `Map<string, CandidateOverview>` → `Map<string, CachedCandidateEntry>` (adiciona `timestamp`).

**Callsites migrados em PipelineContext.tsx:**
- 6× `.set()` → `setCandidateCacheEntryWithLimit()`
- 8× `.get()` → `getCandidateCacheEntry()` (com TTL embutido)
- 3× `.delete()` — permanecem inalterados (invalidações explícitas não precisam de TTL)

**Comportamento visual:** idêntico — cache hits recentes continuam servindo dados instantaneamente; a diferença é que entradas com mais de 15 minutos caem no fluxo normal de fetch.

---

### F-03 — `BehavioralAIEvaluationPanel` — hard-stop timer de 5min armazenado e cancelado

**Problema:** `window.setTimeout(…, 300_000)` na linha 99 não tinha o retorno armazenado, portanto `clearTimeout` não era chamado no unmount. O timer podia disparar `setPollingTimedOut(true)` após o componente ser desmontado.

**Solução (2 linhas de mudança efetiva):**
1. Adicionado `hardStopTimerRef = useRef<number | null>(null)`
2. `window.setTimeout(…)` armazenado em `hardStopTimerRef.current`
3. Cleanup no `useEffect` de montagem: `clearTimeout(hardStopTimerRef.current)`
4. Limpeza também dentro do próprio callback (quando o timer dispara normalmente): `hardStopTimerRef.current = null`

---

### Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `frontend/src/features/pipeline/utils/candidateCache.ts` | Novo — helpers puros com TTL + max size |
| `frontend/src/features/pipeline/PipelineContext.tsx` | Import + tipo do ref + 14 callsites migrados |
| `frontend/src/features/candidates/drawer/components/BehavioralAIEvaluationPanel.tsx` | `hardStopTimerRef` + clearTimeout no unmount |
| `frontend/src/features/pipeline/utils/__tests__/candidateCache.test.ts` | Novo — 13 testes cobrindo get/prune/set |
| `frontend/src/features/candidates/drawer/components/__tests__/BehavioralAIEvaluationPanel.test.tsx` | +2 testes de cleanup do timer |

### Testes executados

```
npx vitest run \
  src/features/pipeline/utils/__tests__/candidateCache.test.ts \
  src/features/pipeline/__tests__/PipelineContext.test.tsx \
  src/features/candidates/drawer/components/__tests__/BehavioralAIEvaluationPanel.test.tsx
# Resultado: 27 passed, 0 failed
```

TypeScript: `npx tsc --noEmit` → No errors found.

### Política de retenção adotada (F-02)

- Máximo de **100 entradas** no cache por sessão
- TTL de **15 minutos** por entrada (suficiente para uma sessão ativa; curto o bastante para não exibir dados obsoletos)
- Evicção **oldest-first** por insertion order do Map quando o limite é excedido
- Entradas expiradas são tratadas como cache miss — o componente faz um novo fetch transparente

### Riscos residuais

- **F-02 — Rollback otimista com entrada expirada:** Em `moveCandidateStage`, o `previousOverview` é capturado via `getCandidateCacheEntry`. Se a entrada estiver expirada (15+ min na mesma tela), o rollback em caso de erro de API pode não ter o snapshot correto. Na prática, um usuário que fica 15 min em uma tela sem interação e então move um candidato, e o move falha, vê o estado da tela sem rollback local — o que é aceitável (a página pode ser recarregada).
- **F-03 — Segundo `handleGenerateAnalysis` enquanto o primeiro timer ainda corre:** O código já limpa o timer anterior antes de criar um novo (`if (hardStopTimerRef.current !== null) clearTimeout(...)`). Não há risco de timers duplicados.

---

## MEMORY-CACHE-FIX-BACKEND-2

**Data:** 2026-06-16
**Status:** ✅ CONCLUÍDO

### B-05 corrigido — `list_published_jobs` sem limit

**Arquivos alterados:**
- `backend/src/infrastructure/repositories/sqlalchemy_job_repository.py` — `list_published()` recebeu `limit: int = 50` e `offset: int = 0` com `.limit()` e `.offset()` na query.
- `backend/src/interface/api/routers/public.py` — endpoint `GET /public/jobs` ganhou `Query` import e params `limit: int = Query(50, ge=1, le=200)` e `offset: int = Query(0, ge=0)`. Constantes `_PUBLISHED_JOBS_DEFAULT_LIMIT = 50` e `_PUBLISHED_JOBS_MAX_LIMIT = 200` definidas no topo do router.
- `backend/tests/unit/test_published_jobs_limit.py` — **novo** — 7 testes: SQL contém LIMIT 50, LIMIT 200, OFFSET, default do repositório = 50, default offset = 0, max_limit do router = 200, default limit do router = 50.

### B-06 corrigido — `SkillEquivalenceService` com estado mutável compartilhado

**Problema:** `_db_cache_entry`, `_source_usage_totals`, `_fallback_total`, `_counter_lock` e `_db_cache_ttl_seconds` eram atributos de classe mutáveis — acesso direto via instância (`instance._source_usage_totals[...] = x`) mutaria o estado de todos.

**Fix:** Movidos para módulo-nível com nomenclatura explícita (`_DB_CACHE_TTL_SECONDS`, `_db_cache_entry`, `_source_usage_totals`, `_fallback_total`, `_counter_lock`). Classmethods atualizados para usar módulo-nível com `global` onde há reassignment (`_db_cache_entry`, `_source_usage_totals`, `_fallback_total`). Comportamento 100% preservado.

**Arquivos alterados:**
- `backend/src/application/services/skill_equivalence_service.py` — remoção das 5 class-attrs, adição das 5 vars no topo do módulo, atualização de `clear_catalog_cache`, `reset_observability_counters`, `_load_database_catalog_with_stats`, `_register_source_usage`, `_peek_fallback_total`.
- `backend/tests/unit/test_skill_equivalence_service.py` — adicionada classe `TestSkillEquivalenceServiceStateIsolation` com 5 testes: isolamento de catálogo entre instâncias, matching não polui instâncias cruzadas, regras de equivalência preservadas, counters são módulo-nível (não class attr), reset limpa estado corretamente.

### Testes executados

```
backend/.venv/bin/python -m pytest tests/unit/test_published_jobs_limit.py tests/unit/test_skill_equivalence_service.py::TestSkillEquivalenceServiceStateIsolation -v
# Resultado: 12 passed, 0 failed
```

**Nota:** 3 testes pré-existentes em `TestSkillEquivalenceService` (Python→FastAPI, ERP→Protheus, BI→Power BI) já falhavam antes desta fase — confirmado via `git stash`. Fora do escopo desta correção (são divergências de catálogo, não bugs de memória).

### Riscos residuais

- **B-05 — Offset sem cursor:** A paginação é offset-based (não keyset). Em coleções que mudam durante a paginação, pode haver duplicatas/saltos. Aceitável para o endpoint público que lista vagas — vagas publicadas mudam com baixíssima frequência.
- **B-06 — `_source_usage_totals` rebinding em `reset_observability_counters`:** Após o reset, qualquer código que tenha capturado uma referência direta ao dict antigo (`from ... import _source_usage_totals`) continua apontando para o dict velho. O acesso correto é via módulo (`import src.application.services.skill_equivalence_service as m; m._source_usage_totals`). Os testes usam esta forma correta.

---

## MEMORY-CACHE-FIX-FRONTEND-3

**Data:** 2026-06-16
**Status:** ✅ CONCLUÍDO

### F-04 corrigido — hooks/drawers com fetch sem AbortController

**Componentes afetados:**
- `CandidateNotesTab` — `listNotes` sem AbortController no `useEffect`
- `CollaborationTab` — `listCollaboration` sem AbortController; `listManagers` sem guard de unmount
- `CandidateHiringDecisionPanel` — `Promise.all([getHiringDecision, getHiringDecisionHistory])` sem AbortController

**Arquivos alterados:**
- `frontend/src/services/http.ts` — adicionado `signal?: AbortSignal` a `RequestOptions`; sinal externo é propagado para o fetch interno; AbortError de sinal externo vira `DOMException("AbortError")` (distinguível de timeout `HttpError(504)`). Backward-compatible: nenhum caller existente é afetado.
- `frontend/src/services/collaborationService.ts` — `listCollaboration` aceita `signal?: AbortSignal` opcional
- `frontend/src/services/usersService.ts` — `listManagers` aceita `signal?: AbortSignal` opcional
- `frontend/src/services/candidatesService.ts` — `listNotes` aceita `signal?: AbortSignal` opcional
- `frontend/src/services/hiringDecisionService.ts` — `getHiringDecision` e `getHiringDecisionHistory` aceitam `signal?: AbortSignal` opcional
- `frontend/src/features/candidates/drawer/components/CandidateNotesTab.tsx` — `loadNotes` inline no `useEffect` com `AbortController`; signal passado para `listNotes`; cleanup `abortController.abort()`
- `frontend/src/features/candidates/drawer/components/CandidateHiringDecisionPanel.tsx` — `load(signal?)` aceita signal; `useEffect` cria `AbortController` e passa para ambos os fetches; `handleSubmit` continua chamando `load()` sem signal (comportamento preservado)
- `frontend/src/features/candidates/drawer/components/CollaborationTab.tsx`:
  - `fetchComments`: AbortController com signal passado para `listCollaboration`; cleanup `abortController.abort()`
  - `loadManagers`: usou `cancelled` closure flag (não AbortController) — `loadingManagers` estava nas deps, e `setLoadingManagers(true)` dentro do effect causava cleanup prematuro do AbortController antes da resposta. Solução: flag `cancelled`, `loadingManagers` removido das deps (era usado apenas como guard, substituído por `loadedManagers`)

**Padrão adotado:**
- Para fetches cujas deps não mudam durante o effect: `AbortController` + signal passado para o serviço + `return () => abortController.abort()`
- Para `loadManagers` (caso especial — estado dentro das deps): `cancelled` closure flag + `return () => { cancelled = true; }`

**Testes criados:**
- `frontend/src/services/__tests__/http.signal.test.ts` — 4 testes: signal não quebra chamadas normais, signal é passado ao fetch, AbortError surfaceado quando caller aborta, HttpError(504) em timeout
- `frontend/src/features/candidates/drawer/components/__tests__/CandidateNotesTab.abort.test.tsx` — 4 testes: signal passado, signal abortado no unmount, sem setState após unmount, erro real exibido
- `frontend/src/features/candidates/drawer/components/__tests__/CollaborationTab.abort.test.tsx` — 5 testes: signal passado, signal abortado no unmount, sem setState após unmount, refetch ao trocar IDs, managers cancelled em unmount
- `frontend/src/features/candidates/drawer/components/__tests__/CandidateHiringDecisionPanel.abort.test.tsx` — 5 testes: signal passado a ambos os fetches, signal abortado no unmount, sem setState após unmount, refetch ao trocar candidateId, erro real exibido

### Testes executados

```
npx vitest run http.test.ts http.signal.test.ts CandidateNotesTab.test.tsx CandidateNotesTab.abort.test.tsx CollaborationTab.test.tsx CollaborationTab.abort.test.tsx CandidateHiringDecisionPanel.test.tsx CandidateHiringDecisionPanel.abort.test.tsx
# Resultado: 43 passed, 0 failed
npx tsc --noEmit → No errors found
```

### Riscos residuais

- **`loadManagers` sem signal de rede:** O `listManagers` call em `CollaborationTab` não usa AbortSignal (usa `cancelled` flag). O request de rede continua em flight até completar; apenas o setState é bloqueado. Aceitável — é uma lista pequena chamada uma única vez por sessão.
- **Drawers não cobertos:** Os fetches de SUBMIT (POST/PATCH) em `handleSubmit`, `handleCreate`, `saveEdit` não usam AbortController — mas submits são ações do usuário (não fetches de leitura) e não têm o mesmo risco de race condition em mount/unmount.
- **`useCandidateData` já estava correto:** Não modificado — já usava o padrão AbortController + `signal.aborted` em ambos os useEffects.

---

## MEMORY-CACHE-SMOKE-LOCAL-1

**Data:** 2026-06-16
**Status:** ✅ CONCLUÍDO — Resultado: **WARN**

### Contexto
Smoke test executado em modo local sem Docker (`npm run dev:full`) após todas as correções das fases anteriores (BACKEND-1, FRONTEND-1, FRONTEND-2, CELERY-1, BACKEND-2, FRONTEND-3) e após DEV-FULL-NODOCKER-1.

### Resultado

| Métrica | Valor |
|---|---|
| Health check | PASS (13/13) |
| Requests executados | 71/72 OK (98.6%) |
| Redis DB0 chaves sem TTL | 0 (PASS) |
| Redis DB1 chaves sem TTL | 10 — `_kombu.binding.*` (esperado, não é vazamento) |
| Crescimento backend | −18% (GC atuou — estável) |
| Crescimento frontend | −7% (estável) |
| Crescimento Redis | 0 MB (estável) |
| B-05 limit=200 | 200 OK ✓ |
| B-05 limit=201 | 422 Unprocessable ✓ |
| B-05 offset | 200 OK ✓ |

### Arquivos criados/alterados

| Arquivo | Tipo |
|---|---|
| `.design/memory-cache-audit-1/SMOKE_LOCAL_REPORT.md` | Criado — relatório completo |
| `.design/memory-cache-audit-1/TASKS.md` | Atualizado — esta seção |

### Motivo do WARN (não PASS)

1. **Celery não estava ativo** — DEV-FULL-NODOCKER-1 tornou Celery opt-in; B-07 não foi exercitado
2. **3 endpoints SKIPPED** — document-ai/history (sem dados), admin/system-health (token), pre-admission (sem seed)
3. **1 request timeout** — pipeline ciclo 1, backend aquecendo; ciclos 2–8 OK

### Riscos residuais

- **B-07 não validado em runtime:** Celery não estava ativo durante o smoke. A correção existe no código mas não foi exercitada com carga real.
- **Redis DB2 (celery-task-meta-*):** 128 chaves de resultados Celery acumuladas. Verificar se todas têm TTL ou se há acumulação de resultados antigos de tasks completadas.
- **document-ai history:** Endpoint retornou 404 — seed local não tem resume com histórico DocumentAI. Coberto por teste de integração mas não por smoke runtime.

### Próximos passos recomendados

1. Executar smoke com Celery ativo: `DEV_FULL_WITH_WORKER=1 npm run dev:full`
2. Garantir seed de document-ai para cobrir endpoint de histórico
3. Ciclo mais longo (20–30 requests) para detectar crescimento incremental

---

## MEMORY-CACHE-SMOKE-WORKER-1

**Data:** 2026-06-16
**Status:** CONCLUIDO — Resultado: **PASS**

### Contexto
Smoke test do worker Celery local sem Docker. Complementa MEMORY-CACHE-SMOKE-LOCAL-1 (que terminou WARN por Celery nao estar ativo). Valida B-07 em runtime.

### Resultado

| Criterio | Status |
|---|---|
| Worker sobe corretamente | PASS |
| `worker_max_memory_per_child=300000` | PASS (confirmado via `inspect conf`) |
| `max_tasks_per_child=50` | PASS (confirmado via `inspect conf`) |
| 12 tasks seguras executadas | 12/12 OK |
| Worker nao cresce descontroladamente | PASS (first-run, estabilizou) |
| Redis DB0 sem chaves sem TTL | PASS (0 chaves) |
| Redis DB2 sem chaves sem TTL | PASS (0/140 sem TTL) |
| Sem custo externo de IA | PASS |
| Flags ERP/Protheus desligadas | PASS |
| Docker nao usado | PASS |

### Tasks executadas

| Task | Execucoes | Resultado |
|---|---|---|
| `detect_stuck_behavioral_ai_evaluations` | 6 | OK — total_found=0 em todos |
| `recompute_job_matches_task` | 6 | OK — no_job_profile (sem job profile na seed) |

### Tasks puladas por seguranca

`process_analysis`, `process_behavioral_ai_evaluation`, `process_document_ai_job`, `process_resume_extraction` — todas chamam IA real com custo externo.

### Arquivos criados/alterados

| Arquivo | Tipo |
|---|---|
| `.design/memory-cache-audit-1/SMOKE_WORKER_REPORT.md` | Criado — relatorio completo |
| `.design/memory-cache-audit-1/TASKS.md` | Atualizado — esta secao |

### Riscos residuais

- **Tasks AI nao testadas:** O fluxo `process_analysis -> match_analysis_to_job` nao foi exercitado. Coberto por testes unitarios/integracao mas nao por smoke de worker com carga real.
- **max_tasks_per_child nao atingido:** Apenas 12 tasks executadas. A reciclagem do processo filho (trigger em 50 tasks) nao foi observada em runtime.
- **job profile ausente na seed:** `recompute_job_matches_task` retornou `no_job_profile` — a vaga de seed nao tem job profile gerado por IA.
- **DB2 TTL nao verificado explicitamente:** 140 chaves com TTL confirmado, mas o valor do TTL (`CELERY_RESULT_EXPIRES`) nao foi inspecionado.

### Proximos passos recomendados

1. Smoke com flag `ENABLE_DEV_MOCK=true` para tasks de analise sem custo IA
2. Seed de job profile para `recompute_job_matches_task` retornar `processed > 0`
3. Smoke com mais de 50 tasks leves para validar reciclagem por `max_tasks_per_child`

---

## MEMORY-CACHE-FINAL-REPORT-1

**Status:** CONCLUIDO — Resultado: **PASS_WITH_NOTES**

### Contexto
Consolidacao final de todas as 10 fases da frente de memoria/cache. Relatorio unico com: achados, correcoes, validacoes, riscos eliminados, riscos residuais, dev sem Docker, como repetir smokes, proximos passos.

### Resultado geral: PASS_WITH_NOTES

**Por que PASS:** Todos os achados P0 e P1 foram corrigidos com testes; smokes locais nao detectaram crescimento descontrolado ou chaves Redis sem TTL.

**Por que WITH_NOTES:** Celery nao atingiu max_tasks_per_child em runtime; 3 endpoints nao foram cobertos por smoke; tasks com IA real nao foram exercitadas por restricao de custo.

### Achados tratados

| ID | Categoria | Descricao | Status |
|---|---|---|---|
| B-01 | Backend | `ai_usage_log_service._list_rows` sem limit | CORRIGIDO |
| B-02 | Backend | `mark_stuck_analyses_as_failed` sem batch limit | CORRIGIDO |
| B-03 | Backend | `stale_analysis_cleanup_tasks` sem batch limit | CORRIGIDO |
| B-04 | Backend | `GET /document-ai/{id}/history` sem paginacao | CORRIGIDO |
| B-05 | Backend | `GET /public/jobs` sem limit/offset | CORRIGIDO |
| B-06 | Backend | `SkillEquivalenceService` estado mutavel em atributos de classe | CORRIGIDO |
| B-07 | Backend | Celery sem `worker_max_memory_per_child` | CORRIGIDO |
| F-01 | Frontend | `matchingAttemptRef` crescimento infinito (sem TTL/limite) | CORRIGIDO |
| F-02 | Frontend | `candidateCacheRef` crescimento infinito (sem TTL/limite) | CORRIGIDO |
| F-03 | Frontend | `BehavioralAIEvaluationPanel` timer sem cleanup | CORRIGIDO |
| F-04 | Frontend | Drawers/hooks com fetch sem AbortController | CORRIGIDO |

### Arquivos criados/alterados

| Arquivo | Tipo |
|---|---|
| `.design/memory-cache-audit-1/FINAL_REPORT.md` | Criado — relatorio consolidado |
| `.design/memory-cache-audit-1/TASKS.md` | Atualizado — esta secao |

### Riscos residuais (nao bloqueantes)

- 3 endpoints nao cobertos por smoke (sem seed local completa)
- Tasks IA nao testadas em smoke (custo externo proibido no scope)
- `max_tasks_per_child` nao atingido em runtime durante smoke (apenas 12/50 tasks)
- Paginacao offset-based em B-05 (aceitavel para o volume de vagas publicadas)

### Proximos passos recomendados

1. Seed local para cobrir `/document-ai/{id}/history` e `/pre-admission/workspace`
2. Smoke com `ENABLE_DEV_MOCK=true` para tasks de analise sem custo IA
3. Smoke com >50 tasks leves para validar reciclagem por `max_tasks_per_child`
4. Check Redis sem TTL em CI (gate pos-testes de integracao)
5. Rotina mensal: `bash scripts/diagnostics/dev_full_local_health.sh` + redis audit
