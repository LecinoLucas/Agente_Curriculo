# Next Steps - AI Assistant Job Presenter

## Fase `AI-JOB-TOOLS-ENRICH-1` (Backend)

Para que o resumo seja 100% completo, o backend precisa enriquecer o payload da tool `get_job_summary`:

1. **Campos Adicionais:** Retornar `priority` e `working_hours` (Jornada) explicitamente.
2. **Contagem de Vagas:** Calcular e retornar `vacancies_count` somando o `openings_count` das filiais (job_units).
3. **Metadados de Fonte:** Se possível, retornar `source_type: "database"` para o frontend usar labels ainda mais precisos.

## Melhorias de UX no Assistente

1. **CTAs Diretos:** Adicionar links de ação no Drawer (ex: "Editar Vaga", "Ver Ranking") quando pendências críticas forem detectadas.
2. **Ações Compostas Expandidas:** Melhorar o `buildJobComposite` para que o resumo final (summaryHint) use as novas pendências estruturadas.
3. **E2E Validation:** Adicionar testes Playwright que validem a tradução real no Drawer durante o fluxo de Pipeline.
