## Resumo executivo

O ciclo de performance fechou os principais gargalos identificados em `PERFORMANCE-AUDIT-2` sem alterar regra de negócio. O foco foi reduzir fan-out, reloads amplos e custos lineares em fluxos críticos, depois reforçar observabilidade leve e cobertura de regressão.

## O que o ciclo resolveu

- `Pipeline`: removeu reload redundante após movimentação simples e preservou reload de segurança para erro, conflito e `board.truncated`.
- `Vagas`: removeu fan-out de ranking/candidatos no carregamento inicial; ranking ficou sob demanda.
- `Pré-admissão`: reduziu reload amplo após ações de documento; `events` e `Protheus` deixaram de recarregar sem necessidade.
- `RAG`: passou a preferir `pgvector` com `ORDER BY/LIMIT` no banco e limitou o fallback JSON.
- `Observabilidade`: consolidou budgets, testes de call-count e logs leves de timing.
- `Health UI`: expôs budgets e cobertura por teste em `/admin/health`, sem criar rota nova.

## Impacto esperado

- menor custo de rede e renderização nas telas mais usadas;
- menor risco de regressão silenciosa por reintrodução de fan-out ou refetch global;
- leitura operacional mais clara do estado de performance, mesmo sem métricas runtime agregadas.

## O que não foi resolvido

- não há métrica agregada em tempo real por fluxo crítico;
- o Kanban ainda não é virtualizado;
- o fallback JSON do RAG segue menos preciso que `pgvector`;
- o drawer/overview de candidato ainda não passou por fase dedicada de redução de reload agregado;
- validação manual de UX do Pipeline após avanço de candidato ainda não está consolidada neste fechamento.
