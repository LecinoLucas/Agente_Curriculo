# FINAL REPORT — MEMORY-CACHE-AUDIT-1

**Projeto:** Admissão RH  
**Data de conclusão:** 2026-06-16  
**Resultado geral:** `PASS_WITH_NOTES`

---

## 1. Resumo executivo

A frente de auditoria, correção e validação de memória/cache do projeto Admissão RH está concluída.

Todos os achados críticos (P0) e de alta prioridade (P1) foram tratados com correções cirúrgicas, sem alteração de regra de negócio, sem migração de schema e sem impacto visual no frontend.

Os smokes locais validaram estabilidade real de backend, frontend, Redis e Celery worker no modo de desenvolvimento sem Docker. Não foi detectado crescimento de memória linear ou descontrolado em nenhum dos componentes medidos. Redis não criou chaves sem TTL em nenhum dos cenários testados.

O fluxo de desenvolvimento diário foi modernizado: `npm run dev:full` não usa mais Docker, e o worker Celery é opt-in via `DEV_FULL_WITH_WORKER=1`, eliminando o consumo de ~300–600 MB de RAM desnecessário durante o desenvolvimento sem filas.

**Por que PASS_WITH_NOTES e não PASS simples:**
- 3 endpoints não foram exercitados nos smokes por falta de seed local completa (document-ai/history, admin/system-health, pre-admission/workspace)
- Worker Celery não atingiu o threshold de 50 tasks (max_tasks_per_child) durante o smoke — reciclagem de processo filho não foi observada em runtime
- Tasks que chamam IA real (process_analysis, process_document_ai_job etc.) foram puladas por segurança — fluxo completo com IA não foi exercitado em smoke

---

## 2. Linha do tempo das fases

| Fase | Descrição | Resultado |
|---|---|---|
| **MEMORY-CACHE-AUDIT-1** | Auditoria read-only: 7 achados backend (B-01 a B-07), 4 frontend (F-01 a F-04) | Relatório produzido |
| **MEMORY-CACHE-FIX-BACKEND-1** | B-01 a B-04: limits em queries sem bound | CONCLUÍDO |
| **MEMORY-CACHE-FIX-FRONTEND-1** | F-01: matchingAttemptRef com TTL + limite de 100 entradas | CONCLUÍDO |
| **MEMORY-CACHE-FIX-FRONTEND-2** | F-02: candidateCacheRef com TTL + limite; F-03: BehavioralAIEvaluationPanel timeout ref | CONCLUÍDO |
| **MEMORY-CACHE-FIX-CELERY-1** | B-07: worker_max_memory_per_child=300 000 KB no Celery | CONCLUÍDO |
| **MEMORY-CACHE-FIX-BACKEND-2** | B-05: public jobs com limit/offset; B-06: SkillEquivalenceService stateless | CONCLUÍDO |
| **MEMORY-CACHE-FIX-FRONTEND-3** | F-04: AbortController em CandidateNotesTab, CollaborationTab, CandidateHiringDecisionPanel | CONCLUÍDO |
| **DEV-FULL-NODOCKER-1** | Fluxo de dev local sem Docker; Celery opt-in; health check script; documentação | CONCLUÍDO |
| **MEMORY-CACHE-SMOKE-LOCAL-1** | 8 ciclos × 9 endpoints = 72 requests; sem crescimento; Redis limpo | WARN (Celery ausente) |
| **MEMORY-CACHE-SMOKE-WORKER-1** | Worker Celery local; 12 tasks seguras; config confirmada; Redis limpo | PASS |

---

## 3. Achados corrigidos

### Backend

#### B-01 — `ai_usage_log_service._list_rows` — sem limit
- **Problema:** Select sem `.limit()` sobre `ai_usage_logs` para os últimos 30 dias. Em ambientes com alto volume de IA, poderia retornar milhares de linhas por chamada.
- **Fix:** Parâmetro `max_rows: int = 500` adicionado com `.limit(max_rows)` na query.
- **Arquivo:** `backend/src/application/services/ai_usage_log_service.py`
- **Testes:** `test_ai_usage_service.py` — `test_list_rows_applies_limit`

#### B-02 — `mark_stuck_analyses_as_failed` — sem batch limit
- **Problema:** Dois buckets (processing_stuck, pending_stuck) faziam `.scalars().all()` sem limit — em backlog grande, uma única execução poderia varrer e atualizar centenas de registros na memória.
- **Fix:** Constante `_STUCK_CLEANUP_BATCH_SIZE = 200` aplicada em ambas as queries.
- **Arquivo:** `backend/src/interface/workers/analysis_tasks.py`
- **Testes:** `test_mark_stuck_analyses_limit.py` — 5 testes

#### B-03 — `stale_analysis_cleanup_tasks` — sem batch limit
- **Problema:** `_cleanup_stale_processing_analyses_async` sem `.limit()` na query de DocumentAI analyses.
- **Fix:** `.limit(200)` adicionado com constante `_STALE_CLEANUP_BATCH_SIZE = 200`.
- **Arquivo:** `backend/src/interface/workers/stale_analysis_cleanup_tasks.py`
- **Testes:** `test_stale_analysis_cleanup_limit.py` — 3 testes

#### B-04 — `GET /document-ai/{id}/history` — sem paginação
- **Problema:** Endpoint retornava todo o histórico de análises de um documento sem limit nem offset.
- **Fix:** `limit: int = Query(50, ge=1, le=200)` e `offset: int = Query(0, ge=0)` adicionados.
- **Arquivo:** `backend/src/interface/api/routers/document_ai.py`
- **Testes:** `test_document_ai_security.py` — 2 testes de paginação

#### B-05 — `GET /public/jobs` — sem limit/offset
- **Problema:** Endpoint público de vagas retornava todas as vagas publicadas sem limite.
- **Fix:** `limit: int = Query(50, ge=1, le=200)` e `offset: int = Query(0, ge=0)`. Repository atualizado com `.limit().offset()`.
- **Arquivos:** `public.py`, `sqlalchemy_job_repository.py`
- **Validado em smoke:** `limit=200` → 200 OK; `limit=201` → 422; offset funcional
- **Testes:** `test_published_jobs_limit.py` — 7 testes

#### B-06 — `SkillEquivalenceService` — estado mutável em atributos de classe
- **Problema:** `_db_cache_entry`, `_source_usage_totals`, `_fallback_total`, `_counter_lock`, `_DB_CACHE_TTL_SECONDS` eram class attributes mutáveis — qualquer instância poderia poluir o estado das outras silenciosamente.
- **Fix:** Movidos para módulo-nível com nomenclatura explícita. Classmethods usam `global` onde necessário (reassignment), mantendo comportamento idêntico.
- **Arquivo:** `backend/src/application/services/skill_equivalence_service.py`
- **Testes:** `test_skill_equivalence_service.py::TestSkillEquivalenceServiceStateIsolation` — 5 testes

#### B-07 — Celery `worker_max_memory_per_child` não configurado
- **Problema:** Sem limite de memória por processo filho, workers Celery long-running podiam crescer indefinidamente entre tasks. O único guard existente era `max_tasks_per_child=50` (reciclagem por contagem).
- **Fix:** `CELERY_WORKER_MAX_MEMORY_PER_CHILD = 300_000` (KB ≈ 293 MB) adicionado em `settings.py` e configurado em `celery_app.conf`.
- **Validado em smoke:** `celery inspect conf` confirmou `worker_max_memory_per_child: 300000`. Filhos atingiram 3.3 MB (1.1% do limite).
- **Arquivos:** `settings.py`, `celery_app.py`, `.env.example`, `.env.docker.example`
- **Testes:** `test_celery_worker_memory_config.py` — 5 testes

### Frontend

#### F-01 — `matchingAttemptRef` — crescimento infinito
- **Problema:** `Map<string, {...}>` sem TTL e sem limite de tamanho — acumulava uma entrada por candidato analisado permanentemente na sessão.
- **Fix:** Módulo `matchingAttempts.ts` com `MAX_MATCHING_ATTEMPTS=100`, `MATCHING_ATTEMPT_TTL_MS=30min`, funções puras de prune e guard com TTL.
- **Arquivos:** `matchingAttempts.ts` (novo), `PipelineContext.tsx`
- **Testes:** `matchingAttempts.test.ts` — 14 testes; `PipelineContext.test.tsx` — 7 testes

#### F-02 — `candidateCacheRef` — crescimento infinito
- **Problema:** `Map<string, CandidateOverview>` sem TTL e sem limite — acumulava dados de candidato durante toda a sessão.
- **Fix:** Módulo `candidateCache.ts` com `MAX_CANDIDATE_CACHE_ENTRIES=100`, `CANDIDATE_CACHE_TTL_MS=15min`, evicção oldest-first. 14 callsites migrados no PipelineContext.
- **Arquivos:** `candidateCache.ts` (novo), `PipelineContext.tsx`
- **Testes:** `candidateCache.test.ts` — 13 testes

#### F-03 — `BehavioralAIEvaluationPanel` — timer sem cleanup
- **Problema:** `window.setTimeout(…, 300_000)` sem guardar o retorno — `clearTimeout` não era chamado no unmount. Timer podia disparar `setPollingTimedOut(true)` em componente desmontado.
- **Fix:** `hardStopTimerRef = useRef<number | null>(null)`, timeout armazenado, `clearTimeout` no cleanup do useEffect.
- **Arquivo:** `BehavioralAIEvaluationPanel.tsx`
- **Testes:** `BehavioralAIEvaluationPanel.test.tsx` — +2 testes de cleanup

#### F-04 — Drawers/hooks com fetch sem AbortController
- **Problema:** `CandidateNotesTab`, `CollaborationTab`, `CandidateHiringDecisionPanel` faziam fetches sem AbortController — requests em flight não eram cancelados no unmount, podendo causar `setState after unmount`.
- **Fix:** AbortController adicionado nos useEffects com signal passado para os services. `http.ts` atualizado com suporte a `signal?: AbortSignal` backward-compatible. `loadManagers` em `CollaborationTab` usa `cancelled` flag (evita abort prematuro por dep que muda dentro do effect).
- **Arquivos:** `http.ts`, `collaborationService.ts`, `usersService.ts`, `candidatesService.ts`, `hiringDecisionService.ts`, `CandidateNotesTab.tsx`, `CollaborationTab.tsx`, `CandidateHiringDecisionPanel.tsx`
- **Testes:** 4 novos arquivos de teste com 18 novos testes; total 43/43 passando

---

## 4. Validação local sem Docker — SMOKE-LOCAL-1

**Ambiente:** macOS local, `npm run dev:full` (sem Docker), backend uvicorn + Vite + Redis Homebrew  
**Período:** `2026-06-16T16:03:53Z` → `2026-06-16T16:12:28Z`  
**Resultado:** WARN (Celery não estava ativo)

### Requests executados

- **72 total** (8 ciclos × 9 endpoints): `/health`, `/public/jobs`, `/jobs`, `/jobs/{id}`, `/candidates`, `/candidates/{id}`, `/analyses`, `/analyses/{id}`, `/pipeline/{job_id}`
- **71/72 OK** (98.6%) — 1 timeout no ciclo 1 (backend aquecendo), ciclos 2–8 todos OK

### Medições de memória

| Componente | Antes | Depois | Delta |
|---|---|---|---|
| Backend (uvicorn Python) | 6416 KB (6 MB) | 5264 KB (5 MB) | −18% (GC) |
| Frontend (Node/Vite) | 10336 KB (10 MB) | 9632 KB (9 MB) | −7% (GC) |
| Redis server | 128 KB | 128 KB | 0% |
| Redis memória | 2.37 MB | 2.37 MB | 0% |

### Redis

- **DB0 chaves sem TTL:** 0 antes, 0 depois
- **DB0 total:** 115 → 119 (+4 sessões de auth com TTL — esperado)
- **DB1/DB2:** estáveis

### Validação B-05 em runtime

```
GET /public/jobs?limit=200  → 200 OK   ✓
GET /public/jobs?limit=201  → 422      ✓ (validação ativa)
GET /public/jobs?limit=5&offset=5 → 200 OK ✓
```

### Motivo WARN

1. Celery worker não estava ativo (opt-in após DEV-FULL-NODOCKER-1)
2. 3 endpoints skipped: document-ai/history (404 sem seed), admin/system-health (token), pre-admission (sem dados)
3. 1 timeout de aquecimento no ciclo 1

---

## 5. Validação do worker — SMOKE-WORKER-1

**Ambiente:** macOS local, worker iniciado via `backend/.venv/bin/celery --detach`  
**Período:** `2026-06-16T16:33:12Z` → `2026-06-16T16:39:24Z`  
**Resultado:** PASS

### Configuração confirmada

```
celery inspect conf:
  worker_max_memory_per_child: 300000  ✓
  worker_max_tasks_per_child:  50      ✓

Processo:
  --queues=analysis,matching,document_ai,extraction,behavioral_ai
  --concurrency=2
  --max-tasks-per-child=50
```

### Tasks executadas

- **12 tasks seguras** (6 × `detect_stuck_behavioral_ai_evaluations` + 6 × `recompute_job_matches_task`)
- **12/12 OK** — zero erros, zero exceptions no log
- Latência: 63–975ms na primeira task (first-run); <100ms a partir do ciclo 2

### Medições de memória

| Componente | Antes | Depois | Delta | Classificação |
|---|---|---|---|---|
| Backend (uvicorn) | 9376 KB (9 MB) | 9392 KB (9 MB) | +16 KB | Estável |
| Celery main process | 6784 KB (6 MB) | 11264 KB (11 MB) | +4480 KB (+66%) | Esperado (first-run) |
| Celery child 1 | 1984 KB (2 MB) | 3344 KB (3 MB) | +1360 KB | Esperado (módulos) |
| Celery child 2 | 1984 KB (2 MB) | 3312 KB (3 MB) | +1328 KB | Esperado (módulos) |
| Redis server | 1008 KB (1 MB) | 1952 KB (1 MB) | +944 KB | Esperado (12 task-meta) |

**RSS dos filhos em 3.3 MB = 1.1% do limite de 293 MB** — margem ampla.

### Redis

- **DB0 chaves sem TTL:** 0 antes, 0 depois
- **DB2 (celery-task-meta-*):** 128 → 140 (+12 tasks); **0/140 sem TTL** (todas com TTL)
- **DB1 (broker):** 10 → 10 (routing Kombu, esperado, imutável)

---

## 6. Desenvolvimento local sem Docker

### Comandos principais

```bash
# Stack completo sem Docker (backend + frontend + candidate-portal)
npm run dev:full

# Com worker Celery habilitado (opt-in)
DEV_FULL_WITH_WORKER=1 npm run dev:full

# Ou via flag
npm run dev:full -- --with-worker

# Sem candidate-portal (economiza recursos)
npm run dev:full -- --no-candidate

# Modo rede LAN
npm run dev:full -- --network

# Docker (apenas quando necessário)
npm run docker:full
```

### Separação de responsabilidades

| Comando | Docker? | Celery? | Uso |
|---|---|---|---|
| `npm run dev:full` | Não | Não | Dev diário padrão |
| `DEV_FULL_WITH_WORKER=1 npm run dev:full` | Não | Sim | Dev com filas |
| `npm run docker:full` | Sim | Sim | Replicar prod; CI; onboarding |

### Pré-requisitos locais

```bash
# PostgreSQL
brew install postgresql@16 && brew services start postgresql@16

# Redis
brew install redis && brew services start redis

# Backend venv
cd backend && python3 -m venv .venv && .venv/bin/pip install -e .

# Migrations
cd backend && .venv/bin/python -m alembic upgrade head

# Seed admin
npm run backend:seed-admin
```

### Health check

```bash
bash scripts/diagnostics/dev_full_local_health.sh
```

Verifica backend `/health`, frontend 5173, Redis PING, `DATABASE_URL` local, flags ERP desligadas, processos locais. Retorna PASS/WARN/FAIL.

---

## 7. Riscos residuais (não bloqueantes)

| Risco | Contexto | Mitigação existente |
|---|---|---|
| **Endpoints de smoke incompletos** | document-ai/history (sem seed), admin/system-health (sem token), pre-admission (sem seed) | Cobertos por testes de integração; smoke de runtime pendente após seed |
| **Tasks IA não testadas em runtime** | process_analysis, process_document_ai_job etc. chamam IA real — puladas por segurança | Testes unitários cobrem lógica; smoke com ENABLE_DEV_MOCK recomendado |
| **max_tasks_per_child não atingido** | Apenas 12 tasks executadas no smoke; reciclagem a cada 50 não foi observada | Configuração confirmada via inspect conf |
| **OCR/PDF pesado** | Não testado no smoke; pode consumir memória acima do padrão | B-07 limita processo filho a 293 MB; processo é reciclado após task |
| **Paginação offset-based em B-05** | Vagas podem aparecer duplicadas/saltar se publicadas durante paginação | Aceitável — vagas publicadas mudam com baixíssima frequência |
| **rollback com candidateCacheRef expirado** | Após 15 min, entrada expirada no cache pode não ter snapshot para rollback de moveCandidateStage | Aceitável — recarregar a página resolve; não é perda de dado |
| **B-01 com volume alto** | Períodos com >500 logs/30d mostrarão apenas os 500 mais recentes no dashboard | Documentado; ajustável via env se necessário |
| **Smoke sem profiling profundo** | RSS medido via `ps`, não Memray/tracemalloc | Suficiente para detectar crescimento; profiling profundo se surgir suspeita |

---

## 8. Recomendações

### Curto prazo (próximas semanas)

1. **Seed local mínima para smoke completo:** Criar resume com histórico DocumentAI para cobrir `/document-ai/{id}/history`; garantir job com job_profile para `recompute_job_matches_task` retornar `processed > 0`.
2. **Smoke com ENABLE_DEV_MOCK=true:** Quando disponível, rodar smoke com flag de mock para tasks de análise IA sem custo real — validará o fluxo process_analysis → match_analysis_to_job.
3. **Smoke com >50 tasks:** Despachar >50 tasks leves para verificar reciclagem por `max_tasks_per_child` em runtime.

### Médio prazo

4. **Rotina mensal de smoke:** Incorporar `bash scripts/diagnostics/dev_full_local_health.sh` + Redis audit no checklist de dev mensal.
5. **Check Redis sem TTL em CI:** Adicionar verificação de chaves sem TTL no DB0 como gate no pipeline de CI (pode ser um script leve pós-testes de integração).
6. **Confirmar CELERY_RESULT_EXPIRES:** Verificar e documentar o TTL dos resultados em DB2 (`celery-task-meta-*`) — garantir que não acumulam indefinidamente em produção.

### Guardrails para o futuro

7. **Não criar caches sem TTL/limite:** Toda nova estrutura de cache no frontend deve seguir o padrão de `candidateCache.ts` / `matchingAttempts.ts` — TTL + max size + prune.
8. **Não adicionar queries sem `.limit()`:** Toda nova query de listagem deve ter limit explícito. Revisar com `grep -r "\.scalars()\.all()\|\.fetchall()"` periodicamente.
9. **Manter Celery fora do dev diário:** `INCLUDE_CELERY=false` por padrão preserva ~300 MB de RAM no ambiente de dev. Usar `DEV_FULL_WITH_WORKER=1` apenas quando necessário testar filas.

---

## 9. Comandos úteis de referência

```bash
# Dev local (sem Docker, sem Celery)
npm run dev:full

# Dev local com worker Celery
DEV_FULL_WITH_WORKER=1 npm run dev:full

# Dev local em modo rede LAN
npm run dev:full -- --network

# Dev Docker completo (quando necessário)
npm run docker:full

# Health check local
bash scripts/diagnostics/dev_full_local_health.sh

# Redis audit (somente leitura)
backend/.venv/bin/python3 scripts/diagnostics/redis_cache_audit.py

# Memory snapshot do processo atual
python3 scripts/diagnostics/memory_snapshot.py

# Smoke runtime
bash scripts/diagnostics/runtime_smoke_memory.sh

# Verificar saúde da API
curl -s http://localhost:8000/health | python3 -m json.tool

# Login e obtenção de token
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@resume.ai","password":"<DEV_ADMIN_PASSWORD>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"

# Testes backend (focos da auditoria)
cd backend && .venv/bin/python -m pytest \
  tests/unit/test_ai_usage_service.py \
  tests/unit/interface/workers/test_mark_stuck_analyses_limit.py \
  tests/unit/interface/workers/test_stale_analysis_cleanup_limit.py \
  tests/unit/test_published_jobs_limit.py \
  tests/unit/test_celery_worker_memory_config.py \
  tests/unit/test_skill_equivalence_service.py::TestSkillEquivalenceServiceStateIsolation \
  -v

# Testes frontend (focos da auditoria)
cd frontend && npx vitest run \
  src/features/pipeline/utils/__tests__/matchingAttempts.test.ts \
  src/features/pipeline/utils/__tests__/candidateCache.test.ts \
  src/features/candidates/drawer/components/__tests__/BehavioralAIEvaluationPanel.test.tsx \
  src/services/__tests__/http.signal.test.ts \
  src/features/candidates/drawer/components/__tests__/CandidateNotesTab.abort.test.tsx \
  src/features/candidates/drawer/components/__tests__/CollaborationTab.abort.test.tsx \
  src/features/candidates/drawer/components/__tests__/CandidateHiringDecisionPanel.abort.test.tsx

# Celery inspect (worker em execução)
cd backend && .venv/bin/celery -A src.infrastructure.queue.celery_app inspect ping
cd backend && .venv/bin/celery -A src.infrastructure.queue.celery_app inspect conf \
  | grep -E "max_tasks_per_child|max_memory"
```

---

## 10. Conclusão final

A frente de memória/cache do projeto Admissão RH está concluída como **PASS_WITH_NOTES** para o ambiente de desenvolvimento local sem Docker.

**O que foi alcançado:**
- 11 achados (7 backend, 4 frontend) corrigidos com mudanças cirúrgicas
- 43 novos testes adicionados (backend + frontend) cobrindo os cenários de limite/TTL/AbortController
- Fluxo de desenvolvimento modernizado: sem Docker no dia a dia, Celery opt-in
- Smokes locais executados e documentados com medições reais de RSS e Redis
- Nenhum vazamento de memória detectado nos fluxos exercitados
- Redis sem chaves sem TTL em nenhum cenário testado
- Celery com limites de memória confirmados via `inspect conf`

**O sistema está significativamente mais protegido contra crescimento sem controle em todas as camadas: queries SQL, caches de sessão do frontend, filas Celery e requests HTTP de componentes React.**
