# Relatório de Correção Visual do Pipeline (Fase PERF-FIX-PIPELINE-1B)

## Problema Identificado
Após a fase PERF-FIX-PIPELINE-1 (que removeu o `refreshBoard()` constante para reduzir os reloads da página após uma mutação de etapa do candidato), surgiu uma regressão visual de UX:
Quando um usuário movia um candidato a partir do `CandidatePreviewDrawer` (gaveta de perfil rápido) ou ao agendar uma entrevista, a visualização da tela não sofria update otimista local. Isso ocorria porque os componentes consumiam o `pipelineService` de forma isolada, ignorando o mecanismo de cache local implementado no `PipelineContext`. Como resultado, a ação de mover a etapa terminava, mas o card do candidato no Kanban permanecia inalterado, e os contadores da página mantinham valores defasados, até que ocorresse uma atualização completa no carregamento ou navegação.

Adicionalmente, havia um erro reportado de ausência visual da coluna "Finalizado" devido a um filtro estrito no `PipelinePage`.

## Solução Implementada
A solução se dividiu em duas abordagens principais:

1. **Restauração da Coluna Finalizado:** A remoção do `.filter` na lista de agrupamento permitiu o aparecimento de cards para os estágios "admitted" e "rejected" caso desejado.
2. **Desacoplamento via Contexto (State Optimistic Updates):**
   - No `PipelineContext.tsx`: Ampliou-se a assinatura do método `moveCandidateStage` para aceitar opções estendidas (reason, notes) sem a necessidade de expor diretamente o hook para componentes complexos.
   - Criou-se o novo método `scheduleCandidateInterview` diretamente no Context, abstraindo a mutação síncrona visual que ocorre após o agendamento de uma entrevista (já que isso também representa um movimento de etapa na arquitetura otimista).
   - No `CandidatePreviewDrawer.tsx` e `PipelinePage.tsx`: Substituíram-se as chamadas diretas do `pipelineService.moveCandidateStage` e `pipelineService.schedulePipelineInterview` pelas funções expostas do Context (`moveCandidateStage` e `scheduleCandidateInterview`). Isso acoplou essas ações ao estado local otimista de forma global, garantindo que "arrastar para agendar", "reprovar", e "avançar candidato" todas acionem a movimentação imediata (instant feedback) do card para as suas respectivas colunas no Kanban sem depender de recargas (fetch overhead).

## Impacto na Performance e UX
Ao realizar as mudanças, as chamadas diretas deixaram de sobreescrever a intenção do hook central, garantindo:
1. Zero reloads forçados da página nos fluxos padrão (`syncAfterStageMutation` deixou de ser chamado com `reloadBoard: true` para todas as finalizações de agendamento).
2. Atualização em *O(1)* na árvore do Kanban: O React re-renderiza eficientemente a árvore de Colunas (usando `moveBoardCandidate`) apenas para as colunas impactadas.
3. Consistência: O botão "Avançar" na gaveta de pré-visualização sincroniza o painel instantaneamente.
