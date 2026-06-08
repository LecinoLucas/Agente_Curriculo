# PERF-FIX-PIPELINE-1 - Fix Report

## Causa raiz

O Pipeline ja tinha update otimista no `PipelineContext`, mas o `PipelinePage` sempre chamava `refreshBoard()` depois de qualquer mutacao de etapa. O `CandidatePreviewDrawer` tambem sincronizava em duplicidade, chamando `reload()` local e depois `onPipelineChanged`, que no PipelinePage recarregava board/ranking via `triggerRefresh()`.

## Arquivos alterados

- `frontend/src/pages/PipelinePage.tsx`
- `frontend/src/features/candidates/components/CandidatePreviewDrawer.tsx`
- `frontend/src/services/jobsService.ts`
- `frontend/src/pages/__tests__/PipelinePage.test.tsx`
- `frontend/src/features/candidates/components/__tests__/CandidatePreviewDrawer.test.tsx`
- `frontend/src/features/pipeline/__tests__/PipelineContext.test.tsx`
- `.design/perf-fix-pipeline-1/*`

## Decisao tecnica

O movimento bem-sucedido que passa por `PipelineContext.moveCandidateStage` nao recarrega mais o board completo quando o board nao esta truncado. O contexto ja move o card localmente e restaura o snapshot anterior em erro.

`syncAfterStageMutation` passou a aceitar `reloadBoard`. Por padrao ele sincroniza apenas overview aberto e horario de atualizacao; com `reloadBoard=true` ele mantem o fallback completo para fluxos sem update otimista ou falhas.

O `CandidatePreviewDrawer` passou a usar sincronizacao unica:

- com `onPipelineChanged`, chama apenas o callback do pai;
- sem callback, chama `reload()` local.

O normalizador de `getJobPipeline` agora preserva `truncated`, permitindo fallback de reload quando o backend sinaliza board cortado.

## Comportamento antes/depois

Antes:

```text
Move no Kanban -> PATCH -> refreshBoard -> GET board completo
Drawer -> PATCH -> reload overview -> onPipelineChanged -> GET board completo
```

Depois:

```text
Move no Kanban -> PATCH -> sem GET board completo se board nao truncado
Drawer com pai -> PATCH -> callback unico
Drawer sem pai -> PATCH -> reload local unico
```

## Riscos

- Ranking ainda e invalidado em todo movimento pelo `PipelineContext`. Isso foi preservado porque o ranking exibe stage/status; otimizar isso exige patch local do ranking.
- Sem virtualizacao, o Kanban continua renderizando todos os cards retornados por `column.candidates.map`.
- Fluxos diretos fora do contexto otimista ainda usam `refreshBoard()` por seguranca.

## Impacto esperado

- Reduz uma chamada `GET board` por movimento bem-sucedido no Kanban.
- Evita sequencia duplicada de reload no drawer.
- Mantem fallback de consistencia em erro, conflito e board truncado.
- Mantem Oferta e transicoes `final -> offer -> hired` sem alterar regra de negocio.
