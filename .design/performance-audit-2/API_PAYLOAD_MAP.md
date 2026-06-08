# PERFORMANCE-AUDIT-2 - API/Payload Map

## Pipeline

`GET /api/v1/pipeline/jobs`

- Sem paginacao.
- Retorna resumo de todas as vagas publicadas por padrao.
- Com `include_closed=true`, pode incluir historico maior.
- Backend agrega stage counts para todos os jobs ativos.

`GET /api/v1/pipeline/{job_id}`

- Retorna todas as macro/etapas e candidatos ate `PIPELINE_BOARD_MAX_ROWS`.
- Limite atual: `500`.
- Campos por card incluem score, skills, flags de requisitos, status behavioral, entrevista e scorecard.
- `truncated=true` informa corte.

`PATCH /api/v1/pipeline/{job_id}/{candidate_id}/stage`

- Retorna dados suficientes para patch basico do candidato.
- Hoje a UI ainda pode recarregar board completo apos sucesso.

`GET /api/v1/jobs/{job_id}/ranking`

- Paginado, default `page_size=20`, max `100`.
- Usado diretamente no painel de ranking e indiretamente na pagina de Vagas.

## Candidatos

`GET /api/v1/candidates`

- Paginado, max `page_size=100`.

`GET /api/v1/candidates/summaries`

- Paginado, max `page_size=100`.
- Query otimizada para enriquecer apenas a pagina atual.

`GET /api/v1/candidates/{id}/overview`

- Agrega candidato, curriculos, matches, pipeline entries e analise atual.
- Alto valor de UX, mas deve ser evitado como reload automatico desnecessario.

## Vagas

`GET /api/v1/jobs`

- Paginado.
- Backend tambem retorna summary de status.

Risco frontend:

- A pagina de Vagas chama ranking por vaga para montar dados operacionais.

## Pre-admissao

`GET /api/v1/pre-admission/cases/{case_id}/overview`

- Carrega caso e checklist.

`GET /api/v1/pre-admission/cases/{case_id}/documents`

- Carrega documentos/checklist.

`GET /api/v1/pre-admission/cases/{case_id}/events?page=1&page_size=20`

- Eventos paginados.

Risco frontend:

- Abertura faz tres chamadas paralelas.
- Acoes recarregam duas ou tres secoes completas.

## RAG/Assistente

`POST /api/v1/ai/assistant/read-only`

- Deterministico/read-only.
- Monta services por request.

RAG retrieval:

- Busca todos os embeddings ativos elegiveis e calcula similaridade em Python.
- Limite de chunks nao limita a query inicial.

## Protheus

Endpoints de pacotes admissional/ERP:

- Dry-run/mock/homolog-send separados.
- Envio real tem gates de seguranca.
- Quando real habilitado, HTTP externo ocorre no request.
