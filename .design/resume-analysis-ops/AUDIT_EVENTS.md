# Eventos de audit log da análise IA de currículos

Fase: `AI-RESUME-OPS-RUNBOOK`

Os eventos abaixo são gravados em `audit_logs`. O campo `metadata_` é sanitizado por `sanitize_observability_metadata`: strings são redigidas para dados sensíveis e truncadas. Não use audit log para armazenar prompt completo, currículo bruto ou payload bruto da IA.

| evento | quando ocorre | metadata importante | como investigar |
| --- | --- | --- | --- |
| `analysis_requested` | Após criar uma análise em `RequestAnalysisUseCase`. | `resume_version_id`, `job_id`, `ai_model_id`, `provider`, `model`, `prompt_template_id`, `prompt_version`, `status`, `force_reanalyze`, `allow_pending_resume_extraction`, `extraction_ready`. | Confirme quem solicitou, qual modelo/prompt estavam ativos e se a extração estava pronta no momento do request. |
| `extraction_completed` | Quando o worker de extração salva `ResumeVersion.extraction_status=completed`. | `extraction_used_ocr`, `text_quality_status`, `page_count`, `word_count`, `empty_pages`, `pending_analysis_count`, `prefilled_fields`. | Use por `resource_id=resume_version_id`; confirma se OCR foi usado e se análises pendentes foram liberadas. |
| `extraction_failed` | Quando o worker marca a versão de currículo como `failed` e falha análises dependentes. | `failure_reason`, `extraction_failure_reason`, `text_quality_status`, `affected_analysis_count`. | Use para distinguir `extracted_text_low_quality` de `resume_extraction_failed`; verifique também `resume_versions.extraction_error`. |
| `ai_analysis_started` | Após o worker de análise fazer claim e antes de chamar a IA. | `provider`, `model`, `prompt_version`, `used_real_ai`, `retry_count`, `max_retries`, `analysis_started_at`, `task_id`, `worker_id`, `job_id`, `resume_version_id`, `text_quality_status`. | Se existe este evento sem terminal posterior, investigar timeout/stuck worker, provider ou interrupção durante chamada. |
| `ai_analysis_completed` | Quando `AnalysisResult` é persistido e `Analysis.status=completed`. | `provider`, `model`, `prompt_version`, `used_real_ai`, `retry_count`, `max_retries`, `duration_ms`, `analysis_started_at`, `analysis_finished_at`, `finish_reason`, tokens, tamanhos de prompt, `sensitive_output_detected`, `payload_invalid=false`. | Confirme modelo/prompt/tokens/latência; se faltar score, investigar matching/scoring posterior, não a análise IA. |
| `ai_analysis_failed` | Quando a análise termina em `failed`. | `failure_reason`, `provider_error_type`, `provider_status_code`, `retry_count`, `max_retries`, `attempts`, `provider`, `model`, `prompt_version`, `duration_ms`, `used_real_ai`, `payload_invalid`, `ai_response_validation_error`, `ai_response_validation_fields`, `sensitive_output_detected`. | Comece por `provider_error_type`; para `payload_invalid`, use `ai_response_validation_error`; para rate limit, verificar retries e provider health. |
| `ai_analysis_retry_scheduled` | Quando falha temporária ou rate limit agenda nova tentativa. | `provider`, `model`, `prompt_version`, `failure_reason`, `provider_error_type`, `provider_status_code`, `retry_count`, `max_retries`, `attempts`, `retry_in_seconds`, `next_retry_at`, `duration_ms`, `used_real_ai`, `payload_invalid`, `sensitive_output_detected`. | Se `next_retry_at` já passou, verificar Celery/Redis; se `provider_error_type=rate_limited`, verificar cooldown/chaves. |
| `ai_payload_invalid` | Quando a análise falha por payload inválido do provider. | Mesmo conjunto de falha, com destaque para `payload_invalid=true`, `ai_response_validation_error` e `ai_response_validation_fields`. | Usar para classificar `ai_response_empty`, `ai_response_invalid_json`, `ai_response_missing_required_fields` ou `ai_response_schema_invalid`. |
| `sensitive_output_sanitized` | Quando a resposta bruta da IA continha conteúdo sensível detectável e foi sanitizada/redigida antes da persistência operacional. | `provider`, `model`, `prompt_version`, `duration_ms`, tokens, `sensitive_output_detected=true`, `raw_llm_response_redacted=true`. | Confirmar que o resultado final e `raw_llm_response` não expõem dados sensíveis; se recorrente, abrir investigação de prompt/modelo sem copiar o payload bruto. |

## Consultas operacionais seguras

Eventos de uma análise:

```sql
select action, metadata_, created_at
from audit_logs
where resource_type = 'analysis'
  and resource_id = '00000000-0000-0000-0000-000000000001'
order by created_at;
```

Eventos de uma extração:

```sql
select action, metadata_, created_at
from audit_logs
where resource_type = 'resume_version'
  and resource_id = '00000000-0000-0000-0000-000000000002'
order by created_at;
```

Falhas recentes por tipo:

```sql
select metadata_->>'provider_error_type' as provider_error_type,
       metadata_->>'failure_reason' as failure_reason,
       count(*) as total
from audit_logs
where action = 'ai_analysis_failed'
group by 1, 2
order by total desc;
```

## Regras de segurança

- Não incluir CPF, telefone, e-mail completo, endereço ou currículo bruto em exemplos, prints ou chamados.
- Não copiar prompt completo com currículo.
- Não copiar `raw_llm_response` bruto.
- Para investigação fora do ambiente restrito, use apenas IDs, status, `failure_reason`, `provider_error_type`, timestamps e metadados sanitizados.

## Limitações

- `extraction_used_ocr` é auditado no evento de extração, não como coluna em `analyses`.
- `analysis_requested` indica se a extração estava pronta no momento do request, mas não substitui a leitura atual de `resume_versions`.
- Eventos dependem da transação do fluxo; se uma operação falhar antes de gravar audit log, use logs técnicos sanitizados do worker.
