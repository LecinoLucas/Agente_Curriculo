# PERFORMANCE-AUDIT-2 - Test Results

## Backend

Comando inicial fora da venv:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
pytest tests/unit/test_pipeline_service_board_contract.py -v --durations=10
```

Resultado:

- Falhou antes de coletar testes.
- Motivo: `ModuleNotFoundError: No module named 'sqlalchemy'`.
- Diagnostico: comando executado sem usar a venv do backend.

Comando executado com venv:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
.venv/bin/python -m pytest tests/unit/test_pipeline_service_board_contract.py -v --durations=10
```

Resultado:

- `8 passed`
- Duracao total: `2.49s`
- Slowest: `0.17s setup` no primeiro teste.
- Warnings: 3 warnings de Pydantic deprecated config.

Cobertura do teste:

- Contrato de truncamento do board.
- `max_rows + 1` para detectar truncamento.
- Distribuicao de candidatos em colunas.
- Campo `truncated` no response.

## Frontend

Comando:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npm run test -- --run PipelinePage --reporter=verbose
```

Resultado:

- `43 passed`
- `1` arquivo de teste passou.
- Duracao total: `2.52s`

Warnings observados:

- Warnings React de `act(...)` em `PipelinePage`.
- Warnings React de `act(...)` em `Tooltip`.

Observacao relevante:

- O teste existente `21. Mover etapa ainda chama refreshBoard apos mutacao bem-sucedida` confirma o comportamento auditado como risco de performance. Hoje ele protege a existencia do reload; em fase de correcao esse teste deve ser atualizado para o novo contrato.

## Busca estatica

Comando:

```bash
rg -n "performance|durations|benchmark|pytest.mark.slow|slow|query_timing|ranking.query_timing|board.query_timing" backend/tests frontend/src backend/src
```

Resultado:

- Encontrados logs de timing em:
  - `pipeline.board.query_timing`
  - `pipeline.ranking.query_timing`
  - `candidate_summaries.query_timing`
- Encontrados testes `slow` em areas de integracao/e2e.
- Nao foi encontrada suite dedicada de benchmark/budget para performance de telas criticas.

## Limitacoes

- Nao foi executado teste com massa realista de dados.
- Nao foi medido payload real via navegador/devtools.
- Nao foi iniciado ambiente completo com banco local populado.
- Auditoria foi estatica mais regressao leve, adequada para identificar pontos de correcao antes de otimizar.
