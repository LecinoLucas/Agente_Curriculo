## Testes de regressão

### Pipeline

- [PipelinePage.test.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/__tests__/PipelinePage.test.tsx:984)
  - impede `refreshBoard()` após move simples com mutação otimista;
  - permite reload de segurança quando `board.truncated=true`.
- [PipelineContext.test.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/pipeline/__tests__/PipelineContext.test.tsx:183)
  - impede refetch do board ao abrir/fechar drawer;
  - garante update local de colunas após move;
  - mantém restore local em erro.

### Vagas

- [useJobsList.test.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/features/jobs/hooks/__tests__/useJobsList.test.tsx:138)
  - impede fan-out de `getJobRanking`;
  - impede `listJobCandidates` por vaga no load;
  - mantém paginação sem buscar dados extras para cálculos locais.
- [JobsPage.test.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/__tests__/JobsPage.test.tsx:129)
  - garante que a tela renderiza sem depender de ranking automático;
  - mantém navegação para Pipeline apenas sob demanda.

### Pré-admissão

- [AdmissionCasePage.test.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/__tests__/AdmissionCasePage.test.tsx:915)
  - protege abertura com `overview/documents/events` uma vez;
  - impede reload amplo em approve/reject/request-correction;
  - impede reload de `events` e pacote Protheus em ação de documento;
  - valida fallback de `documents` quando a mutação retorna payload incompleto.

### RAG

- [test_ai_rag_postgres_vector_store.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/tests/unit/test_ai_rag_postgres_vector_store.py:122)
  - protege `LIMIT` no SQL com `pgvector`;
  - protege cap do fallback JSON;
  - protege warning controlado no fallback limitado.
- [test_ai_knowledge_tools.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/tests/unit/test_ai_knowledge_tools.py:33)
  - impede exposição de `vector_json` e `content_hash` em `knowledge.search` e `knowledge.answer`.

## Lacunas restantes

- não há teste com massa grande realista para estimar latência absoluta;
- não há budget automatizado de payload por resposta HTTP;
- Admin/IA usage ainda depende mais de revisão de contrato do que de call-count frontend dedicado.
