# PERF-FIX-JOBS-1 - Fluxo de chamadas antes/depois

## Antes

Ao abrir a tela de Vagas, o frontend executava:

- `GET /api/v1/jobs`: listagem paginada principal.
- `GET /api/v1/pipeline/jobs`: resumo global de pipeline para contadores/status operacionais.
- `N x GET /api/v1/jobs/:jobId/ranking`: uma chamada por vaga renderizada na pagina atual.

O fan-out vinha de `useJobsList`, que fazia `Promise.allSettled(jobs.map(...listJobCandidates(job.id, 1, 25)))`. Para uma pagina com 20 vagas, isso podia gerar 22 chamadas iniciais: uma listagem, um resumo global e vinte rankings.

## Depois

Ao abrir a tela de Vagas, o frontend executa:

- `GET /api/v1/jobs`: listagem paginada principal.
- `GET /api/v1/pipeline/jobs`: resumo global de pipeline para contexto operacional basico.
- `0 x GET /api/v1/jobs/:jobId/ranking` no carregamento inicial.

O hook monta `jobOperationalData` com dados agregados do pipeline:

- total de candidatos por vaga;
- contagem por etapa;
- ultima atividade.

Os campos dependentes de ranking detalhado (`strongCandidates` e `topScore`) ficam neutros no carregamento da lista.

## Fan-out removido

- Removido `Promise.allSettled(jobs.map(...listJobCandidates...))` do carregamento inicial de Vagas.
- Removidas chamadas automaticas N por vaga para ranking/candidatos.

## Chamadas sob demanda

O acesso a candidatos/ranking permanece por fluxo explicito:

- abrir o pipeline da vaga;
- chamar `listJobCandidates` por algum detalhe/componente especifico.

`listJobCandidates` agora repassa `page` e `page_size` para o endpoint de ranking, evitando buscar todo o ranking para fatiar localmente.

## Limitacoes

- A tela de Vagas deixa de inferir automaticamente candidatos fortes e melhor score por vaga no carregamento inicial.
- Filtros client-side de `listJobCandidates` (`min_score` e `seniority`) continuam limitados ao conjunto retornado pela pagina atual do ranking.
- Se a UI voltar a exigir metricas por vaga derivadas de ranking, a solucao correta deve ser um endpoint agregado futuro, nao restaurar fan-out no frontend.
