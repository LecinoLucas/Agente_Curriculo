# AI-ANALYSIS-ENGINE-EXTRACT-1 — Extraction Report

## Objetivo

Extrair o motor de análise IA de `analysis_tasks.py` para
`backend/src/ai_orchestration/analysis/`, sem mudar comportamento funcional.

---

## Responsabilidades removidas do worker

| Responsabilidade | Destino |
|---|---|
| Compactação de currículo (normalizar, sanitizar, extrair linhas relevantes, truncar) | `prompt_compaction.py` |
| Compactação de contexto da vaga (título, requisitos, responsabilidades, descrição) | `prompt_compaction.py` |
| Construção do prompt (`PROMPT_INSTRUCTION`, `_build_minimal_user_prompt`) | `prompt_builder.py` |
| Validação de tamanho do prompt + `AnalysisPromptTooLargeError` | `prompt_validator.py` |
| Parsing e validação da resposta AI + checagem de campos obrigatórios | `response_parser.py` |
| Classificação de exceções em `AnalysisErrorClassification` | `failure_classifier.py` |
| Tipos de dados: `AnalysisFailureDetails`, `AnalysisErrorClassification`, `AnalysisExecutionError` | `failure_classifier.py` |
| Orquestração completa do pipeline AI (compactar → construir → validar → chamar → parsear) | `engine.py` |

## Responsabilidades que ficaram no worker

| Responsabilidade |
|---|
| Claim de análise no banco (update atômico, stale check) |
| Carregamento de análise, resume_version, prompt_tpl, ai_model do BD |
| Validação de placeholder e texto vazio do currículo |
| Verificação de credenciais do provider (env + BD) |
| Controle de retry Celery (backoff, jitter, contagem) |
| Persistência de resultado completo em `AnalysisResultModel` |
| Persistência de status (completed / failed / retry_scheduled) |
| Registro de audit events (`record_analysis_audit_event`) |
| Enfileiramento de matching após conclusão |
| `mark_stuck_analyses_as_failed` |
| Log operacional do worker (started/completed/retry_scheduled) |

---

## Arquivos criados

```
backend/src/ai_orchestration/analysis/__init__.py          — pacote, re-exports públicos
backend/src/ai_orchestration/analysis/prompt_compaction.py — compactação de currículo e vaga
backend/src/ai_orchestration/analysis/prompt_validator.py  — validação + AnalysisPromptTooLargeError
backend/src/ai_orchestration/analysis/prompt_builder.py    — PROMPT_INSTRUCTION + build_minimal_user_prompt
backend/src/ai_orchestration/analysis/response_parser.py   — parse + validação de campos obrigatórios
backend/src/ai_orchestration/analysis/failure_classifier.py — tipos de erro + classify_analysis_exception
backend/src/ai_orchestration/analysis/engine.py            — run_analysis (pipeline completo)

tests/unit/ai_orchestration/__init__.py
tests/unit/ai_orchestration/test_ai_boundary_enforcement.py — boundary + compaction + validator + classifier
tests/unit/ai_orchestration/test_analysis_engine.py         — engine: provider chamado, prompt guard, erros
tests/unit/interface/workers/test_prompt_validation.py      — prompt validation regression guard
```

## Arquivos alterados

```
backend/src/interface/workers/analysis_tasks.py  — removidas ~350 linhas de implementação;
                                                    importa dos novos módulos; _run_real_ai_analysis
                                                    virou thin wrapper que delega ao engine.
backend/tests/unit/test_analysis_safe_logging.py — atualizado para patchear o logger correto
                                                    (prompt_validator em vez de analysis_tasks).
```

---

## Interface de backward compat mantida

Todos os símbolos abaixo continuam importáveis de `analysis_tasks`:

- `AnalysisPromptTooLargeError`
- `AnalysisErrorClassification`
- `AnalysisExecutionError`
- `AnalysisFailureDetails`
- `_classify_analysis_exception`
- `_validate_prompt_before_ai`
- `_build_minimal_user_prompt`
- `_compact_resume_for_prompt`
- `_compact_job_for_prompt`
- `_extract_rate_limit_retry_after_seconds`
- `MAX_ANALYSIS_RETRIES`
- `process_analysis`
- `_run_real_ai_analysis`
- `_mark_analysis_failed`
- `_mark_analysis_retry_scheduled`

---

## Testes executados

```
tests/unit/ai_orchestration/test_ai_boundary_enforcement.py  — 29 passed
tests/unit/ai_orchestration/test_analysis_engine.py          — 7 passed
tests/unit/interface/workers/test_prompt_validation.py       — 11 passed
tests/unit/interface/workers/test_analysis_tasks_retry_resilience.py — 19 passed
tests/unit/test_analysis_prompt_minimal.py                   — 8 passed
tests/unit/ -k "analysis or prompt or reprocess or retry"    — 183 passed
```

---

## Riscos restantes

1. **Imports lazy no engine**: `AIAnalysisRequest`, `AIServiceFactory`, `AIResponseValidationError`,
   `safe_persist_ai_usage_log` são importados dentro de `run_analysis()`. Se um mock precisar
   ser aplicado em nível de módulo, deve-se patchear no módulo de origem
   (`src.application.services.ai_usage_log_service`, etc.) em vez de no engine.

2. **Logger mudou de módulo**: O logger que emite `analysis.prompt_metrics` e
   `analysis.prompt_invalid` agora é `src.ai_orchestration.analysis.prompt_validator`.
   Qualquer alerta ou dashboard que filtre pelo nome do logger deve ser atualizado.

3. **`_run_real_ai_analysis` ainda retorna 13-tuple**: Para manter backward compat com o teste
   existente, essa função faz o unpack do `AnalysisEngineResult`. Em uma próxima fase,
   a tupla pode ser eliminada e o `AnalysisEngineResult` passado diretamente para o persist.

---

## Próximos passos sugeridos

- **AI-ANALYSIS-ENGINE-EXTRACT-2**: eliminar a 13-tuple de `_run_real_ai_analysis` e trabalhar
  com `AnalysisEngineResult` direto no worker.
- **AI-ANALYSIS-ENGINE-EXTRACT-3**: extrair `_persist_completed_analysis` para uma camada de
  repositório dedicada, reduzindo o worker ao ciclo claim → engine → persist → log.
