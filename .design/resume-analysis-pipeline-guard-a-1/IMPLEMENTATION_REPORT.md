# RESUME-ANALYSIS-PIPELINE-GUARD-A-1

## Causa raiz corrigida

O pipeline de retry tratava estados de naturezas diferentes como se todos fossem elegíveis para reenvio de IA:

- `waiting_extraction` podia voltar para a fila de IA mesmo sem texto elegível.
- falhas por `rate limit`/`quota` podiam reabrir tentativas antes do cooldown terminar.
- `smart refresh` podia classificar falhas limitadas como candidatas a nova análise, requeimando quota.

Tambem havia risco operacional de análise ficar presa em `waiting_extraction` com `task_id` ainda preenchido, impedindo o retorno automático quando a extração terminasse.

## Arquivos alterados

- `backend/src/application/services/analysis_retry_policy.py`
- `backend/src/interface/api/routers/analyses.py`
- `backend/src/interface/api/schemas/analysis_schemas.py`
- `backend/src/application/use_cases/smart_refresh_use_case.py`
- `backend/src/interface/workers/analysis_tasks.py`
- `backend/tests/integration/test_analysis_retry_resilience.py`

## Antes / Depois

Antes:

- retry manual podia tentar fluxo de IA para `waiting_extraction`;
- bulk retry podia reabrir itens que ainda aguardavam extração;
- falhas por `rate limit`/`quota` podiam ter contadores resetados antes do cooldown;
- `smart refresh` não distinguia falha limitada ainda bloqueada;
- `task_id` podia permanecer em `waiting_extraction`, impedindo reprocessamento posterior.

Depois:

- `waiting_extraction` não entra em retry de IA no manual nem no bulk;
- retry manual de `waiting_extraction` responde `409` com `code=analysis_waiting_extraction` e `retry_target=extraction`;
- retry manual de falha limitada em cooldown responde `429` com `code=ai_provider_rate_limited`;
- bulk retry pula `waiting_extraction`, bloqueia limitados em cooldown e retorna breakdown compatível (`processed`/`skipped` preservados);
- `smart refresh` classifica falhas limitadas em cooldown como `skipped_already_processing` / `rate_limited_cooldown`;
- worker limpa `worker_claim_id`, `claimed_at`, `stale_at` e `task_id` ao estacionar em `waiting_extraction`.

## Testes executados

- `python3 -m compileall backend/src backend/tests/integration/test_analysis_retry_resilience.py` -> OK
- `./.venv/bin/python -m pytest tests/integration/test_analysis_retry_resilience.py -q` -> 28 passed
- `./.venv/bin/python -m pytest tests/unit/test_smart_refresh_use_case.py -q` -> 46 passed
- `./.venv/bin/python -m pytest tests/integration/test_worker_tasks.py -q` -> falhou fora do escopo do guard por acesso Redis local bloqueado no sandbox (`Operation not permitted` em `localhost:6379`)
- `./.venv/bin/python -m pytest tests/integration/test_resume_upload_async.py -q` -> falhou na coleta fora do escopo do guard por import quebrado preexistente de `_remove_sensitive_resume_data`

## Confirmações explícitas

- `waiting_extraction` não vai para fila de IA por retry manual nem bulk.
- `failed` por quota/rate limit não reabre tentativas sem respeitar cooldown.
- `smart refresh` não queima quota em falhas limitadas ainda bloqueadas.
- provider não é chamado sem elegibilidade de texto.
- OCR não foi alterado.
- frontend não foi alterado.
