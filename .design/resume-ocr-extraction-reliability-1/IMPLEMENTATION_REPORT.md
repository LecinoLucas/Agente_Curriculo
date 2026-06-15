# RESUME-OCR-EXTRACTION-RELIABILITY-1

## Escopo

Fase focada apenas em backend de upload/extracao/OCR/analise. Nao houve alteracao em frontend, ranking/score, Protheus, AI Usage, prompts, modelo ou provider de IA.

## Mapa do fluxo real

Fluxo auditado no caminho principal de candidatura publica:

`upload PDF`
-> `public.py` recebe arquivo
-> `PublicApplicationService` cria `Document` + `ResumeVersion`
-> `RequestAnalysisUseCase` cria `Analysis` com `status="waiting_extraction"` quando o texto ainda nao existe
-> `enqueue_resume_extraction(resume_version_id)`
-> `resume_extraction_tasks.process_resume_extraction`
-> `extract_pdf_text`
-> se extracao produzir texto util: salva `extracted_text`, marca `ResumeVersion.extraction_status="completed"`
-> worker localiza analyses em `waiting_extraction/pending` sem `task_id`
-> analysis volta para `pending`, recebe `task_id="analysis:{id}"`
-> `enqueue_analysis(analysis.id)`
-> `analysis_tasks.process_analysis`
-> IA roda uma unica vez somente com texto valido

Fluxo do upload interno em `resumes.py` tambem cria `ResumeVersion` e enfileira extracao. Ele nao cria automaticamente a analysis; a liberacao para IA depende do fluxo que solicitar analise depois.

## Causa raiz encontrada

O problema principal nao era o guard de IA, e sim a camada de extracao:

1. Quando `pdfplumber` devolvia texto vazio/ruim e o fallback OCR estava indisponivel, a excecao podia ser tratada como falha generica/baixa qualidade, sem distinguir claramente indisponibilidade de OCR.
2. O worker de extracao nao registrava um inicio explicito de extracao nem metadata suficiente para separar:
   - extracao iniciada
   - fallback OCR usado
   - OCR indisponivel
   - falha de extracao
3. Isso abria espaco para diagnostico ruim do incidente e para o usuario enxergar um erro generico posterior, mesmo quando a causa real estava na extracao.

## Arquivos alterados

- `backend/src/infrastructure/pdf/text_extractor.py`
- `backend/src/interface/workers/resume_extraction_tasks.py`
- `backend/tests/integration/test_resume_upload_async.py`
- `backend/tests/unit/test_resume_text_quality.py`

## Comportamento antes/depois

### Antes

- `pdfplumber` era tentado primeiro.
- Existia fallback OCR via `pdf2image` + `pytesseract`.
- Se o texto direto fosse ruim e OCR falhasse/estivesse indisponivel, a sinalizacao era insuficiente e podia parecer apenas baixa qualidade/generic failure.
- Auditoria e logs nao distinguiam bem o ciclo de extracao.

### Depois

- `pdfplumber` continua sendo a primeira tentativa.
- Texto vazio/placeholder/baixa qualidade continua disparando fallback OCR.
- Se OCR estiver indisponivel no ambiente, o erro vira falha controlada de extracao com motivo explicito `ocr_unavailable`.
- Se OCR falhar, a analysis vinculada nao segue para IA; ela fica `failed` com motivo de extracao (`resume_extraction_failed`), nao erro de IA.
- O worker grava `extraction_started`, `extraction_completed` e `extraction_failed`.
- Quando OCR foi realmente usado e funcionou, o worker registra isso em log/auditoria.
- A fila de IA continua bloqueada quando nao ha texto util.

## Dependencias OCR no Docker

O backend Docker local ja instala os binarios necessarios para OCR:

- `poppler-utils`
- `tesseract-ocr`
- `tesseract-ocr-por`

Isso esta no `backend/Dockerfile`, que e o Dockerfile usado por `docker-compose.local.yml`.

## Bootstrap oficial em base Docker limpa

O bootstrap oficial continua sendo `backend/scripts/bootstrap_dev.py`.

Ele chama o seed de desenvolvimento que garante template ativo `full_analysis` via `backend/scripts/seed_dev_admin.py`.

Nao foi alterado nenhum seed nem criado migration nesta fase.

## Perguntas obrigatorias

1. Upload de PDF sempre cria versao/documento corretamente?
   Sim. O fluxo auditado cria `Document` e `ResumeVersion` antes de enfileirar extracao.

2. Upload sempre enfileira extracao?
   Sim. Tanto `resumes.py` quanto `public.py` chamam `enqueue_resume_extraction(...)` apos persistir a versao.

3. A extracao atual usa `pdfplumber` primeiro?
   Sim.

4. Existe fallback OCR para PDF escaneado/imagem?
   Sim, via `pdf2image` + `pytesseract`.

5. O fallback OCR esta instalado/disponivel no Docker?
   Sim, pelos pacotes do `backend/Dockerfile`.

6. Se `pdfplumber` retorna texto vazio, o fallback OCR roda?
   Sim, tambem para texto placeholder/baixa qualidade.

7. Se OCR falha, qual status fica salvo?
   `ResumeVersion.extraction_status="failed"`.

8. Se OCR falha, a analysis fica `failed`, `waiting_extraction` ou `extraction_failed`?
   A analysis vinculada fica `failed` com `failure_reason="resume_extraction_failed"` e `provider_error_type="resume_extraction_failed"`. Nao fica presa em `waiting_extraction`.

9. A analise IA e re-enfileirada automaticamente quando a extracao conclui?
   Sim. O worker move analyses elegiveis para `pending`, define `task_id` e chama `enqueue_analysis(...)`.

10. O worker de extracao limpa `task_id/claims` corretamente?
   `ResumeVersion` nao possui claim/task_id proprio. O worker de extracao so libera analyses sem `task_id`; a limpeza de claim/task do lado da analysis continua no worker de analysis, ja corrigido na fase anterior.

11. O worker de extracao gera audit event claro?
   Sim. Agora ha `extraction_started`, `extraction_completed` e `extraction_failed`.

12. Logs diferenciam `extraction_started`, `extraction_completed`, `extraction_failed`, `ocr_fallback_used`, `ocr_unavailable`?
   Sim, apos esta fase.

13. Dockerfile/backend instala dependencias necessarias para OCR?
   Sim.

14. Banco Docker limpo recebe seed/template `full_analysis` correto pelo bootstrap oficial?
   Sim, pelo `bootstrap_dev.py` que executa `seed_dev_admin.py`.

15. Existe algum script legado de bootstrap que ainda pode ser usado errado?
   O caminho correto e `bootstrap_dev.py`. Nesta fase nao foi encontrado ajuste obrigatorio de codigo; o relatorio apenas reforca o bootstrap oficial para evitar uso manual incompleto.

## Testes executados

- `cd backend && python3 -m compileall src tests` -> OK
- `cd backend && ./.venv/bin/python -m pytest tests/integration/test_resume_upload_async.py -q` -> `9 passed`
- `cd backend && ./.venv/bin/python -m pytest tests/integration/test_analysis_retry_resilience.py -q` -> `28 passed`
- `cd backend && ./.venv/bin/python -m pytest tests/unit/test_smart_refresh_use_case.py -q` -> `46 passed`
- `cd backend && ./.venv/bin/python -m pytest tests/unit/test_resume_text_quality.py -q` -> `12 passed`
- `cd backend && ./.venv/bin/python -m pytest tests/integration/test_worker_tasks.py -q` -> `12 passed`

Coberturas adicionadas/ajustadas nesta fase:

- upload publico com PDF textual conclui extracao e libera analysis
- upload publico com PDF sem texto util usa fallback OCR e libera analysis
- OCR indisponivel marca falha controlada de extracao e nao enfileira IA
- contrato unitario da falha `ocr_unavailable`

## Confirmacoes

- OCR/pdf extraction foi corrigido/validado no backend.
- IA nao e chamada sem texto util.
- Erro de OCR nao vira erro de IA.
- `waiting_extraction` continua aguardando extracao; nao vai para IA antes da hora.
- Quando a extracao conclui com texto valido, a analysis e re-enfileirada automaticamente.
- Quando a extracao falha, a analysis vinculada nao fica presa sem explicacao.
- Frontend nao foi alterado.
- Ranking/score nao foram alterados.
- Protheus nao foi alterado.

## Pendencias reais

- A validacao manual completa em container limpo com `docker compose ... down -v`, `up --build`, bootstrap e upload real de PDF nao foi executada nesta fase. O codigo, Dockerfile e bootstrap oficial foram auditados e os testes automatizados cobrindo o fluxo passaram, mas a prova manual em ambiente Docker continua recomendada.
