## Budgets por tela e fluxo

| Tela/Fluxo | Budget de chamadas | Budget de payload/limite | Chamadas proibidas | Fallback permitido | Teste que cobre |
| --- | --- | --- | --- | --- | --- |
| Pipeline board inicial | 1 `GET board` por vaga/contexto | `PIPELINE_BOARD_MAX_ROWS` com `truncated` | reload automático duplicado | reload manual e reload pós-erro | `PipelineContext`, `PipelinePage` |
| Pipeline move simples | 1 `PATCH` | sem `GET board` completo | refetch completo após sucesso simples | `PATCH` + reload se erro/conflito ou `board.truncated=true` | `PipelinePage`, `PipelineContext` |
| Vagas inicial `/vagas` | 1 listagem principal + 1 resumo agregado permitido | sem ranking por vaga no load | `getJobRanking` em fan-out, `listJobCandidates` por vaga | resumo operacional vazio se agregação falhar | `useJobsList`, `JobsPage` |
| Ranking sob demanda em Vagas | 0 no carregamento inicial | 1 chamada sob demanda | preload silencioso de ranking | n/a | `PipelinePage`, `useJobsList` |
| Pré-admissão abertura | 1 `overview` + 1 `documents` + 1 `events` | slices separadas | chamadas duplicadas por efeito/reload global | recarregar tudo só no botão manual | `AdmissionCasePage` |
| Pré-admissão ação de documento | 1 `PATCH` + 1 `overview` | `documents` só fallback | `events` e Protheus reload por default | reload `documents` quando resposta incompleta | `AdmissionCasePage` |
| RAG pgvector | top-k no SQL | `LIMIT` no SQL | materializar base inteira em Python | n/a | `test_ai_rag_postgres_vector_store.py` |
| RAG JSON fallback | teto defensivo `JSON_FALLBACK_CANDIDATE_LIMIT=1000` | janela prática `min(1000, limit * 20)` | varredura sem teto | warning `rag_vector_search_json_fallback_limited` | `test_ai_rag_postgres_vector_store.py` |
| `knowledge.answer` | limite de chunks conforme request/settings | máximo controlado para síntese | expor `vector_json`, `embedding`, `content_hash` | resposta degradada com warnings | `test_ai_knowledge_tools.py`, `test_ai_rag_answer_service.py` |
| Admin IA usage | resumo agregado + últimas chamadas limitadas | sem prompts/respostas brutas | endpoints pesados repetidos sem necessidade | erro controlado sem stack trace | cobertura atual de status/usage |

## Regras proibidas

- fan-out de ranking/candidatos por vaga no carregamento inicial;
- reload completo do Pipeline após mutação simples bem-sucedida;
- reload de `events`/Protheus em ação de documento da pré-admissão;
- retrieval RAG sem `LIMIT` no banco ou sem teto no fallback;
- exposição de `embedding`, `vector_json`, `content_hash`, prompt bruto ou resposta bruta.
