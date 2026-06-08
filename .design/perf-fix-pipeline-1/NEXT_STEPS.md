# PERF-FIX-PIPELINE-1 - Next Steps

## PERF-FIX-PIPELINE-2 - Virtualizacao do Kanban

Motivo:

- `KanbanColumn` continua renderizando todos os cards retornados com `column.candidates.map`.
- O backend limita o board por `PIPELINE_BOARD_MAX_ROWS`, mas ate 500 cards ainda podem entrar no DOM.

Proposta:

- Virtualizar cards por coluna.
- Medir altura variavel ou padronizar altura de card.
- Preservar drag/drop e acessibilidade.

## Ranking invalidation granular

Motivo:

- `PipelineContext.moveCandidateStage` ainda chama `invalidateRanking()` em todo movimento.
- Ranking exibe stage/status, entao remover sem patch local pode deixar painel desatualizado.

Proposta:

- Atualizar localmente a entrada do ranking quando apenas stage/status muda.
- Recarregar ranking apenas quando score/freshness/matching mudarem.
- Adicionar testes de call-count para painel de ranking aberto.

## Overview parcial

Motivo:

- O overview completo ainda pode ser recarregado quando candidato aberto muda de etapa.

Proposta:

- Usar resposta de `PATCH stage` para patch local do overview quando suficiente.
- Recarregar overview completo apenas em transicoes com required_action, pre-admission ou entidades derivadas.

## Performance budget

Proposta:

- Budget para movimento simples: 1 `PATCH`, 0 `GET board`, 0 `GET ranking` automatico.
- Budget para movimento com drawer aberto: 1 `PATCH`, no maximo 1 sync de overview.
- Budget para conflito/erro: 1 `PATCH`, 1 `GET board` fallback.
- Budget para board truncado: 1 `PATCH`, 1 `GET board` fallback.

## Testes futuros

- Teste com board `truncated=true` garantindo reload em sucesso.
- Teste com ranking aberto garantindo comportamento esperado quando a fase de ranking granular for implementada.
- Teste E2E com massa de 500 candidatos para medir tempo de interacao e render.
