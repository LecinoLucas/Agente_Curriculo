# AI-USAGE-LOG-HARDENING-1 — Hardening Report

## Objetivo

Garantir que o registro de uso de IA seja seguro, best-effort, consistente e separado
dos motores de IA. Nenhuma falha de logging pode derrubar um fluxo de análise.

---

## Gaps corrigidos

### 1. `job_ai_draft_graph.py` — Blocking → Best-effort

**Problema**: As 3 chamadas `await persist_ai_usage_log(session, ...)` eram blocking.
Se o banco falhasse no log, o fluxo da vaga (draft) seria interrompido.

**Correção**: Cada chamada foi envolvida em `try/except Exception` com `logger.warning`
no handler. A exceção original do fluxo principal (`AiDraftAIError`, `AiDraftParseError`)
ainda é re-lançada normalmente.

**Nós afetados**: `generate_draft_node`, `parse_draft_node`, `post_validate_node`.

---

### 2. `job_profiler_service.py:304` — Sanitização de error_message

**Problema**: `"error_message": str(exc)` sem sanitização — podia vazar API keys ou
tokens presentes em mensagens de exceção do provider.

**Correção**: `sanitize_log_text(str(exc))[:500]` — remove `AIzaSy*`, `Bearer *`,
chaves de assignment; trunca a 500 chars para evitar entradas abusivas.

**Import adicionado**: `from src.core.log_sanitizer import sanitize_log_text`

---

### 3. `behavioral_ai_evaluation_service.py` — Zero → Full coverage

**Problema**: Nenhum registro de uso da IA após chamada a `self.ai_service.analyze()`.
Sem dados de tokens, custo, latência ou falha para behavioral analysis.

**Correção**:
- `import time` adicionado.
- `from src.application.services.ai_usage_log_service import AIUsageLogPayload, persist_ai_usage_log` adicionado.
- `_t0 = int(time.monotonic() * 1000)` antes da chamada AI.
- `_latency_ms` calculado após retorno.
- Após `_save_completed_evaluation`: bloco `try/except` com `persist_ai_usage_log(self.session, ...)`.
- Nos handlers `AIProviderRateLimitedError` / `httpx.*`: bloco `try/except` com status `"error"`.
- No handler `Exception`: bloco `try/except` com `sanitize_log_text(type(e).__name__)[:200]`.
- `operation="behavioral_analysis"`, `candidate_id=assignment.candidate_id`, `job_id=assignment.job_id`.
- Todos os 3 blocos são `try/except Exception: pass` — nunca bloqueiam o fluxo.

---

### 4. `rag_answer_service.py` — Sem latency_ms → Com latency_ms

**Problema**: `_record_usage` não recebia `latency_ms`, então o campo ficava `None`
no banco mesmo com chamadas bem-sucedidas ao provider.

**Correção**:
- `import time` adicionado.
- `_t0` registrado antes de `generate_response(prompt)`.
- `_latency_ms` calculado após retorno.
- `_record_usage(status="success", ..., latency_ms=_latency_ms)` atualizado.
- Assinatura de `_record_usage` expandida: `latency_ms: int | None = None`.
- `AIUsageLogPayload(latency_ms=latency_ms, ...)` na chamada interna.

---

## Arquivos alterados

```
backend/src/ai_orchestration/jobs/job_ai_draft_graph.py       — 3 persist calls → try/except
backend/src/application/services/job_profiler_service.py      — sanitize_log_text em error_message
backend/src/application/services/behavioral_ai_evaluation_service.py — usage log adicionado
backend/src/ai_orchestration/rag/rag_answer_service.py        — latency_ms adicionado
```

## Arquivo criado

```
backend/tests/unit/test_ai_usage_hardening.py  — 20 testes
```

---

## Testes executados

```
tests/unit/test_ai_usage_hardening.py         — 20 passed
tests/unit/ai_orchestration/ + prompt/analysis regression — 64 passed
tests/unit -k "analysis or usage_log or behavioral or rag or cost or job_profile" — 622 passed
```

---

## Invariantes mantidas

- Falha de usage log nunca derruba análise, job_profile, behavioral, RAG ou job_ai_draft.
- Nenhum prompt, currículo bruto, CPF, telefone ou email é armazenado no log.
- `error_message` é sempre sanitizado antes de persistir.
- `estimated_cost_usd` é calculado automaticamente por `_build_model` quando tokens disponíveis.
- Operações estáveis: `resume_analysis`, `job_profile`, `job_ai_draft`, `behavioral_analysis`, `rag_synthesis`.
