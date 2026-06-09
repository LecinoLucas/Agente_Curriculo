# AI-USAGE-LOG-HARDENING-1 — Usage Log Coverage

## Fluxos cobertos por AI usage log

| Fluxo | Arquivo | Operação | Best-effort | Latency | Status antes |
|---|---|---|---|---|---|
| resume_analysis | `ai_orchestration/analysis/engine.py` | `resume_analysis` | ✅ `safe_persist_ai_usage_log` | ✅ via `processing_time_ms` | ✅ ok |
| job_profile | `application/services/job_profiler_service.py` | `job_profile` | ✅ via `_ai_usage_logger` wrapper | ✅ via `latency_ms` | ✅ ok |
| job_ai_draft | `ai_orchestration/jobs/job_ai_draft_graph.py` | `job_ai_draft` | ⚠️ blocking → **corrigido** (try/except) | ✅ via `latency_ms` | ❌ bloqueante |
| behavioral_analysis | `application/services/behavioral_ai_evaluation_service.py` | `behavioral_analysis` | **adicionado** (try/except) | **adicionado** | ❌ ausente |
| rag_synthesis | `ai_orchestration/rag/rag_answer_service.py` | `rag_synthesis` | ✅ try/except em `_record_usage` | **adicionado** | ⚠️ sem latência |

## Campos obrigatórios por registro

| Campo | Fonte | Observações |
|---|---|---|
| `provider` | `settings.AI_PROVIDER` ou provedor específico | Nunca nulo |
| `model` | `settings.AI_MODEL_ID` ou modelo específico | Nunca nulo |
| `operation` | Constante por fluxo | Ver tabela acima |
| `status` | `"success"` / `"error"` | Nunca nulo |
| `input_tokens` | `ai_response.input_tokens` | 0 em erros |
| `output_tokens` | `ai_response.output_tokens` | 0 em erros |
| `latency_ms` | Calculado via `time.monotonic()` | Novo em behavioral + RAG |
| `error_message` | Tipo do erro sanitizado | `None` em sucesso |
| `estimated_cost_usd` | `_build_model` via `estimate_ai_cost` | Automático no service |

## Campos NUNCA armazenados

- `prompt` / `system_prompt` / `prompt_text`
- `resume_text` / `raw_resume`
- `provider_response` / `raw_response`
- CPF, telefone, email de candidatos
- `internal_notes` / `review_notes`

## Invariante de segurança

Falha no registro de usage log **nunca** derruba o fluxo principal.
Todos os pontos de log estão dentro de `try/except Exception` que:
- Em falha: emitem `logger.warning` com tipo do erro (sem dados sensíveis)
- Em falha: retornam silenciosamente, deixando o fluxo principal continuar
