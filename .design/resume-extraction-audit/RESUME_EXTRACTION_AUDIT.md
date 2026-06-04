# Auditoria do fluxo de extração e análise de currículos

Fase: `AI-RESUME-EXTRACTION-AUDIT`

Data da auditoria: 2026-06-03

Escopo auditado: backend, workers, services, models, testes e frontend apenas onde acionam ou exibem upload, extração e análise IA de currículo. Esta auditoria não altera código, testes, contratos de API nem regras de negócio.

## 1. Resumo executivo

O sistema possui um fluxo assíncrono bem separado em duas etapas principais:

1. upload/validação/armazenamento do currículo;
2. extração de texto e, depois, análise IA + matching/scoring determinístico com a vaga.

Há bons controles já presentes: validação de tamanho e MIME, checagem de assinatura real do arquivo, armazenamento privado local, filas separadas (`extraction` e `analysis`), claim atômico para reduzir processamento duplicado, idempotência por análise, retry/backoff para falhas temporárias do provider IA, cleanup de análises travadas e testes cobrindo parte do fluxo público com análise em `waiting_extraction`.

Os principais riscos encontrados são:

- a política de upload aceita DOC/DOCX, mas o worker de extração chama `extract_pdf_text()` incondicionalmente;
- o OCR só roda quando o texto extraído é exatamente vazio e limita-se às primeiras 5 páginas;
- o `raw_llm_response` é persistido sem mascaramento específico, enquanto o prompt só remove e-mail, CPF e telefone;
- não foi localizado guardrail abrangente contra uso/menção de dados sensíveis como idade, religião, raça, saúde, estado civil, filhos ou aparência;
- o tratamento de rate limit pode manter retries manuais indefinidamente para `rate_limited`;
- o retry manual de análise não valida se a extração do currículo já está pronta antes de re-enfileirar;
- o parser normaliza respostas IA incompletas com defaults e não usa schema Pydantic/Zod estrito para validar o payload original.

## 2. Mapa do fluxo atual em etapas

1. Entrada pública:
   - `POST /api/v1/public/candidates/apply` recebe dados do candidato e `resume_file`.
   - O endpoint lê até `settings.max_upload_size_bytes + 1`.
   - `PublicApplicationService.apply()` valida, cria candidato/currículo/versão, grava arquivo e cria pipeline/análise quando há vaga.
   - Após commit, o router chama `enqueue_resume_extraction(result.resume_version_id)`.

2. Entrada interna/staff:
   - `POST /api/v1/resumes` inicia um registro de currículo/versão.
   - `POST /api/v1/resumes/{resume_id}/upload` recebe `UploadFile`, valida e grava arquivo.
   - Após commit, chama `enqueue_resume_extraction(uploaded.version.id)`.

3. Entrada Portal 2/chat:
   - `POST /api/v1/conversations/{session_id}/resume` salva currículo temporário em `private_uploads/temp_resumes`.
   - Esse fluxo usa a mesma política de upload, mas não entra diretamente no worker principal de extração/análise mapeado aqui.

4. Validação de arquivo:
   - `validate_upload()` rejeita vazio, acima do limite, extensão inválida, MIME declarado não permitido, extensão incompatível, assinatura incompatível e PDFs com marcadores suspeitos.
   - Scanner ClamAV existe, mas fica desativado por padrão (`FILE_SCAN_ENABLED = False`).

5. Armazenamento:
   - Arquivos principais são gravados localmente em `backend/uploads/resumes` via `write_resume_file()`.
   - A chave fica em `ResumeVersionModel.s3_key`; apesar do nome `s3_*`, a implementação auditada é local.

6. Extração:
   - Worker Celery `process_resume_extraction` na fila `extraction`.
   - Claim atômico muda `resume_versions.extraction_status` de `pending` ou `failed` para `processing`.
   - O worker lê o arquivo e chama `extract_pdf_text(content)`.
   - Em sucesso, salva `extracted_text`, `page_count`, `word_count` e status `completed`.
   - Em falha, salva status `failed` e marca análises dependentes em `waiting_extraction`/`pending` sem `task_id` como `failed`.

7. Análise IA:
   - `RequestAnalysisUseCase` cria análise `pending` se a extração está pronta, ou `waiting_extraction` se ainda falta texto.
   - Após extração bem sucedida, o worker de extração muda análises pendentes para `pending`, atribui `task_id` e enfileira `enqueue_analysis()`.
   - Worker `process_analysis` na fila `analysis` faz claim, compacta prompt, chama provider IA, parseia resposta, persiste resultado e enfileira matching com a vaga.

8. Matching/scoring:
   - A IA extrai perfil do currículo.
   - O score oficial de compatibilidade é calculado deterministicamente no backend em `AnalysisService._match_details_to_job()`.
   - Resultado final é persistido em `candidate_job_scores` e modelos relacionados.

## 3. Diagrama textual do fluxo

```text
Public apply / Staff upload / Chat temp upload
        |
        v
validate_upload()
        |
        +-- inválido -> HTTP 400/422 com mensagem amigável
        |
        v
write_resume_file() / temp file
        |
        v
ResumeVersion.extraction_status = pending
        |
        v
enqueue_resume_extraction(version_id)
        |
        v
[queue: extraction] process_resume_extraction
        |
        +-- claim falha -> skipped
        |
        +-- extract_pdf_text falha -> ResumeVersion.failed + Analysis.failed
        |
        v
ResumeVersion.extraction_status = completed
ResumeVersion.extracted_text = texto limpo
        |
        v
Analysis waiting_extraction/pending sem task -> pending + task_id
        |
        v
[queue: analysis] process_analysis
        |
        +-- provider/rate limit/timeout -> retry_scheduled ou failed
        +-- payload invalido -> failed
        |
        v
AnalysisResult + raw_llm_response + prompt_version_used
        |
        v
match_analysis_to_job
        |
        v
candidate_profile_analysis / job_profile_analysis / candidate_job_match / candidate_job_scores
```

## 4. Endpoints envolvidos

| Endpoint | Arquivo | Papel |
| --- | --- | --- |
| `POST /api/v1/public/candidates/apply` | `backend/src/interface/api/routers/public.py:97` | Recebe candidatura pública e currículo. |
| `POST /api/v1/public/candidates/talent-pool` ou rota equivalente no mesmo router | `backend/src/interface/api/routers/public.py:438` | Recebe currículo para banco de talentos público. |
| `POST /api/v1/resumes` | `backend/src/interface/api/routers/resumes.py:113` | Cria currículo/versão inicial para upload interno. |
| `POST /api/v1/resumes/{resume_id}/upload` | `backend/src/interface/api/routers/resumes.py:151` | Recebe arquivo do currículo interno e enfileira extração. |
| `GET /api/v1/resumes/{resume_id}/extraction-status` | `backend/src/interface/api/routers/resumes.py:195` | Expõe status da extração para UI interna. |
| `POST /api/v1/analyses` | `backend/src/interface/api/routers/analyses.py:267` | Solicita análise IA de uma versão de currículo para uma vaga. |
| `GET /api/v1/analyses/{analysis_id}/status` | `backend/src/interface/api/routers/analyses.py:421` | Expõe status da análise. |
| `GET /api/v1/analyses/{analysis_id}/result` | `backend/src/interface/api/routers/analyses.py:448` | Expõe resultado da análise. |
| `POST /api/v1/analyses/{analysis_id}/retry` | `backend/src/interface/api/routers/analyses.py:634` | Reprocessa análise em `failed` ou `cancelled`. |
| `POST /api/v1/analyses/stuck` | `backend/src/interface/api/routers/analyses.py:501` | Marca análises travadas como `failed`. |
| `POST /api/v1/conversations/{session_id}/resume` | `backend/src/interface/api/routers/conversation_upload.py:79` | Upload temporário de currículo do Portal 2/chat. |

## 5. Services envolvidos

- `ResumeService`: cria/atualiza currículos internos, valida upload, grava arquivo e consulta status de extração.
- `PublicApplicationService`: valida upload público, cria candidato/currículo/versão, pipeline e análise inicial.
- `upload_validation_service`: política e validação estrutural dos arquivos.
- `FileScanner`/`ClamAVScanner`: scanner opcional, desativado por padrão.
- `AnalysisVersioningService`: idempotência e regras de reanálise.
- `RequestAnalysisUseCase`: criação/reuso de análise, decisão `pending` vs `waiting_extraction`.
- `AnalysisService`: leitura, descarte, matching/scoring, auditoria de descarte.
- `AIProviderCredentialService` e `AIProviderHealthService`: credenciais e saúde/rate limit do provider IA.
- `AIUsageLogService`: logs de uso/custo/tokens.

## 6. Workers/tasks envolvidos

| Task | Queue | Arquivo | Observações |
| --- | --- | --- | --- |
| `process_resume_extraction` | `extraction` | `backend/src/interface/workers/resume_extraction_tasks.py:24` | `max_retries=0`, `soft_time_limit=120`, `time_limit=180`. |
| `process_analysis` | `analysis` | `backend/src/interface/workers/analysis_tasks.py:615` | `max_retries=4`, timeout Celery 120/180s, retry/backoff para falhas temporárias. |
| `match_analysis_to_job` | matching | `backend/src/interface/workers/matching_tasks.py` | Enfileirada após análise concluída quando há `job_id`. |

O dispatcher de extração usa `task_id = resume-extraction:{version_id}` e fila `extraction`. O dispatcher de análise usa `task_id = analysis:{analysis_id}` e fila `analysis`.

## 7. Tabelas/models envolvidos

- `resumes`: metadados do currículo.
- `resume_versions`: arquivo, hash, MIME, `extracted_text`, `extraction_status`, `extraction_error`, `page_count`, `word_count`.
- `analyses`: status, idempotency, retries, task/worker claim, requested_by, job.
- `analysis_results`: campos normalizados da IA, tokens, `raw_llm_response`, `prompt_version_used`.
- `ai_models`: provider/modelo ativo.
- `prompt_templates`: versão e template/prompt cadastrado; o worker atual usa prompt compacto hard-coded com versão derivada.
- `ai_usage_logs`: tokens, provider/modelo, latência e status.
- `candidate_profile_analysis`: perfil extraído/cacheado do candidato.
- `job_profile_analysis`: perfil/cache da vaga.
- `candidate_job_match`: compatibilidade e elegibilidade.
- `candidate_job_scores`, snapshots e factors: score final versionado.
- `audit_logs`: localizado uso para descarte de análise e download de currículo; não localizado audit log abrangente para request/retry/reprocessamento.

## 8. Estados/status encontrados

### Extração de currículo

Status reais:

- `pending`: definido ao criar/uploadar uma versão de currículo.
- `processing`: definido por `_claim_resume_version_for_processing()`.
- `completed`: definido pelo worker após `extract_pdf_text()` bem sucedido.
- `failed`: definido quando contexto, arquivo ou extração falham.

Não localizados para extração: `uploaded`, `waiting_extraction`, `extracted`, `retry_scheduled`, `cancelled`.

### Análise IA

Status reais:

- `waiting_extraction`: análise criada quando o currículo ainda não tem extração pronta.
- `pending`: análise pronta para fila.
- `processing`: worker fez claim.
- `retry_scheduled`: falha temporária/rate limit agendou nova tentativa.
- `completed`: resultado persistido.
- `failed`: falha terminal, falha de extração dependente, timeout/stuck, enqueue failure ou payload inválido.
- `cancelled`: status suportado pelo modelo e retry, mas não foi localizada rota específica de cancelamento nesta auditoria.
- `discarded`: descarte manual com auditoria específica.

Transições conservadoras observadas:

- `waiting_extraction -> pending`: worker de extração conclui e enfileira análise.
- `pending/retry_scheduled/stale processing -> processing`: claim do worker.
- `processing -> completed`: persistência de resultado IA.
- `processing -> retry_scheduled`: falha temporária.
- `processing/pending -> failed`: cleanup/stuck ou falha terminal.
- `failed/cancelled -> pending`: retry manual.

Riscos de inconsistência:

- Retry manual muda para `pending` sem revalidar extração pronta.
- Rate limit excluído da condição de falha final pode manter re-enfileiramento indefinido.
- Extração tem claim atômico, mas não tem retry automático próprio.

## 9. Formatos de arquivo aceitos

Pela configuração padrão `ALLOWED_RESUME_MIME_TYPES`:

- PDF: `application/pdf`
- DOC: `application/msword`
- DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Pelo frontend:

- Candidate portal público informa e aceita `.pdf,.doc,.docx`.
- UI interna/staff em `DocumentsTab` aceita apenas PDF (`accept="application/pdf,.pdf"`) e valida extensão `.pdf`.
- Portal 2/chat informa PDF, DOC ou DOCX.

Limite máximo:

- `MAX_UPLOAD_SIZE_MB = 10`, usado como `settings.max_upload_size_bytes`.

Validações existentes:

- MIME declarado.
- Extensão compatível com MIME.
- Assinatura real por magic bytes/estrutura ZIP.
- PDF com `%PDF`, `%%EOF` próximo do fim e bloqueio de marcadores suspeitos (`/javascript`, `/launch`, `/embeddedfile`).
- DOC/DOCX: assinatura OLE/ZIP e presença de estruturas de DOCX; não foi localizado parser/extrator de texto DOC/DOCX no fluxo principal.

Comportamentos:

- Arquivo inválido: HTTP 422 no fluxo público/interno ou HTTP 400 no upload temporário de conversa.
- Arquivo vazio: rejeitado por `validate_upload()` com "Arquivo vazio".
- PDF protegido/senha/corrompido: tende a falhar em `pdfplumber.open()` e vira erro "PDF inválido, corrompido ou ilegível."
- PDF escaneado: OCR é tentado se nenhum texto seletável foi extraído.
- DOC/DOCX corrompido: tende a ser rejeitado se assinatura/estrutura não bater; se passar validação estrutural, falha depois no worker por ser processado como PDF.

## 10. Estratégia de extração e OCR

Service de extração: `backend/src/infrastructure/pdf/text_extractor.py`.

Bibliotecas:

- PDF: `pdfplumber`.
- OCR: `pdf2image` + `pytesseract`, importados sob demanda.
- DOC/DOCX: não localizado extrator no fluxo principal.

Fluxo:

1. `_extract_with_pdfplumber()` percorre todas as páginas.
2. `page.extract_text()` roda com tolerâncias fixas.
3. `_clean_text()` normaliza NBSP, CRLF, espaços/tabs e múltiplas linhas em branco.
4. Páginas sem texto incrementam `empty_pages`.
5. OCR só roda quando `len(text) == 0`.
6. OCR processa no máximo 5 páginas a 200 DPI com idioma `por+eng`.
7. Se ainda não há texto, a extração falha.

Limitações:

- `MIN_TEXT_CHARS_FOR_SUCCESS = 80` está definido, mas não é usado para acionar OCR ou falha.
- Texto curto, quebrado ou parcialmente extraído pode seguir sem OCR.
- OCR limitado às primeiras 5 páginas.
- Não foi localizada limpeza específica de cabeçalho/rodapé/lixo além da normalização de whitespace.
- Texto bruto e texto limpo não são salvos separadamente; apenas `ResumeVersionModel.extracted_text`.
- Não foi localizada detecção de idioma efetivamente preenchendo `language_detected`.

## 11. Provider/modelo de IA usado

Providers suportados:

- Google/Gemini: `GeminiAdapter`.
- Anthropic/Claude: `ClaudeAdapter`.

Configuração:

- Defaults em settings: `AI_PROVIDER = "google"` e `AI_MODEL_ID = "gemini-2.5-flash"`.
- O fluxo real de análise seleciona `AIModelModel` ativo no banco, não apenas o default de settings.
- Credenciais runtime são buscadas no banco; fallback por ENV ocorre em desenvolvimento.

Prompt:

- O prompt template ativo de tipo `full_analysis` é selecionado, mas o worker constrói um prompt compacto interno em `_build_minimal_user_prompt()`.
- A versão persistida usa `prompt_version_used = "{prompt_version}:gemini_minimal_compact_v2"`.
- O prompt pede JSON puro e campos compactos: `professional_area`, `seniority_level`, `skills`, `experiences`, `education`, `total_experience_months`.

Timeout, retry e logging:

- Chamada IA envolta por `asyncio.wait_for(..., timeout=settings.AI_PROVIDER_TIMEOUT_SECONDS)`.
- Task Celery tem `soft_time_limit=120`, `time_limit=180`.
- Logs de uso gravam provider/model, operação, tokens, latência e falha.
- 429/rate limit e 5xx são classificados como temporários.

## 12. Schema de resposta IA

A resposta da IA é esperada como JSON. O parser:

- aceita JSON puro;
- aceita JSON dentro de markdown fence;
- tenta extrair o primeiro objeto JSON balanceado de texto livre;
- rejeita resposta vazia e resposta sem JSON válido.

Validação:

- Não foi localizado schema Pydantic/Zod/TypedDict estrito validando o payload original do provider.
- `parse_analysis_response()` normaliza o payload para campos internos.
- `_validate_result_fields()` valida a presença dos campos normalizados depois do parser, não a completude do JSON original.

Campos persistidos principais:

- `candidate_summary`
- `seniority_level`
- `total_experience_years`
- `highest_education_level`
- `highest_education_field`
- `strengths`
- `weaknesses`
- `recommendations`
- `keywords`
- `extracted_data`
- tokens, finish reason, prompt chars, `raw_llm_response`, `prompt_version_used`

Não localizado no schema de extração de currículo:

- `reason_codes` obrigatórios.
- `explanation_text` obrigatório.
- `breakdown` obrigatório.

Esses campos aparecem no score/matching final (`candidate_job_scores`), não na resposta bruta de extração IA.

## 13. Como o score é calculado

O score oficial não é retornado diretamente pela IA. A IA gera dados estruturados do currículo; o backend calcula compatibilidade com a vaga.

Fluxo de scoring:

- `AnalysisService._ensure_candidate_profile_analysis()` cria/cacheia perfil do candidato a partir de `AnalysisResultModel`.
- `AnalysisService._ensure_job_profile_analysis()` cria/cacheia perfil da vaga.
- `AnalysisService._match_details_to_job()` compara skills, experiência, senioridade, formação e requisitos da vaga.
- `_compute_skill_scores()` calcula cobertura de skills prioritárias, complementares e eliminatórias.
- Skills podem usar equivalências por `SkillEquivalenceService`.
- Há fallback para extrair evidências do texto bruto do currículo.
- Evidência fraca reduz peso e pode levar a `REVIEW`.
- Skills eliminatórias ausentes levam a `FAIL`.
- Formação/experiência ausentes podem virar `unknown` e `review_manually`, evitando reprovação automática quando a evidência é insuficiente.

Persistência do score:

- `candidate_job_match`: recomendação, matched/missing skills, explicação e elegibilidade.
- `candidate_job_scores`: `final_score`, `decision_suggestion`, `breakdown`, `reason_codes`, `explanation_text`, versão do score e snapshots.

## 14. Guardrails encontrados

Encontrados:

- Upload bloqueia assinatura incompatível, arquivo vazio, arquivo grande e marcadores PDF suspeitos.
- Prompt é bloqueado antes da IA se contiver markdown, tamanho acima do limite ou padrões de prompt injection como "ignore previous instructions", "jailbreak", "system prompt" e `<script`.
- `_remove_sensitive_resume_data()` remove e-mail, CPF e telefone antes de montar o prompt.
- Logs usam `sanitize_log_text()` em alguns caminhos de erro.
- Matching evita reprovação automática por alguns dados ausentes, usando `unknown`/`REVIEW`.

Não localizado:

- Bloqueio amplo de termos sensíveis em currículo.
- Remoção/mascaramento de idade, data de nascimento, religião, raça, gênero, saúde, deficiência, aparência, estado civil, filhos ou endereço antes da IA.
- Instrução explícita no prompt compacto para ignorar critérios discriminatórios.
- Validação impedindo `explanation_text`/resumos de mencionar termos sensíveis no score final.
- Auditoria específica quando termo sensível aparece.
- Testes dedicados de termos sensíveis no fluxo de currículo/análise IA.

## 15. Persistência/auditoria existente

O sistema persiste:

- arquivo em storage local privado;
- metadados, hash e MIME em `resume_versions`;
- texto extraído em `resume_versions.extracted_text`;
- status e erros em `resume_versions.extraction_status/extraction_error`;
- análise e estado de fila em `analyses`;
- resultado normalizado e resposta bruta em `analysis_results`;
- provider/modelo/prompt em `ai_models`, `prompt_templates` e campos do resultado;
- uso de IA em `ai_usage_logs`;
- match e score em tabelas dedicadas.

Auditoria localizada:

- descarte de análise em `AnalysisService._log_discard_audit()`;
- download de currículo por endpoints de candidato;
- logs estruturados em workers.

Não localizado:

- audit log formal para request/retry/reprocessamento de análise;
- comparação lado a lado de análise antiga vs nova;
- mascaramento de `raw_llm_response`;
- histórico explícito de quem pediu reprocessamento além de `requested_by` no registro da análise e logs.

## 16. Como o frontend consome/exibe

Candidate portal público:

- `ApplicationFormPage` recebe currículo na candidatura e informa PDF, DOC ou DOCX até 10 MB.
- `publicApplicationService.apply()` valida apenas tamanho do arquivo antes de enviar.
- `CandidateHomePage` usa `shouldPollAnalysis()` para atualizar candidaturas com `waiting_extraction`, `pending`, `processing` ou `retry_scheduled`.
- `getAnalysisStatusInfo()` mostra labels amigáveis para status de análise.
- `CandidateApplicationDetailPage` exibe o status IA bruto no resumo.

Frontend interno/staff:

- `DocumentsTab` mostra status de extração e status da última análise.
- Upload interno aceita apenas PDF no input e valida extensão `.pdf`.
- Botão "Análise manual" só habilita quando `resume.extraction_status === "completed"`.
- `useExtractionPolling` atualiza status e mostra toast em falha de extração.
- `ScoreTab` exibe score, breakdown, deal-breakers, confiança e feedback quando há resultado.

Limitações de UI:

- UI pública informa DOC/DOCX, mas backend de extração não processa DOC/DOCX.
- Candidate portal mostra `failed` como "Em revisão pela equipe", sem diferenciar falha de arquivo, provider, rate limit final ou payload inválido.
- Detalhe da candidatura mostra status IA bruto.
- Não foi localizado botão de cancelamento de análise.

## 17. Testes existentes

Testes relevantes localizados:

- `backend/tests/integration/test_upload_hardening.py`: valida PDF válido, fake PDF, arquivo vazio, limite de tamanho, path traversal, malware scanner fake e upload público/interno.
- `backend/tests/test_candidate_portal_and_public_analysis.py`: candidatura pública cria análise `waiting_extraction`, não duplica análise em duplicate submit, banco de talentos não cria análise de vaga, extração enfileira análise uma vez, falha de extração marca análise como failed.
- `backend/tests/integration/test_resume_upload_async.py`: fluxo assíncrono de upload/extração.
- `backend/tests/integration/test_analysis_retry_resilience.py`: resiliência de retry, stale/pending/processing e enqueue failure.
- `backend/tests/integration/test_r11_analysis_claim_concurrency.py`: claim concorrente de análise.
- `backend/tests/unit/interface/workers/test_analysis_tasks_retry_resilience.py`: comportamento de retry do worker.
- `backend/tests/unit/infrastructure/ai/test_gemini_json_parser.py`: parsing/adapter Gemini.
- `backend/tests/unit/infrastructure/ai/test_gemini_rate_limit_controls.py`: controles de rate limit Gemini.
- `backend/tests/unit/test_analysis_prompt_minimal.py`: prompt compacto/minimal.
- `backend/tests/unit/test_analysis_safe_logging.py`: logging seguro em análise.
- `backend/tests/unit/test_analysis_request_policy.py`: políticas de request/reuso.
- `backend/tests/unit/test_analysis_scoring.py` e `test_analysis_skill_scoring.py`: scoring/matching.
- `frontend/src/features/candidates/utils/__tests__/analysisStatus.test.ts`: status/labels de análise.
- `candidate-portal/src/services/__tests__/polling.test.ts`: polling de `waiting_extraction`, `pending`, `processing`, `retry_scheduled`.
- `candidate-portal/src/services/__tests__/conversationsService.test.ts`: upload de currículo do chat preserva mensagens seguras do backend.

## 18. Lacunas de teste

Não foram localizados testes dedicados para:

- DOC/DOCX aceito no upload mas falhando no worker de extração principal;
- DOC/DOCX válido extraído com sucesso;
- DOC/DOCX corrompido no fluxo completo;
- PDF protegido por senha;
- PDF escaneado com OCR real;
- dependências de OCR ausentes;
- PDF com texto curto/garbled que deveria acionar OCR;
- OCR limitado a 5 páginas;
- `raw_llm_response` contendo dados sensíveis;
- prompt/resultado contendo idade, nascimento, religião, raça, gênero, saúde, estado civil, filhos ou aparência;
- rate limit sustentado ultrapassando o máximo de retries;
- retry manual de análise cuja extração ainda está failed/vazia;
- validação estrita de schema do payload original da IA;
- diferenciação visual no candidate portal entre falha de arquivo, provider, rate limit e payload inválido.

## 19. Riscos classificados por severidade

### Crítico

- Persistência de `raw_llm_response` sem mascaramento abrangente pode reter dado sensível retornado pelo provider.
- Guardrails antidiscriminatórios abrangentes não foram localizados; a IA pode receber/retornar atributos sensíveis que influenciem explicação ou interpretação.
- Rate limit sustentado pode gerar retry indefinido para `rate_limited`, causando churn de fila e status preso em `retry_scheduled`.

### Alto

- DOC/DOCX são aceitos pela política e pelo candidate portal, mas a extração principal só chama extrator de PDF.
- Retry manual de análise não valida extração pronta antes de re-enfileirar.
- Parser aceita JSON parcial e normaliza defaults, sem schema estrito no payload original da IA.
- OCR só roda quando texto extraído é vazio; PDFs parcialmente legíveis ou quebrados podem seguir para IA com texto ruim.
- Upload temporário de conversa lê o arquivo inteiro em memória antes de validar tamanho.

### Médio

- OCR limitado às primeiras 5 páginas sem sinalização ao usuário.
- Settings `AI_ANALYSIS_MAX_RESUME_CHARS` e `AI_ANALYSIS_MAX_JOB_CHARS` existem, mas o worker usa constantes hard-coded menores.
- Não há separação entre texto bruto e texto limpo extraído.
- UI pública não diferencia causas de falha de análise.
- UI interna aceita apenas PDF enquanto backend/público anunciam DOC/DOCX.
- Audit log formal para request/retry/reprocessamento não foi localizado.

### Baixo

- Nomes `s3_bucket`/`s3_key` persistem mesmo com storage local, podendo confundir operação.
- Candidate detail exibe status IA bruto.
- `MIN_TEXT_CHARS_FOR_SUCCESS` está definido mas não usado.

## 20. Recomendações de próximas fases

1. **FORMAT-SUPPORT-FIX**: alinhar contrato, UI e backend. Ou remover DOC/DOCX dos formatos aceitos, ou implementar extração real DOC/DOCX com testes.
2. **OCR-QUALITY-GUARDS**: definir heurística de texto mínimo/qualidade, OCR parcial, OCR multi-page configurável e testes para PDF escaneado/protegido.
3. **AI-SENSITIVE-DATA-GUARDRAILS**: redigir política antidiscriminatória, sanitizar atributos sensíveis antes da IA, validar saída e impedir explicações sensíveis.
4. **RAW-RESPONSE-PRIVACY**: mascarar ou substituir `raw_llm_response` por armazenamento seguro/restrito, com testes.
5. **RATE-LIMIT-RETRY-CAP**: corrigir limite máximo de retries também para `rate_limited` e criar teste de rate limit sustentado.
6. **ANALYSIS-RETRY-PRECONDITION**: impedir retry de análise sem `resume_versions.extraction_status=completed` e texto presente.
7. **STRICT-AI-SCHEMA**: validar payload original com schema explícito antes de normalizar; separar `unknown` de `none`.
8. **ANALYSIS-AUDIT-LOG**: registrar request/retry/reprocessamento/cancelamento com usuário e contexto.
9. **FRONTEND-STATUS-UX**: diferenciar falha de arquivo, provider, rate limit e payload inválido em staff/candidate portal sem expor erro técnico.
