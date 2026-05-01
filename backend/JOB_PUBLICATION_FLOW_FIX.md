# 🚀 Job Publication Flow - Matching Dispatcher

**Data**: 2026-05-01  
**Status**: ✅ COMPLETO E TESTADO  
**Testes**: 5/5 PASSANDO

---

## 🔴 Problema Identificado

Quando uma vaga era lançada (publicada):
```
POST /jobs/{job_id}/publish
  ↓
  Vaga muda para status "published"
  ↓
  ⚠️ FIM! Nada mais acontece
```

A vaga ficava na fila mas **nenhuma tarefa Celery era disparada** para:
- Fazer matching com análises existentes
- Ranking de candidatos
- Notificações

Enquanto isso, quando uma **análise** era completada, ela disparava matching com **todas as vagas publicadas**. O fluxo estava assimétrico.

---

## ✅ Solução Implementada

### 1. Novo Job Dispatcher
Arquivo: [src/interface/workers/job_dispatcher.py](src/interface/workers/job_dispatcher.py)

```python
async def enqueue_job_publication_matches(job_id: UUID) -> int:
    """
    When a job is published, enqueue matching with all completed analyses.
    
    This is the inverse of analysis completion.
    """
    # 1. Lista análises completadas que não foram matchadas com esta vaga
    analyses = await repo.list_completed_unmatched_analyses(job_id)
    
    # 2. Enfileira tarefa Celery para cada análise
    for analysis in analyses:
        match_analysis_to_job.apply_async(
            args=[analysis.id, job_id],
            queue="matching.default",
        )
    
    return len(analyses)
```

**Impacto**:
- ✅ Quando vaga é publicada → matching automático
- ✅ Respecta MATCHING_AUTO_FANOUT_LIMIT
- ✅ Suporta DEV_MOCK para testes

### 2. Método no Repositório
Adicionado em: [SQLAlchemyJobRepository.list_completed_unmatched_analyses()](src/infrastructure/repositories/sqlalchemy_job_repository.py)

```python
async def list_completed_unmatched_analyses(
    self,
    job_id: UUID,
    limit: int | None = None,
) -> list[AnalysisModel]:
    """List all completed analyses that haven't been matched to this job yet."""
    # Usa NOT EXISTS para encontrar análises sem match
    query = sa.select(AnalysisModel).where(
        AnalysisModel.status == "completed",
        ~sa.exists(
            sa.select(1).where(
                ResumeJobMatchModel.analysis_id == AnalysisModel.id,
                ResumeJobMatchModel.job_id == job_id,
            )
        ),
    )
```

**Query SQL Equivalente**:
```sql
SELECT * FROM analyses
WHERE status = 'completed'
  AND NOT EXISTS (
      SELECT 1 FROM resume_job_matches
      WHERE resume_job_matches.analysis_id = analyses.id
        AND resume_job_matches.job_id = $job_id
  )
ORDER BY created_at DESC
LIMIT $limit
```

### 3. Integração no Router
Modificado: [src/interface/api/routers/jobs.py:publish_job()](src/interface/api/routers/jobs.py)

```python
@router.patch("/{job_id}/publish", response_model=JobResponse)
async def publish_job(...):
    # ... validação ...
    
    # Publica vaga
    job = await _transition_job_status(job_id, "published", db)
    
    # 🆕 Enfileira matching com análises existentes
    matched_count = await enqueue_job_publication_matches(job_id)
    logger.info("job.published.matching_enqueued", analyses_enqueued=matched_count)
    
    return job
```

---

## 📊 Fluxo Agora Simétrico

### Antes
```
Analysis Completed          Job Published
     ↓                           ↓
Enfileira com vagas      ❌ Nada acontecia
    OK ✅                       
```

### Depois
```
Analysis Completed          Job Published
     ↓                           ↓
Enfileira com vagas      Enfileira com análises
    OK ✅                        OK ✅
```

---

## 🧪 Cobertura de Testes

**Arquivo**: [tests/unit/interface/workers/test_job_dispatcher.py](tests/unit/interface/workers/test_job_dispatcher.py)

### 5 Testes Implementados

✅ **test_enqueue_job_publication_matches_with_analyses**
- Verifica que 2 análises são enfileiradas quando vaga é publicada
- Valida chamadas corretas ao Celery

✅ **test_enqueue_job_publication_no_analyses**
- Completa graciosamente quando não há análises
- Retorna 0

✅ **test_enqueue_job_publication_dev_mock**
- Em DEV_MOCK, cria asyncio.Task em vez de Celery task
- Valida callback logging

✅ **test_enqueue_job_publication_respects_fanout_limit**
- Respeita MATCHING_AUTO_FANOUT_LIMIT = 5
- Enfileira apenas 5 em vez de 10

✅ **test_enqueue_job_publication_no_limit**
- Quando MATCHING_AUTO_FANOUT_LIMIT = 0, enfileira todos
- Sem limite (até 100 neste teste)

```bash
$ pytest tests/unit/interface/workers/test_job_dispatcher.py -v
5 passed in 1.47s ✅
```

---

## 📝 Fluxo Completo: Publication → Matching

```
1. PATCH /jobs/{job_id}/publish
   ↓
2. Valida qualidade da vaga
   ├─ Se falhar: erro 422
   └─ Se OK: continua
   ↓
3. Muda status para "published" no DB
   ↓
4. Enfileira matching:
   ├─ Busca todas análises completadas não-matchadas (LIMIT=100 by default)
   ├─ Para cada análise: cria tarefa Celery
   │  └─ match_analysis_to_job.apply_async(analysis_id, job_id)
   └─ Retorna contagem enfileirada
   ↓
5. Resposta HTTP: JobResponse
   └─ Com logger: "job.published.matching_enqueued" analyses_enqueued=N
```

---

## ⚙️ Configuração

Via `.env` ou settings.py:

```env
# Máximo de análises para enfileirar quando vaga é publicada
# 0 = sem limite
# 100 = padrão
MATCHING_AUTO_FANOUT_LIMIT=100

# Para testes, usar dev mock
ENABLE_DEV_MOCK=false  # Em produção
```

---

## 🔍 Debugging

### Ver tela

ases enfileiradas ao publicar vaga:

```sql
SELECT 
  j.id as job_id,
  j.title,
  j.status,
  j.published_at,
  COUNT(m.id) as matched_count,
  COUNT(DISTINCT a.id) as total_analyses
FROM jobs j
LEFT JOIN resume_job_matches m ON m.job_id = j.id
LEFT JOIN analyses a ON a.status = 'completed'
WHERE j.status = 'published'
GROUP BY j.id
ORDER BY j.published_at DESC
LIMIT 5;
```

### Ver matching tasks enfileiradas

```python
# Via Celery (se conectado)
celery -A src.infrastructure.queue.celery_app inspect active

# Via Redis (se usando Redis broker)
redis-cli
> KEYS matching.default:*
```

---

## 🚀 Próximos Passos Opcionais

1. **Notificações**: Quando matching está pronto, notificar recruiter
2. **Webhook**: Disparar webhook ao publicar vaga
3. **Search Index**: Atualizar índice de busca quando vaga vai live
4. **Analytics**: Rastrear tempo entre publication e primeiro match

---

## 📋 Arquivos Alterados

| Arquivo | Mudança | Status |
|---------|---------|--------|
| [job_dispatcher.py](src/interface/workers/job_dispatcher.py) | NOVO - dispatcher para vagas | ✅ |
| [jobs.py (router)](src/interface/api/routers/jobs.py) | Integrou dispatcher | ✅ |
| [job_repository.py](src/infrastructure/repositories/sqlalchemy_job_repository.py) | Adicionou list_completed_unmatched_analyses() | ✅ |
| [test_job_dispatcher.py](tests/unit/interface/workers/test_job_dispatcher.py) | NOVO - 5 testes | ✅ |

---

## ✅ Validação Final

```bash
✓ Lógica: Quando vaga publica, analyses são matchadas
✓ SQL: Query correta usa NOT EXISTS
✓ Celery: apply_async chamado com args corretos
✓ DEV_MOCK: asyncio.Task criado em dev mode
✓ Limit: MATCHING_AUTO_FANOUT_LIMIT respeitado
✓ Testes: 5/5 passando
✓ Router: Integrado sem quebras de compatibilidade
✓ Logs: Estruturados com job_id e analyses_enqueued
```

---

*Implementação: 2026-05-01 | Claude Code*
