# PERF-FIX-PIPELINE-1 - Call Flow Before/After

## Fluxo antes

### Drag/drop ou avanço pelo PipelinePage

1. Usuario movia candidato no Kanban.
2. `PipelineContext.moveCandidateStage` aplicava update otimista no board local.
3. Frontend chamava `PATCH /api/v1/pipeline/{jobId}/{candidateId}/stage`.
4. Em sucesso, `PipelinePage.syncAfterStageMutation` chamava `refreshBoard()`.
5. Isso disparava novo `GET /api/v1/pipeline/{jobId}` mesmo quando o board local ja estava consistente.
6. Se o candidato estava aberto no drawer, tambem chamava `syncCandidateOverview(candidateId)`.

### CandidatePreviewDrawer

1. Drawer chamava `PATCH /api/v1/pipeline/{jobId}/{candidateId}/stage`.
2. Em sucesso, chamava `reload()`.
3. Depois chamava `onPipelineChanged?.()`.
4. No PipelinePage, `onPipelineChanged` chamava `triggerRefresh()`, que recarregava board e ranking quando ranking estava visivel.

Sequencia possivel:

```text
PATCH stage
GET candidate overview
GET board completo
GET ranking, se painel visivel
```

## Fluxo depois

### Movimento otimista pelo PipelinePage

1. Usuario move candidato no Kanban.
2. `PipelineContext.moveCandidateStage` aplica update otimista.
3. Frontend chama `PATCH stage`.
4. Em sucesso, nao chama `refreshBoard()` automaticamente.
5. Se o candidato movido esta aberto no drawer, sincroniza apenas `candidate overview`.
6. `lastUpdated` e atualizado localmente.

Sequencia esperada:

```text
PATCH stage
sync overview apenas se candidato aberto
sem GET board completo automatico
```

### CandidatePreviewDrawer

Com callback de pai:

```text
PATCH stage
onPipelineChanged()
sem reload() local duplicado
```

Sem callback de pai:

```text
PATCH stage
reload() local do overview
```

## Chamadas removidas

- `GET /api/v1/pipeline/{jobId}` apos movimento bem-sucedido com update otimista e board nao truncado.
- `reload() + onPipelineChanged()` em sequencia no drawer; agora apenas uma fonte de sincronizacao e usada.
- `triggerRefresh()` do PipelinePage deixou de ser callback do drawer, removendo refresh de board/ranking nesse caminho.

## Chamadas mantidas

- `PATCH /api/v1/pipeline/{jobId}/{candidateId}/stage`.
- `syncCandidateOverview(candidateId)` quando o candidato movido esta aberto.
- `refreshBoard()` manual pelo botao Atualizar.
- `refreshBoard()` apos adicionar candidato pela busca.
- `refreshBoard()` em fluxos que nao passam pelo update otimista do contexto, como agendamento, rejeicao e force submit.

## Quando reload ainda ocorre

- Erro generico da mutation.
- Bloqueio/conflito `409`.
- Board truncado (`truncated=true`), porque a consistencia local pode nao representar todo o conjunto.
- Acoes que nao usam `PipelineContext.moveCandidateStage`, como agendamento de entrevista, rejeicao e force submit.
- Refresh manual do usuario.

## Ranking

`PipelineContext.moveCandidateStage` continua chamando `invalidateRanking()`. A etapa aparece no payload de ranking, entao remover essa invalidacao exige uma fase propria com patch local do ranking ou criterio mais fino por tipo de movimento.
