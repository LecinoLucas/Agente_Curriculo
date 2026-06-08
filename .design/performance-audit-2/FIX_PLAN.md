# PERFORMANCE-AUDIT-2 - Plano de Correcao

## Fase 1 - Reduzir reloads do Pipeline

Objetivo:

- Evitar GET completo do board apos move quando a atualizacao otimista ja refletiu o estado correto.

Proposta:

- Trocar `syncAfterStageMutation` para sync seletivo: atualizar apenas candidate overview aberto e metadados necessarios.
- Manter `refreshBoard()` apenas para casos bloqueados, erro recuperavel, inconsistencia ou acao que altera mais de um candidato.
- Adicionar testes que contam chamadas a `refreshBoard`/`getJobPipeline` em drag/drop e drawer.

Risco:

- Baixo/medio. Precisa preservar rollback em erro e consistencia quando backend retorna stage diferente do solicitado.

## Fase 2 - Otimizar resumo operacional de Vagas

Objetivo:

- Remover fan-out de ranking por vaga na pagina de Vagas.

Proposta:

- Criar ou reaproveitar endpoint/resumo backend que entregue `totalCandidates`, `stageCounts`, `latestActivity`, `strongCandidates` e `topScore` por job em lote.
- Enquanto endpoint nao existir, corrigir helper para repassar `page_size` ao `getJobRanking` e limitar chamada apenas quando o dado for realmente visivel.
- Testar que a pagina com 20 vagas nao dispara 20 rankings por render inicial.

Risco:

- Medio se criar contrato novo; baixo se apenas corrigir uso de `page_size`, mas isso nao elimina fan-out.

## Fase 3 - RAG com ranking no banco

Objetivo:

- Eliminar similarity search linear em Python.

Proposta:

- Migrar embeddings para coluna `vector(N)` real quando pgvector estiver disponivel.
- Usar operador de distancia do pgvector (`<=>`) com `ORDER BY` e `LIMIT` no SQL.
- Manter fallback JSONB apenas para dev/test e registrar warning operacional.
- Adicionar teste com massa sintetica para garantir que a query aplica limite antes de materializar todos os embeddings.

Risco:

- Medio/alto por envolver migration e validacao de dimensao dos embeddings. Deve ser fase propria.

## Fase 4 - Pre-admissao com atualizacao granular

Objetivo:

- Reduzir chamadas repetidas em `AdmissionCaseWorkspacePanel`.

Proposta:

- Consolidar carregamento inicial em `workspace` unico ou usar cache por secao com invalidacao seletiva.
- Apos aprovar/rejeitar documento, atualizar item/documento retornado e recarregar apenas resumo se necessario.
- Testar numero de chamadas apos approve/reject/upload.

Risco:

- Medio. A tela combina checklist, documentos, eventos e status de exportacao; invalidacao errada pode mostrar readiness desatualizado.

## Fase 5 - Candidate overview/drawer

Objetivo:

- Evitar recarregar overview completo em todo move quando o retorno do move contem informacao suficiente.

Proposta:

- Usar resposta de `moveCandidateStage` para patch local do overview.
- Manter refetch forçado apenas para transicoes que criam entidades relacionadas, como pre-admissao.
- Adicionar teste de chamada unica para overview apos move simples.

Risco:

- Baixo/medio. Cuidar de casos em que required_action muda.

## Fase 6 - Protheus como job assicrono

Objetivo:

- Evitar bloquear request HTTP em envio real.

Proposta:

- Quando envio real sair de homologacao controlada, enviar via fila com status de tentativa e polling/refresh no frontend.
- Preservar idempotency key e auditoria existente.

Risco:

- Medio. Envolve UX/contrato de status e nao deve ser feito junto com otimizacoes do Pipeline.

## Fase 7 - Budgets e testes de performance

Objetivo:

- Transformar achados em regressao automatizada.

Proposta:

- Testes frontend de numero de chamadas por interacao critica.
- Testes backend de limite SQL/materializacao para board, ranking e RAG.
- Seeds locais de massa: 500 candidatos por vaga, 100 vagas, 10k chunks RAG.
- Registrar budgets: board initial load, move candidato, abrir drawer, abrir Vagas, pergunta RAG.

Risco:

- Baixo. Exige disciplina para manter testes deterministicos.
