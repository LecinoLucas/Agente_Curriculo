# Guia de `failure_reason` e `provider_error_type`

Fase: `AI-RESUME-OPS-RUNBOOK`

Use esta tabela para triagem operacional. A coluna `failure_reason` usa o nome real quando localizado no código. Quando o item solicitado não existe literalmente como `failure_reason`, a tabela indica o nome real encontrado.

| failure_reason | significado | causa provável | ação recomendada | chamar IA? | usuário pode corrigir? |
| --- | --- | --- | --- | --- | --- |
| `extracted_text_low_quality` | O PDF gerou texto vazio, ruidoso, curto, repetitivo ou sem sinal profissional mínimo mesmo após fallback aplicável. | PDF escaneado ruim, encoding quebrado, arquivo composto por símbolos/números, OCR indisponível ou OCR sem resultado útil. | Verificar `extraction_failed` no audit log; pedir novo PDF legível; dev deve conferir OCR/tesseract/pdf2image se a falha for recorrente. | Não. | Sim, enviando PDF melhor. |
| `ai_response_empty` | O provider retornou resposta vazia. | Falha do provider, resposta truncada/sem conteúdo, problema transitório ou bug no adapter. | Verificar `provider_error_type`; se classificado como `payload_invalid`, abrir chamado técnico com provider/model/prompt_version. | Já foi chamada e falhou. | Não diretamente. |
| `ai_response_invalid_json` | A resposta IA não continha JSON válido. | Provider retornou texto fora do contrato, JSON quebrado ou conteúdo parcial. | Verificar `ai_payload_invalid`, `ai_response_validation_error`, provider/model/prompt_version; se recorrente, ajustar provider/configuração em fase própria. | Já foi chamada e falhou. | Não diretamente. |
| `ai_response_missing_required_fields` | O JSON não contém campos obrigatórios do schema estrito. | Modelo retornou payload incompleto ou truncado. | Verificar `ai_response_validation_fields` no audit log; conferir se `finish_reason` indica limite de tokens; abrir chamado técnico se recorrente. | Já foi chamada e falhou. | Não diretamente. |
| `ai_response_schema_invalid` | O JSON existe, mas viola o schema esperado. | Campo em tipo inválido, campos extras não suportados ou estrutura diferente do contrato. | Verificar `ai_payload_invalid`; comparar com prompt_version/model; não usar resultado para decisão. | Já foi chamada e falhou. | Não diretamente. |
| `provider_rate_limit_exhausted` | O limite do provider IA persistiu até esgotar retries. | Rate limit 429, chaves em cooldown ou capacidade indisponível. | Verificar `provider_error_type=rate_limited`, `retry_count`, `max_retries`, saúde do provider e credenciais; aguardar cooldown ou intervenção técnica. | Não até resolver rate limit. | Não. |
| `provider_error` | Erro genérico persistido por testes/fluxos de falha de provider; no código real também há tipos mais específicos em `provider_error_type`. | Timeout, erro HTTP, indisponibilidade, erro inesperado ou exceção do adapter. | Conferir `provider_error_type`, `provider_status_code`, logs sanitizados e audit events. | Depende da causa; não repetir manualmente sem checar retry/saúde. | Não diretamente. |
| `temporary` | Classificação temporária usada em testes e cenários de retry; o texto persistido no retry costuma ser mensagem amigável de alta demanda. | Timeout, conexão, provider indisponível ou rate limit ainda recuperável. | Verificar `status=retry_scheduled`, `next_retry_at` e `ai_analysis_retry_scheduled`. | Aguardar retry automático. | Não. |
| `payload_invalid` | Nome real como `provider_error_type`; indica que a resposta da IA não pôde virar payload válido. | JSON inválido, campos obrigatórios ausentes, schema inválido, resposta vazia ou saída truncada. | Verificar `ai_payload_invalid`; usar `ai_response_validation_error` para causa específica. | Já foi chamada e falhou. | Não diretamente. |
| `unsupported_resume_format` | Não localizado como `failure_reason` persistido. Nome real encontrado: mensagem de readiness "currículo está em formato não suportado" no retry/request; no worker de extração a análise dependente recebe `resume_extraction_failed`. | Arquivo não PDF ou metadados MIME/extensão incompatíveis. | Pedir novo PDF; confirmar `mime_type`, `original_file_name` e `extraction_error`. | Não. | Sim, enviando PDF. |
| `extraction_failed` | Não localizado literalmente como `failure_reason`; evento real é `audit_logs.action=extraction_failed`. Para análise dependente, os motivos reais são `resume_extraction_failed` ou `extracted_text_low_quality`. | Arquivo ausente, contexto ausente, PDF inválido, erro do parser PDF, formato não suportado ou falha inesperada. | Verificar `resume_versions.extraction_error` e audit event `extraction_failed`. | Não. | Às vezes: novo PDF resolve casos de arquivo/formato/qualidade. |
| `resume_extraction_failed` | Falha geral na extração que não foi classificada como baixa qualidade. | Arquivo ausente, contexto ausente, parser PDF falhou, formato rejeitado no worker, erro inesperado. | Verificar `extraction_error`; se for formato/arquivo, pedir novo PDF; se contexto/storage, abrir chamado técnico. | Não. | Às vezes. |
| `analysis_enqueue_failed` | Extração concluiu, mas enfileirar a análise falhou. | Redis/Celery indisponível, erro de dispatcher ou falha operacional pós-extração. | Dev deve verificar filas, broker e logs do worker de extração; reprocessar/enfileirar após correção. | Ainda não, ou não de forma confiável. | Não. |

## Provider error types encontrados

Além de `failure_reason`, a análise persiste `provider_error_type`. Tipos encontrados no worker:

- `payload_invalid`
- `rate_limited`
- `provider_unavailable`
- `invalid_api_key`
- `bad_request`
- `unauthorized`
- `forbidden`
- `not_found`
- `provider_http_error`
- `timeout`
- `connection_error`
- `unexpected_error`
- `enqueue_failed`
- `extracted_text_low_quality`
- `resume_extraction_failed`

## Notas de uso

- `payload_invalid` orienta investigação técnica de contrato IA; use o código `ai_response_*` para saber a causa.
- `provider_rate_limit_exhausted` é `failure_reason` terminal; durante retry o motivo é a mensagem amigável de limite do provider.
- `temporary` pode aparecer como classificação/teste; em produção o usuário costuma ver mensagem sanitizada de retry.
- Não copie `raw_llm_response`, currículo bruto, CPF, telefone ou e-mail completo em tickets.
