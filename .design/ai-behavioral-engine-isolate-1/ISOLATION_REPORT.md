# AI-BEHAVIORAL-ENGINE-ISOLATE-1 — Isolation Report

## Objetivo

Isolar o motor de IA comportamental em `backend/src/ai_orchestration/behavioral/`,
espelhando o padrão estabelecido em AI-ANALYSIS-ENGINE-EXTRACT-1.
Sem mudança funcional, sem mexer em frontend, bot, ranking ou score.

---

## Fluxo antes

```
BehavioralAIEvaluationService._evaluate_async()
    ├── _fetch_competencies()          → DB
    ├── _fetch_questions_with_answers() → DB
    ├── _build_evaluation_prompt()     → inline no service (1553 linhas)
    ├── self.ai_service.analyze()      → provider inline no service
    ├── _contains_prohibited_language() → inline no service
    ├── _parse_evaluation_response()   → inline no service
    ├── _save_completed_evaluation()   → DB
    └── persist_ai_usage_log()         → DB (best-effort)
```

Os métodos de classificação de erros (`_provider_error_type`, `_is_retryable_provider_error`,
`_classify_unexpected_failure`, `_provider_status_code`, `_retry_after_seconds`) eram
static methods inline no service.

---

## Fluxo depois

```
BehavioralAIEvaluationService._evaluate_async()
    ├── _fetch_competencies()           → DB (continua no service)
    ├── _fetch_questions_with_answers() → DB (continua no service)
    ├── BehavioralEvaluationInput(...)  → monta contrato limpo (sem PII)
    ├── run_behavioral_evaluation()     → NOVO engine isolado:
    │       ├── build_evaluation_prompt(input)      → prompt_builder.py
    │       ├── ai_service.analyze(request)         → provider injeto
    │       ├── contains_prohibited_language()      → response_parser.py
    │       ├── parse_evaluation_response()         → response_parser.py
    │       └── retorna BehavioralEngineResult
    ├── _save_completed_evaluation()    → DB (continua no service)
    └── persist_ai_usage_log()          → DB, best-effort (continua no service)
```

---

## Arquivos criados

```
backend/src/ai_orchestration/behavioral/__init__.py        — pacote, re-exports públicos
backend/src/ai_orchestration/behavioral/behavioral_contracts.py — BehavioralEvaluationInput, BehavioralQAItem
backend/src/ai_orchestration/behavioral/prompt_builder.py  — SYSTEM_PROMPT, build_evaluation_prompt
backend/src/ai_orchestration/behavioral/response_parser.py — PROHIBITED_TERMS, parse_evaluation_response, contains_prohibited_language, BehavioralAIProviderResponseInvalidError
backend/src/ai_orchestration/behavioral/failure_classifier.py — classify_provider_error, is_retryable_provider_error, classify_unexpected_failure, get_provider_status_code, get_retry_after_seconds
backend/src/ai_orchestration/behavioral/engine.py          — BehavioralEngineResult, run_behavioral_evaluation

backend/tests/unit/ai_orchestration/test_behavioral_engine.py — 36 testes (+ 2 skipped)
```

## Arquivos alterados

```
backend/src/application/services/behavioral_ai_evaluation_service.py
    — Removido: import json, PROHIBITED_TERMS, _BEHAVIORAL_AI_RETRY_BACKOFF_SECONDS
    — Removido: lógica inline de prompt, parser, prohibited check
    — Removido: lógica inline dos 5 static classifiers
    — Adicionado: imports dos novos módulos
    — _evaluate_async: delega para run_behavioral_evaluation()
    — Métodos privados mantidos como thin wrappers (backward compat)
```

---

## O que saiu do service

| Lógica | Destino |
|---|---|
| `_build_evaluation_prompt` (corpo) | `prompt_builder.build_evaluation_prompt` |
| System prompt inline | `prompt_builder.SYSTEM_PROMPT` |
| `_parse_evaluation_response` (corpo) | `response_parser.parse_evaluation_response` |
| `_contains_prohibited_language` (corpo) | `response_parser.contains_prohibited_language` |
| `PROHIBITED_TERMS` | `response_parser.PROHIBITED_TERMS` |
| `_provider_error_type` (corpo) | `failure_classifier.classify_provider_error` |
| `_is_retryable_provider_error` (corpo) | `failure_classifier.is_retryable_provider_error` |
| `_classify_unexpected_failure` (corpo) | `failure_classifier.classify_unexpected_failure` |
| `_provider_status_code` (corpo) | `failure_classifier.get_provider_status_code` |
| `_retry_after_seconds` (corpo) | `failure_classifier.get_retry_after_seconds` |
| Chamada direta `self.ai_service.analyze()` | `engine.run_behavioral_evaluation` |
| `AIAnalysisRequest` inline | `engine.py` (lazy import) |

## O que ficou no service

| Responsabilidade |
|---|
| Busca de competências no BD (`_fetch_competencies`) |
| Busca de QA no BD (`_fetch_questions_with_answers`) |
| Gerenciamento de estado da avaliação (pending/processing/completed/failed) |
| Salvar resultados no BD (`_save_completed_evaluation`) |
| Salvar falha e retry no BD |
| Usage log best-effort com `self.session` |
| Retry orchestration (Celery-aware) |
| Operações de admin (metrics, stuck detection, etc.) |
| `_safe_failure_message` (usa constantes de domínio do service) |

---

## Garantias de segurança

- `BehavioralEvaluationInput` não inclui CPF, email, telefone, currículo bruto.
- `PROHIBITED_TERMS` agora está em `response_parser.py` com `frozenset` (imutável).
- Engine não tem acesso à sessão do banco, Celery task IDs ou frontend.
- Usage log continua best-effort (try/except no service).
- `_safe_failure_message` não expõe dados do provider.

---

## Testes executados

```
tests/unit/ai_orchestration/test_behavioral_engine.py    — 36 passed, 2 skipped
tests/unit/ai_orchestration/test_ai_boundary_enforcement.py — 29 passed (regressão)
tests/unit/test_ai_usage_hardening.py                    — 20 passed (regressão)
tests/unit -k "behavioral or job_profile or ai_usage or analysis or prompt or matching"
    — 278 passed, 2 skipped, 0 failed
```

---

## Riscos restantes

1. **`_safe_failure_message` ficou no service**: Depende de constantes locais
   (`_BEHAVIORAL_AI_RATE_LIMIT_MESSAGE`, `SAFE_BEHAVIORAL_AI_ERROR_MESSAGES`).
   Poderia migrar para `failure_classifier.py` em uma fase futura.

2. **Métodos privados como thin wrappers**: `_build_evaluation_prompt`,
   `_parse_evaluation_response`, `_contains_prohibited_language` continuam existindo
   como métodos no service, mas apenas redirecionam para os módulos novos.
   Em fase futura podem ser removidos se nenhum código externo os referencia.

3. **`AIProviderRateLimitedError` e `httpx` ainda importados no service**:
   O `except` da `_evaluate_async` ainda precisa capturar esses tipos.
   Em fase futura, o engine pode envolver esses em um `BehavioralProviderError` unificado.
