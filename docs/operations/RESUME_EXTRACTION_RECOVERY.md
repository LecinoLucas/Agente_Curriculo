# Recuperação de Extrações de Currículo Travadas

## O problema

Quando o worker Celery morre durante a extração de um currículo (OOM, restart, SIGKILL), o `extraction_status` da versão fica preso em `processing` indefinidamente.

**Por quê acontece:**

1. Upload do PDF → `extraction_status = 'pending'` → task enfileirada
2. Worker consome a task → `extraction_status = 'processing'`
3. Worker morre
4. `task_acks_late=True` + `task_reject_on_worker_lost=True` → task volta para a fila
5. Novo worker tenta processar → `_claim_resume_version_for_processing` recusa status `processing`
6. Retorna `skipped` silenciosamente → status nunca sai de `processing`
7. Análise associada fica presa em `waiting_extraction`

## Como o cleanup funciona

**Arquivo:** `backend/src/interface/workers/resume_extraction_cleanup_tasks.py`

A task `cleanup_stuck_extractions` roda periodicamente via Celery beat:

1. Busca `resume_versions` onde `extraction_status = 'processing'` e `uploaded_at < NOW() - 5min`
2. Reseta para `extraction_status = 'pending'` (não para `failed`)
3. Re-enfileira via `enqueue_resume_extraction`
4. Loga quantidade resetada e enfileirada (sem dados sensíveis)

**Batch:** máximo 100 versões por execução.

**Fila:** `extraction` (mesma fila do worker de extração).

## Frequência

Cada 5 minutos via Celery beat (`beat_schedule` em `celery_app.py`):

```python
"resume-extraction-stuck-cleanup-every-5min": {
    "task": "src.interface.workers.resume_extraction_cleanup_tasks.cleanup_stuck_extractions",
    "schedule": crontab(minute="*/5"),
},
```

## Threshold — por que 5 minutos?

- `time_limit` da task de extração = 180 s (3 min)
- Threshold do cleanup = 300 s (5 min)
- Margem de segurança: 2 min

Uma extração legitimamente ativa nunca passa de 3 min. Qualquer versão em `processing` por mais de 5 min é definitivamente travada.

**Proxy `uploaded_at`:** o modelo não tem `extraction_started_at`. `uploaded_at` é seguro como proxy porque upload e enfileiramento da task ocorrem no mesmo request — o gap é < 1 s.

## Confirmar se o Celery beat está rodando

### Modo local (`npm run dev:full`)

O beat só sobe com `DEV_FULL_WITH_WORKER=1`:

```bash
DEV_FULL_WITH_WORKER=1 npm run dev:full
# ou
npm run dev:full -- --with-worker
```

Você verá no terminal:
```
[ok] Worker Celery iniciado (PID XXXXX)
[ok] Celery beat iniciado (PID XXXXX)
```

Para confirmar que o beat está rodando sem o dev:full:
```bash
cd backend
.venv/bin/celery -A src.infrastructure.queue.celery_app beat --loglevel=info
```

### Docker

`docker-compose.local.yml` já inclui o serviço `celery-beat`.

`backend/docker-compose.yml` também tem o serviço `beat`.

Verificar se o container está rodando:
```bash
docker compose ps
# deve mostrar "beat" ou "celery-beat" com status "Up"
```

## Identificar extrações travadas no banco

```sql
SELECT id, resume_id, extraction_status, uploaded_at, extraction_error
FROM resume_versions
WHERE extraction_status = 'processing'
  AND uploaded_at < NOW() - INTERVAL '5 minutes'
ORDER BY uploaded_at DESC
LIMIT 20;
```

Não imprimir `extracted_text` — contém dados do candidato.

## O que NÃO fazer

- **Não** editar `extraction_status` diretamente para `'completed'` no banco. O texto extraído estará vazio.
- **Não** editar para `'failed'` manualmente sem entender o motivo. O candidato não conseguirá reenviar com status `failed` adequado.
- **Não** deletar a versão. Use o cleanup automático ou force `pending` + re-enqueue.

## Forçar re-processamento manual (emergência)

Se o cleanup automático ainda não rodou e a situação é urgente:

```sql
UPDATE resume_versions
SET extraction_status = 'pending', extraction_error = NULL
WHERE id = '<uuid-da-versao>'
  AND extraction_status = 'processing';
```

Depois, a próxima vez que o cleanup rodar (ou ao reiniciar o worker com a task ativa), ela será re-enfileirada.
