# PERF-FIX-JOBS-1 - Proximos passos

## Endpoint agregado futuro

Fase sugerida:

`PERF-FIX-JOBS-2 - Endpoint agregado para metricas resumidas de vagas`

Objetivo: entregar em uma unica resposta, paginada e barata, metricas como candidatos fortes, melhor score, contagem por status e ultima atividade por vaga.

## Cache de metricas

Avaliar cache backend ou materializacao controlada para metricas de vaga que hoje dependem de ranking.

Pontos a validar:

- invalidacao ao mover candidato;
- invalidacao ao recomputar ranking;
- consistencia eventual aceitavel para dashboard/lista.

## Ranking sob demanda

Mapear componentes que chamam `listJobCandidates` e garantir que todos tenham gatilho explicito do usuario ou limite rigido de paginação.

## Performance budget

Definir budget para a tela de Vagas:

- maximo de chamadas iniciais por abertura;
- tempo alvo ate primeira renderizacao util;
- limite de payload inicial;
- limite de vagas por pagina;
- criterio para lazy loading de dados acessorios.
