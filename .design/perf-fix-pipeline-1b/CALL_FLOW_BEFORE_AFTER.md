# Fluxo de Chamadas e Atualizações (Antes vs Depois)

## Cenário 1: Avançar Etapa pelo CandidatePreviewDrawer

### Antes (Pipeline Desconectada)
1. Usuário clica em "Avançar para fase X" no drawer.
2. `CandidatePreviewDrawer` invoca `pipelineService.moveCandidateStage(...)` com a chamada da API direta.
3. Se sucesso, invoca o callback `onPipelineChanged()`.
4. `PipelinePage` aciona o callback `onPipelineChanged` e realiza `syncCandidateOverview()` (Fetch GET /overview).
5. **Impacto Visual:** O Drawer é atualizado com o novo `stage`, mas o Kanban de fundo (Board) não percebe a mutação. O Card do Candidato continua visualmente preso na coluna antiga.

### Depois (Otimização Integrada)
1. Usuário clica em "Avançar para fase X" no drawer.
2. `CandidatePreviewDrawer` invoca `moveCandidateStage(...)` do *PipelineContext*.
3. O Context aplica **Instant Optimistic Update** no state global `board` (move o card visualmente para a nova coluna) usando `moveBoardCandidate` sem refresh do servidor.
4. O Context efetua a chamada da API `pipelineService.moveCandidateStage(...)`.
5. Se sucesso, o drawer invoca `onPipelineChanged()`, e apenas o overview do candidato continua sendo sincronizado. 
6. **Impacto Visual:** Drawer atualiza e o Kanban atualiza simultaneamente sem NENHUM fetch da lista principal.

## Cenário 2: Agendamento de Entrevista (Drag & Drop ou Drawer)

### Antes (Full Reload)
1. Usuário aciona o agendamento de uma entrevista e submete o formulário.
2. `PipelinePage` invoca `pipelineService.schedulePipelineInterview(...)`.
3. Se sucesso, `PipelinePage` invoca `syncAfterStageMutation` com parâmetro `{ reloadBoard: true }`.
4. **Impacto Visual:** Há um delay notório. A página solicita todo o payload das colunas do Kanban novamente, redesenha as posições e o candidato surge na coluna da entrevista.

### Depois (Local Mutation)
1. Usuário aciona o agendamento e submete o formulário.
2. `PipelinePage` (ou `CandidatePreviewDrawer`) invoca o recém implementado `scheduleCandidateInterview(...)` do *PipelineContext*.
3. O Context aplica **Instant Optimistic Update** movendo a etapa local do candidato (pois a entrevista define um move explícito para a respectiva coluna HR/Tech).
4. O Context chama a API via `pipelineService.schedulePipelineInterview(...)`.
5. Em caso de sucesso, `PipelinePage` apenas executa `syncAfterStageMutation` normal, sem `reloadBoard: true`. 
6. **Impacto Visual:** Mutação em *O(1)*. Card reage instantaneamente pulando de coluna, sem loader obstrutivo ou chamadas pesadas.
