# Runbook operacional da análise IA de currículos

Fase: `AI-RESUME-OPS-RUNBOOK`

Escopo: operação do pipeline de currículo PDF, extração, OCR quality gate, análise IA, validação de schema, guardrails, scoring e audit logs. Este documento não define regras novas de produto.

## 1. Visão geral

O pipeline principal é assíncrono e separado em duas filas: `extraction` e `analysis`.

1. Upload PDF
   - O currículo é validado no upload e salvo em storage privado.
   - O formato operacional suportado para extração/análise é PDF.
   - DOC/DOCX não devem seguir para análise de currículo nesta fase.

2. Extração
   - `process_resume_extraction` faz claim de `resume_versions.extraction_status` para `processing`.
   - O worker valida MIME/extensão PDF e chama `extract_pdf_text`.
   - Em sucesso, salva `extracted_text`, `page_count`, `word_count` e `extraction_status=completed`.

3. Quality gate
   - O texto extraído passa por `is_extracted_text_useful`.
   - Texto vazio, curto demais, sem letras/palavras suficientes, ruidoso ou repetitivo é rejeitado.
   - Falha de qualidade usa `extracted_text_low_quality`.

4. OCR fallback
   - O fallback OCR é acionado pelo extrator quando o texto direto está vazio ou de baixa qualidade e OCR está disponível/configurado.
   - Se OCR gerar texto útil, a extração conclui com `extraction_used_ocr=true` no audit event.
   - Se OCR falhar, não houver OCR, ou o texto OCR continuar ruim, a extração falha.

5. Análise IA
   - `RequestAnalysisUseCase` cria `AnalysisModel`.
   - Se a extração está pronta, a análise entra como `pending`.
   - Se a extração ainda está pendente, a análise entra como `waiting_extraction`.
   - O worker `process_analysis` faz claim para `processing`, monta prompt e chama o provider configurado.

6. Schema validation
   - A resposta IA é parseada em `response_parser.py`.
   - Falhas estruturadas usam códigos como `ai_response_empty`, `ai_response_invalid_json`, `ai_response_missing_required_fields` e `ai_response_schema_invalid`.
   - Esses erros são classificados como `provider_error_type=payload_invalid`.

7. Guardrails sensíveis
   - A saída da IA é sanitizada para remover atributos sensíveis/protegidos.
   - `raw_llm_response` persistido passa por redaction.
   - Quando conteúdo sensível é detectado no retorno bruto, o audit log registra `sensitive_output_sanitized`.

8. Scoring
   - O cálculo de score de compatibilidade não é feito pelo LLM.
   - A IA extrai dados estruturados; o backend calcula matching/scoring determinístico depois da análise concluída.

9. Persistência
   - `analyses` guarda status, retries, `failure_reason`, `provider_error_type`, timestamps e claim do worker.
   - `analysis_results` guarda resultado normalizado, tokens, latência, `prompt_version_used` e `raw_llm_response` redigido.
   - `audit_logs.metadata_` guarda metadados operacionais sanitizados.

## 2. Diagrama textual

```text
Upload PDF
  |
  v
ResumeVersion.extraction_status = pending
  |
  v
[queue: extraction] process_resume_extraction
  |
  +-- arquivo/contexto ausente -> extraction_failed + Analysis.failed
  +-- formato nao PDF -> extraction_failed + resume_extraction_failed
  |
  v
extract_pdf_text()
  |
  +-- texto direto util -> extraction_completed
  +-- texto vazio/ruim -> OCR fallback se disponivel
          |
          +-- OCR util -> extraction_completed
          +-- OCR ruim/indisponivel -> extraction_failed
  |
  v
Analysis waiting_extraction -> pending
  |
  v
[queue: analysis] process_analysis
  |
  +-- provider temporario/rate limit -> retry_scheduled
  +-- retry esgotado -> failed
  +-- payload invalido -> failed
  |
  v
parse + schema validation
  |
  v
guardrails + raw_llm_response redaction
  |
  v
Analysis.completed + AnalysisResult
  |
  v
matching/scoring deterministico
```

## 3. Como investigar cenários comuns

### Análise `pending` por muito tempo

1. Verifique `analyses.status`, `task_id`, `queue_name`, `created_at` e `updated_at`.
2. Confirme se o worker Celery da fila `analysis` está rodando.
3. Verifique se há eventos `analysis_requested` e `ai_analysis_started`.
4. Se não houver `ai_analysis_started`, investigue enqueue, Redis/Celery e claim do worker.
5. Se houver `ai_analysis_started` antigo sem terminal, verificar cleanup de stuck analysis e `stale_at`.

### `extraction_failed`

1. Verifique `resume_versions.extraction_status=failed` e `extraction_error`.
2. Busque audit event `extraction_failed` por `resume_version_id`.
3. Confira `metadata.failure_reason`, `metadata.extraction_failure_reason` e `metadata.text_quality_status`.
4. Se a causa for arquivo ausente/contexto ausente, abrir chamado técnico.
5. Se a causa for PDF ruim, orientar novo PDF.

### `extracted_text_low_quality`

1. Confirme `analyses.failure_reason=extracted_text_low_quality`.
2. Confirme `provider_error_type=extracted_text_low_quality`.
3. Busque `audit_logs.action=extraction_failed`.
4. Verifique `text_quality_status=low_quality`.
5. Não retry manualmente esperando sucesso se o mesmo arquivo continuar igual. Peça novo PDF ou verifique OCR/tesseract/pdf2image.

### `ai_response_invalid_json`

1. Verifique `analyses.provider_error_type=payload_invalid`.
2. Verifique `failure_reason` começando com `ai_response_invalid_json`.
3. Busque `ai_payload_invalid` e `ai_analysis_failed`.
4. Veja `ai_response_validation_error` e `ai_response_validation_fields` no metadata.
5. Não usar o `raw_llm_response` como fonte pública; ele deve estar redigido.

### `ai_response_missing_required_fields`

1. Confirme `provider_error_type=payload_invalid`.
2. Busque `ai_payload_invalid`.
3. Use `metadata.ai_response_validation_fields` para identificar os campos faltantes.
4. Verifique `provider`, `model` e `prompt_version` usados.
5. Se recorrente no mesmo modelo/prompt, abrir chamado técnico.

### `provider_rate_limit_exhausted`

1. Confirme `failure_reason=provider_rate_limit_exhausted`.
2. Confirme `provider_error_type=rate_limited`.
3. Verifique eventos prévios `ai_analysis_retry_scheduled`.
4. Consulte saúde do provider e credenciais disponíveis.
5. Não prometer conclusão imediata; aguardar cooldown ou trocar chave/modelo conforme procedimento técnico.

### `payload_invalid`

`payload_invalid` é `provider_error_type`, não necessariamente o texto exato de `failure_reason`.

1. Busque `ai_payload_invalid`.
2. Verifique `ai_response_validation_error`.
3. Confira se há `sensitive_output_detected=true`.
4. Compare `prompt_version`, `provider` e `model` com outras falhas recentes.

### `retry_scheduled`

1. Verifique `analyses.status=retry_scheduled`.
2. Verifique `next_retry_at`, `retry_count`, `max_retries` e `failure_reason`.
3. Busque `ai_analysis_retry_scheduled`.
4. Se `next_retry_at` já passou e nada ocorreu, investigar worker/Redis/Celery.
5. Se é rate limit, verificar cooldown do provider.

### `failed`

1. Leia `failure_reason` e `provider_error_type`.
2. Busque o último audit event terminal: `extraction_failed`, `ai_analysis_failed` ou `ai_payload_invalid`.
3. Verifique se houve retries anteriores.
4. Verifique se o currículo tinha extração concluída e texto útil.
5. Se o erro é técnico e recuperável, avaliar reprocessamento; se é qualidade/formato, pedir novo PDF.

### `completed` sem score esperado

1. Confirme `analyses.status=completed`.
2. Verifique se existe `analysis_results` para o `analysis_id`.
3. Verifique se o matching/scoring posterior foi enfileirado e concluído.
4. Confira se a análise possui `job_id`; sem vaga não há score de aderência à vaga.
5. Lembre que `cv_quality_score` da IA não é o score oficial de compatibilidade.

## 4. Checklist de investigação

- `resume_versions.id`: existe?
- `resume_versions.mime_type` e `original_file_name`: são PDF?
- `resume_versions.extraction_status`: `pending`, `processing`, `completed` ou `failed`?
- `resume_versions.extraction_error`: há erro claro?
- `resume_versions.extracted_text`: existe e passou no quality gate?
- `analyses.id`: existe para o `resume_version_id` e `job_id` corretos?
- `analyses.status`: `waiting_extraction`, `pending`, `processing`, `retry_scheduled`, `completed` ou `failed`?
- `analyses.failure_reason`: qual motivo persistido?
- `analyses.provider_error_type`: qual classificação persistida?
- `analyses.retry_count`, `max_retries`, `next_retry_at`: retry ainda é esperado?
- `analyses.task_id`, `worker_claim_id`, `stale_at`: worker fez claim?
- `audit_logs` por `resource_id=analysis_id`: há eventos de request, started, completed, failed ou retry?
- `audit_logs` por `resource_id=resume_version_id`: há `extraction_completed` ou `extraction_failed`?
- `audit_logs.metadata_`: conferir `provider`, `model`, `prompt_version`, `duration_ms`, `text_quality_status`.
- OCR: verificar `extraction_completed.metadata.extraction_used_ocr`.
- Guardrail: verificar `sensitive_output_sanitized` ou `sensitive_output_detected=true`.

Exemplo de consulta segura:

```sql
select action, resource_type, metadata_, created_at
from audit_logs
where resource_id = '00000000-0000-0000-0000-000000000001'
order by created_at;
```

Use IDs ficticios em chamados e prints quando o contexto sair do ambiente restrito. Nunca copie currículo bruto, CPF, telefone ou e-mail completo.

## 5. O que suporte/RH pode fazer

- Aguardar retry automático quando `status=retry_scheduled` e `next_retry_at` ainda não passou.
- Pedir novo PDF quando a falha for formato, arquivo ilegível, scan ruim ou `extracted_text_low_quality`.
- Reprocessar manualmente somente quando a extração está `completed` e o texto é válido.
- Abrir chamado técnico com `analysis_id`, `resume_version_id`, status, `failure_reason`, `provider_error_type` e horário.
- Não prometer resultado ao candidato sem evidência de `completed` e score calculado.
- Não enviar CPF, telefone, e-mail completo ou currículo bruto no chamado.

## 6. O que dev deve verificar

- Worker Celery `analysis` rodando.
- Worker Celery `extraction` rodando.
- Redis/Celery aceitando enqueue e consumo.
- Credenciais do provider IA e saúde/rate limit.
- `AI_ANALYSIS_MAX_RETRIES` e contagem real de retries.
- OCR/tesseract/pdf2image instalados/configurados quando falhas exigirem OCR.
- Logs estruturados sem payload sensível.
- `audit_logs` gerados e sanitizados.
- `analysis_results.raw_llm_response` redigido.
- Matching/scoring posterior à análise concluída.

## 7. Limitações conhecidas

- `extraction_used_ocr` fica no evento `extraction_completed` do `resume_version`; não há coluna dedicada em `resume_versions`.
- `unsupported_resume_format` não foi localizado como `failure_reason` persistido; o fluxo real usa mensagem de readiness para reprocessamento e `resume_extraction_failed` quando o worker rejeita formato não PDF.
- Audit logs são metadados operacionais sanitizados; não substituem logs técnicos completos do worker.
