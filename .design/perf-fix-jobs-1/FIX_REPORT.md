# PERF-FIX-JOBS-1 - Relatorio de correcao

## Causa raiz

`frontend/src/features/jobs/hooks/useJobsList.ts` carregava dados operacionais da lista de Vagas combinando o resumo global de pipeline com uma busca de candidatos/ranking para cada vaga da pagina. Essa estrategia criava fan-out linear no carregamento inicial e amarrava a lista a dados acessorios.

Tambem havia desperdicio em `frontend/src/services/jobsService.ts`: `listJobCandidates` chamava `getJobRanking(jobId)` sem paginação e depois fatiava localmente.

## Arquivos alterados

- `frontend/src/features/jobs/hooks/useJobsList.ts`
- `frontend/src/services/jobsService.ts`
- `frontend/src/features/jobs/hooks/__tests__/useJobsList.test.tsx`
- `frontend/src/pages/__tests__/JobsPage.test.tsx`
- `frontend/src/services/__tests__/jobsService.test.ts`
- `.design/perf-fix-jobs-1/`

## Decisao tecnica

Foi mantida a chamada agregada `pipelineService.listPipelineJobs(true)` porque ela fornece contadores operacionais ja usados pela lista sem multiplicar chamadas por vaga.

Foi removida a busca automatica de candidatos/ranking por vaga no carregamento inicial. A lista continua exibindo dados essenciais da vaga e contexto de pipeline, enquanto ranking/candidatos ficam para interacao explicita.

`listJobCandidates` passou a chamar `getJobRanking(jobId, { page, pageSize })`, preservando o contrato existente sem alterar backend.

## Impacto esperado

Para uma pagina com 20 vagas, o carregamento inicial deixa de fazer aproximadamente:

- antes: `GET /jobs` + `GET /pipeline/jobs` + `20 x GET /jobs/:id/ranking`;
- depois: `GET /jobs` + `GET /pipeline/jobs`.

Isso reduz latencia percebida, carga no backend de ranking e trabalho de serializacao/renderizacao no frontend.

## Riscos restantes

- A priorizacao visual deixa de considerar `strongCandidates` e `topScore` no carregamento inicial.
- A tela ainda depende de `GET /pipeline/jobs` para contexto operacional global.
- Se o produto precisar de metricas resumidas por vaga com score/ranking, deve ser criada uma fase backend com endpoint agregado.
