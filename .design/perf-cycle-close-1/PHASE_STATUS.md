| Fase | Status | Commit? | Validação | Observação |
| --- | --- | --- | --- | --- |
| `PERFORMANCE-AUDIT-2` | Concluída | Não isolado neste recorte | Documentação em `.design/performance-audit-2/` | Mapeou gargalos e plano; não corrigiu comportamento. |
| `PERF-FIX-PIPELINE-1` | Concluída | `5aa0a792` | Testes de `PipelinePage` e `PipelineContext` | Removeu reload redundante; reload de segurança ficou preservado. |
| `PERF-FIX-JOBS-1` | Concluída | `c650d0f2` | `JobsPage`, `useJobsList`, build | Removeu fan-out no load inicial; ranking segue sob demanda. |
| `PERF-FIX-PREADMISSION-1` | Concluída | `e2b77813` | `AdmissionCasePage`, build | Atualização local com fallback seguro para `documents`. |
| `PERF-FIX-RAG-1` | Concluída | `5954bb9c` | testes unitários RAG/Knowledge | Passou a preferir `pgvector`; fallback JSON ganhou teto defensivo. |
| `PERF-OBSERVABILITY-1` | Concluída | `e8b95792` | call-count frontend + testes RAG/Pipeline | Consolidou budgets, regressões e logs leves. |
| `PERF-HEALTH-UI-1` | Concluída | `7081292d` | `SystemHealthPage`, `AdminPage`, build | Adicionou aba `Performance` em `/admin/health`, sem rota nova. |

### Estado do Git no início deste fechamento

- branch: `save/behavioral-ai-and-wips`
- `git status --short`: sem pendências antes da criação desta documentação
- últimos commits relevantes:
  - `7081292d feat(admin): add performance budgets tab to system health`
  - `e8b95792 test(perf): add budgets and timing observability`
  - `5954bb9c perf(rag): limit JSON fallback and prefer pgvector search`
  - `e2b77813 perf(admission): optimize pre-admission workspace with local document updates`
  - `c650d0f2 perf(jobs): optimize jobs list candidate payload and add test coverage`
  - `5aa0a792 perf(pipeline): avoid redundant board reload after candidate moves`

### Observação sobre commits fora do núcleo do ciclo

- `274eea4f fix(pre-admission): prevent open action without admission case` fecha contrato crítico de `hired -> pre_admission`, mas é correção funcional adjacente, não fase central de performance.
- `5e195acd perf(pipeline): implement optimistic UI updates for stage changes and interview scheduling` e `a01a462f fix(pipeline): restore 'finalizado' column ...` indicam continuidade de ajustes no Pipeline após a fase base.
