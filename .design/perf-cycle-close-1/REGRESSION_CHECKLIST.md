## Pipeline

- [x] movimento simples não recarrega board completo sem necessidade
- [x] `board.truncated` permite reload de segurança
- [x] gates de `final -> offer -> hired -> pre_admission` seguem cobertos por `test_pipeline_stage_gates.py`
- [ ] confirmação manual de UX visual após avanço de candidato ainda pendente neste fechamento

## Vagas

- [x] listagem inicial não chama ranking N vezes
- [x] ranking e candidatos seguem sob demanda
- [x] paginação da lista foi preservada

## Pré-admissão

- [x] ação de documento não recarrega `events` sem necessidade
- [x] ação de documento não recarrega painel Protheus
- [x] `overview` e `documents` seguem atualização local com fallback seguro
- [x] fallback existe quando a resposta da ação é incompleta

## RAG

- [x] `pgvector` usa `LIMIT` no SQL
- [x] fallback JSON tem teto defensivo
- [x] warning controlado existe (`rag_vector_search_json_fallback_limited`)
- [x] `knowledge.search` e `knowledge.answer` não expõem `vector_json`, `embedding` ou `content_hash`

## Health UI

- [x] aba `Performance` existe em `/admin/health`
- [x] não existe rota nova
- [x] UI diferencia `budget documentado` de `tempo real indisponível`
- [x] aba `IA / Tokens` continua funcionando
